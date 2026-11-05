import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {inspectEvidence, recordEvidence, verificationContract} from '../scripts/ci/verification-evidence.ts';

const repository = 'owner/editor';
const tree = 'b'.repeat(40);
const contract = 'c'.repeat(64);
const runId = 7;
const attempt = 2;
const evidence = recordEvidence({tree, contract, runId, attempt, steps: {
    typecheck: {outcome: 'success'},
    'unit-tests': {outcome: 'success'},
    'site-build': {outcome: 'success'}
}});
const run = {id: runId, run_attempt: attempt, event: 'pull_request', status: 'completed', conclusion: 'success',
    path: '.github/workflows/ci.yml', repository: {full_name: repository}, head_repository: {full_name: repository}};
const name = `ci-verification-${tree}-${contract}-${attempt}`;
const artifact = {name, expired: false, size_in_bytes: 500};
const marker = {name: `ci-verified-tree-${tree}`, expired: false, workflow_run: {id: runId}};

function inspect(options = {} as {
    source?: Record<string, unknown>; latest?: Record<string, unknown>; markers?: unknown[];
    artifacts?: unknown[]; read?: (id: number, artifactName: string) => Promise<unknown>;
}) {
    let requests = 0;
    return inspectEvidence({
        repository, tree, contract,
        get: async path => {
            if (path.startsWith('artifacts?')) return {artifacts: options.markers ?? [marker]};
            if (path.startsWith(`runs/${runId}/artifacts?`)) return {artifacts: options.artifacts ?? [artifact]};
            assert.equal(path, `runs/${runId}`);
            return ++requests === 3 ? options.latest ?? run : options.source ?? run;
        },
        read: options.read ?? (async (id, artifactName) => {
            assert.equal(id, runId);
            assert.equal(artifactName, name);
            return evidence;
        })
    });
}

test('the contract changes with workflow commands, runtime or runner identity', () => {
    const a = verificationContract(Buffer.from('run: npm test'), ['v26', 'Linux', 'X64']);
    assert.equal(a, verificationContract(Buffer.from('run: npm test'), ['v26', 'Linux', 'X64']));
    assert.notEqual(a, verificationContract(Buffer.from('run: npm run typecheck'), ['v26', 'Linux', 'X64']));
    assert.notEqual(a, verificationContract(Buffer.from('run: npm test'), ['v27', 'Linux', 'X64']));
});

test('records successful outcomes only and requires every step in a combined check', () => {
    const recorded = recordEvidence({tree, contract, runId, attempt, steps: {
        typecheck: {outcome: 'success'},
        'unit-tests': {outcome: 'skipped'},
        'editor-browser': {outcome: 'failure'},
        'yaml-roundtrip': {outcome: 'success'},
        'host-integration': {outcome: 'success'}
    }});
    assert.deepEqual(recorded.checks, ['typecheck', 'extension-host', 'gui-integration', 'script-transfer', 'project-tools']);
    assert.ok(recordEvidence({tree, contract, runId, attempt, steps: {
        'yaml-roundtrip': {outcome: 'success'}, 'yaml-multi-document': {outcome: 'success'}
    }}).checks.includes('yaml-browser'));
});

test('matches individual checks and retains the main build and unverified checks', async () => {
    const report = await inspect();
    assert.equal(report.reason, 'verified-items');
    assert.deepEqual(report.reusable, ['typecheck', 'unit']);
    assert.ok(report.runLocally.includes('site-build'));
    assert.ok(report.runLocally.includes('layout-browser'));
    assert.ok(!report.runLocally.includes('typecheck'));
});

test('absent, expired, old or ambiguous artifacts leave all checks to run', async () => {
    for (const artifacts of [[], [{...artifact, expired: true}], [{...artifact, name: marker.name}],
        [{...artifact, name: name.replace(/-2$/, '-1')}], [artifact, artifact]]) {
        const report = await inspect({artifacts, read: async () => assert.fail('must not download')});
        assert.equal(report.reason, 'missing-compatible-evidence');
        assert.deepEqual(report.reusable, []);
        assert.ok(report.runLocally.includes('typecheck'));
    }
    assert.equal((await inspect({markers: []})).reason, 'no-verified-pr-run');
});

test('malformed, mismatched and unavailable evidence cannot be reused', async () => {
    for (const patch of [{schema: 0}, {tree: 'a'.repeat(40)}, {contract: 'd'.repeat(64)}, {runId: 8}, {attempt: 1},
        {checks: ['unrecognized']}, {checks: ['typecheck', 'typecheck']}, {checks: ['typecheck', null]}]) {
        const report = await inspect({read: async () => ({...evidence, ...patch})});
        assert.equal(report.reason, 'invalid-evidence', JSON.stringify(patch));
        assert.deepEqual(report.reusable, []);
    }
    assert.equal((await inspect({read: async () => { throw new Error('download unavailable'); }})).reason,
        'evidence-unavailable');
});

test('forks, failures, and stale attempts are rejected even if a marker exists', async () => {
    for (const source of [{...run, head_repository: {full_name: 'fork/editor'}},
        {...run, conclusion: 'failure'}, {...run, status: 'in_progress'}]) {
        assert.deepEqual((await inspect({source})).reusable, []);
    }
    assert.equal((await inspect({latest: {...run, run_attempt: 3, status: 'in_progress'}})).reason,
        'unverified-attempt');
});

test('the workflow command writes a manifest and attempt-specific artifact name', t => {
    const directory = mkdtempSync(join(tmpdir(), 'ci-evidence-test-'));
    t.after(() => rmSync(directory, {recursive: true, force: true}));
    const output = join(directory, 'output');
    const summary = join(directory, 'summary');
    const script = fileURLToPath(new URL('../scripts/ci/verification-evidence.ts', import.meta.url));
    const stdout = execFileSync(process.execPath, [script, 'record'], {encoding: 'utf8',
        env: {...process.env, RUNNER_TEMP: directory, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary,
            GITHUB_RUN_ID: String(runId),
            GITHUB_RUN_ATTEMPT: String(attempt), CI_STEP_OUTCOMES: '{"typecheck":{"outcome":"success"}}'}});
    const recorded = JSON.parse(readFileSync(join(directory, 'verification-evidence.json'), 'utf8'));
    assert.deepEqual(JSON.parse(stdout), recorded);
    assert.deepEqual(recorded.checks, ['typecheck']);
    assert.match(readFileSync(output, 'utf8'), /^artifact=ci-verification-[a-f0-9]{40}-[a-f0-9]{64}-2\n$/);
    assert.match(readFileSync(summary, 'utf8'), /Checks: typecheck/);
});
