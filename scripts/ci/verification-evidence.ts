import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync, lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {actionsAPI, findVerifiedRun, isVerifiedPullRequestRun} from './reuse-pr-verification.ts';

const workflow = new URL('../../.github/workflows/ci.yml', import.meta.url);
const evidenceFile = 'verification-evidence.json';
const schema = 2;
const checkSteps = {
    documentation: ['documentation'],
    typecheck: ['typecheck'],
    package: ['package-tests'],
    unit: ['unit-tests'],
    infrastructure: ['infrastructure-tests'],
    'layout-unit': ['layout-unit'],
    'views-unit': ['views-unit'],
    'backpack-unit': ['backpack-unit'],
    'pinned-gui-unit': ['pinned-gui-unit'],
    'extension-host': ['extension-host'],
    'gui-integration': ['gui-integration'],
    'script-transfer': ['script-transfer'],
    'project-tools': ['project-tools'],
    'site-build': ['site-build'],
    'layout-browser': ['layout-browser'],
    'code-windows-browser': ['code-windows-browser'],
    'yaml-browser': ['yaml-roundtrip', 'yaml-multi-document'],
    'editor-browser': ['editor-browser'],
    'extension-loader-browser': ['extension-loader-browser']
};
const checks = Object.keys(checkSteps);
export const fullChecks = checks.filter(check => check !== 'documentation');
// Pages always requires a fresh build stamped with main's own revision.
const reusableChecks = checks.filter(check => check !== 'site-build');
const maxEvidenceBytes = 16 * 1024;
const positive = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export function verificationContract(workflowBytes: Buffer, environment: readonly string[]) {
    return createHash('sha256')
        .update(JSON.stringify({schema, checkSteps, environment}))
        .update(workflowBytes)
        .digest('hex');
}

function evidenceName(tree: string) {
    if (!/^[0-9a-f]{40}$/.test(tree)) throw new Error('Invalid verification tree');
    return `ci-verification-v2-${tree}`;
}

type Step = {outcome?: string};
export function verificationOutcomes(steps: Record<string, Step>) {
    return Object.fromEntries(checks.map(check => {
        const outcomes = checkSteps[check].map(step => steps[step]?.outcome);
        const status = outcomes.includes('failure') ? 'failed' :
            outcomes.every(outcome => outcome === 'success') ? 'passed' : 'not run';
        return [check, status];
    }));
}

export function successfulChecks(steps: Record<string, Step>) {
    const outcomes = verificationOutcomes(steps);
    return checks.filter(check => outcomes[check] === 'passed');
}

export function requireCompletedChecks(required: readonly string[], steps: Record<string, Step>) {
    const passed = new Set(successfulChecks(steps));
    const missing = required.filter(check => !passed.has(check));
    if (missing.length) throw new Error(`Missing successful checks: ${missing.join(', ')}`);
}

export function recordEvidence({tree, contract, runId, attempt, steps}: {
    tree: string; contract: string; runId: number; attempt: number; steps: Record<string, Step>;
}) {
    evidenceName(tree);
    if (!/^[0-9a-f]{64}$/.test(contract) || !positive(runId) || !positive(attempt)) {
        throw new Error('Invalid verification identity');
    }
    return {schema, tree, contract, runId, attempt, checks: successfulChecks(steps)};
}

const fallback = (reason: string) => ({reason, reusable: [], runLocally: checks});
const getCandidate = (get, runId: number) => get(`runs/${runId}`);

export async function inspectEvidence({repository, tree, contract, get, read}) {
    try {
        const name = evidenceName(tree);
        const candidate = await findVerifiedRun({repository, tree, get, name});
        if (!candidate) return fallback('no-verified-pr-run');
        const {runId} = candidate;
        const run = await getCandidate(get, runId);
        if (!isVerifiedPullRequestRun(run, repository, runId) || !positive(run.run_attempt)) {
            return fallback('unverified-attempt');
        }
        const attempt = run.run_attempt;
        const listing = await get(`runs/${runId}/artifacts?name=${encodeURIComponent(name)}&per_page=20`);
        const artifacts = listing?.artifacts;
        if (!Array.isArray(artifacts) || artifacts.length !== 1 || artifacts[0].name !== name ||
            artifacts[0].expired !== false || !positive(artifacts[0].size_in_bytes) ||
            artifacts[0].size_in_bytes > maxEvidenceBytes) return fallback('missing-compatible-evidence');
        const evidence = await read(runId, name);
        if (evidence?.schema !== schema || evidence.tree !== tree || evidence.contract !== contract ||
            evidence.runId !== runId || evidence.attempt !== attempt || !Array.isArray(evidence.checks) ||
            evidence.checks.some(check => typeof check !== 'string' || !Object.hasOwn(checkSteps, check)) ||
            new Set(evidence.checks).size !== evidence.checks.length) return fallback('invalid-evidence');

        const latest = await getCandidate(get, runId);
        if (!isVerifiedPullRequestRun(latest, repository, runId) || latest.run_attempt !== attempt) {
            return fallback('unverified-attempt');
        }
        const reusable = reusableChecks.filter(check => evidence.checks.includes(check));
        return {reason: 'verified-items', runId, attempt, reusable,
            runLocally: checks.filter(check => !reusable.includes(check))};
    } catch {
        return fallback('evidence-unavailable');
    }
}

function downloadEvidence(repository: string, runId: number, name: string) {
    const directory = mkdtempSync(join(tmpdir(), 'ci-verification-'));
    try {
        execFileSync('gh', ['run', 'download', String(runId), '--repo', repository, '--name', name, '--dir', directory],
            {stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000, maxBuffer: maxEvidenceBytes});
        const file = join(directory, evidenceFile);
        const info = lstatSync(file);
        if (!info.isFile() || info.size > maxEvidenceBytes) throw new Error('Invalid evidence file');
        return JSON.parse(readFileSync(file, 'utf8'));
    } finally {
        rmSync(directory, {recursive: true, force: true});
    }
}

function currentIdentity(env: NodeJS.ProcessEnv) {
    const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {encoding: 'utf8'}).trim();
    const contract = verificationContract(readFileSync(workflow), [
        process.version, env.RUNNER_OS ?? '', env.RUNNER_ARCH ?? '', env.ImageOS ?? '', env.ImageVersion ?? ''
    ]);
    return {tree, contract};
}

export async function inspectCurrentEvidence(env = process.env) {
    const {tree, contract} = currentIdentity(env);
    const repository = env.GITHUB_REPOSITORY;
    const report = await inspectEvidence({repository, tree, contract, get: actionsAPI(repository, env.GH_TOKEN),
        read: (runId, name) => downloadEvidence(repository, runId, name)});
    return {tree, contract, ...report};
}

async function main() {
    const env = process.env;
    if (process.argv[2] === 'record') {
        const {tree, contract} = currentIdentity(env);
        const evidence = recordEvidence({tree, contract, runId: Number(env.GITHUB_RUN_ID),
            attempt: Number(env.GITHUB_RUN_ATTEMPT), steps: JSON.parse(env.CI_STEP_OUTCOMES)});
        const name = evidenceName(tree);
        writeFileSync(join(env.RUNNER_TEMP, evidenceFile), JSON.stringify(evidence) + '\n');
        appendFileSync(env.GITHUB_OUTPUT, `artifact=${name}\n`);
        console.log(JSON.stringify(evidence));
        if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, [
            '## Successful verification items', '', `- Attempt: ${evidence.attempt}`,
            `- Checks: ${evidence.checks.join(', ') || 'none'}`, ''
        ].join('\n') + '\n');
        return;
    }

    const repository = env.GITHUB_REPOSITORY;
    const report = await inspectCurrentEvidence(env);
    console.log(JSON.stringify(report));
    const server = env.GITHUB_SERVER_URL ?? 'https://github.com';
    const source = 'runId' in report ? [
        `- Source: [run ${report.runId}, attempt ${report.attempt}](` +
        `${server}/${repository}/actions/runs/${report.runId}/attempts/${report.attempt})`
    ] : [];
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, [
        '## Per-check reuse (observation only)', '', `- Reason: ${report.reason}`,
        ...source,
        `- Reusable candidates: ${report.reusable.join(', ') || 'none'}`,
        `- Needs execution on main: ${report.runLocally.join(', ')}`, ''
    ].join('\n') + '\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
