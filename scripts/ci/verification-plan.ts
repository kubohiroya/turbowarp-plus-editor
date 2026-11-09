import {execFileSync} from 'node:child_process';
import {appendFileSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const allChecks = [
    'documentation', 'typecheck', 'package', 'unit', 'infrastructure',
    'views-unit', 'backpack-unit', 'extension-host',
    'gui-integration', 'script-transfer', 'project-tools', 'site-build',
    'layout-browser', 'code-windows-browser', 'yaml-browser', 'editor-browser', 'extension-loader-browser', 'git-browser'
] as const;
type Check = typeof allChecks[number];

const rules: {area: string; path: RegExp; checks: readonly Check[]}[] = [
    {area: 'documentation', path: /^(?:README(?:\.ja)?\.md|docs\/.+\.md)$/, checks: ['documentation']},
    {area: 'views-tests', path: /^packages\/editor-views\/test\/.+\.test\.(?:ts|js|mjs)$/, checks: ['views-unit']},
    {area: 'views', path: /^packages\/editor-views\/[^/]+\.(?:[jt]sx?|css)$/,
        checks: ['typecheck', 'views-unit', 'gui-integration', 'site-build', 'code-windows-browser', 'editor-browser']},
    {area: 'backpack-tests', path: /^packages\/editor-backpack\/test\/.+\.test\.(?:ts|js|mjs)$/, checks: ['backpack-unit']},
    {area: 'backpack', path: /^packages\/editor-backpack\/[^/]+\.[jt]sx?$/,
        checks: ['typecheck', 'backpack-unit', 'gui-integration', 'script-transfer', 'site-build',
            'code-windows-browser', 'editor-browser']},
    {area: 'project-tools-tests', path: /^test\/project-tools\/.+\.test\.(?:ts|cts|[cm]js)$/, checks: ['project-tools']},
    {area: 'extension-loader-tests', path: /^test\/e2e\/extension-loader\/.+\.spec\.cts$/,
        checks: ['site-build', 'extension-loader-browser']}
];

function fullPlan(reason: string, paths: readonly string[] = []) {
    return {mode: 'full', reason, areas: [], checks: allChecks, paths} as const;
}

export function selectVerification(paths: readonly string[], mainPush = false) {
    if (!paths.length) return fullPlan('empty-diff');
    const areas = new Set<string>();
    const checks = new Set<Check>();
    for (const path of paths) {
        // The allowlist is deliberately narrow. Dependency, workflow and shared host paths
        // fall back to full verification until their impact can be mapped.
        const rule = rules.find(candidate => candidate.path.test(path));
        if (!rule) return fullPlan('unclassified-path', paths);
        areas.add(rule.area);
        for (const check of rule.checks) checks.add(check);
    }
    // Pages still needs a build carrying the main commit's own revision.
    if (mainPush) checks.add('site-build');
    return {mode: 'scoped', reason: 'matched-paths', areas: [...areas].sort(),
        checks: allChecks.filter(check => checks.has(check)), paths} as const;
}

const isSha = (value: unknown): value is string =>
    typeof value === 'string' && /^[0-9a-f]{40}$/.test(value) && /[1-9a-f]/.test(value);
const utf8 = new TextDecoder('utf-8', {fatal: true});

export function readChangedPaths(diff: Buffer): string[] {
    if (!diff.length) return [];
    const fields = utf8.decode(diff).split('\0');
    if (fields.pop() !== '' || fields.length % 2) throw new Error('Incomplete Git diff');
    const paths = [];
    for (let i = 0; i < fields.length; i += 2) {
        // Renames are disabled, so both paths appear as separate deletion/addition records.
        // Unusual file types, including links and submodules, need full verification.
        const regularFile = /^:(?:000000|100644|100755) (?:000000|100644|100755) [a-f0-9]+ [a-f0-9]+ [ADM]$/;
        if (!regularFile.test(fields[i]) || !fields[i + 1]) throw new Error('Unsupported Git diff record');
        paths.push(fields[i + 1]);
    }
    return paths;
}

type Event = {ref?: string; before?: string; after?: string;
    pull_request?: {base?: {sha?: string}; head?: {sha?: string}}};
type Git = (args: string[]) => Buffer;

export function planForEvent(eventName: string | undefined, event: Event, revision: string | undefined, git: Git) {
    const mainPush = eventName === 'push' && event.ref === 'refs/heads/main';
    if (eventName !== 'pull_request' && !mainPush) return fullPlan('unsupported-event');
    const base = mainPush ? event.before : event.pull_request?.base?.sha;
    if (!isSha(revision) || !isSha(base)) return fullPlan('invalid-revisions');

    try {
        if (git(['rev-parse', 'HEAD']).toString().trim() !== revision) return fullPlan('checkout-mismatch');
        if (mainPush) {
            if (event.after !== revision) return fullPlan('checkout-mismatch');
        } else {
            // Read the commit headers directly because checkout may be shallow.
            const headers = git(['cat-file', 'commit', revision]).toString().split('\n\n', 1)[0];
            const parents = [...headers.matchAll(/^parent ([a-f0-9]{40})$/gm)].map(match => match[1]);
            const head = event.pull_request?.head?.sha;
            if (!isSha(head) || parents.length !== 2 || parents[0] !== base || parents[1] !== head) {
                return fullPlan('checkout-mismatch');
            }
        }

        try {
            git(['cat-file', '-e', `${base}^{commit}`]);
        } catch {
            git(['fetch', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', '--depth=1', 'origin', base]);
        }
        const diff = git(['diff', '--raw', '--no-renames', '--no-ext-diff', '--ignore-submodules=none',
            '-z', base, revision, '--']);
        return {...selectVerification(readChangedPaths(diff), mainPush), base};
    } catch {
        return fullPlan('diff-unavailable');
    }
}

export function readVerificationPlan(env = process.env) {
    const {GITHUB_EVENT_NAME, GITHUB_EVENT_PATH, GITHUB_SHA} = env;
    try {
        const event = JSON.parse(readFileSync(GITHUB_EVENT_PATH ?? '', 'utf8')) as Event;
        return planForEvent(GITHUB_EVENT_NAME, event, GITHUB_SHA, args => execFileSync('git', args, {
            timeout: 15_000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
            env: {...process.env, GIT_TERMINAL_PROMPT: '0'}
        }));
    } catch {
        return fullPlan('event-unavailable');
    }
}

function recordPlan() {
    const {GITHUB_STEP_SUMMARY} = process.env;
    const plan = readVerificationPlan();
    console.log(JSON.stringify(plan));
    if (GITHUB_STEP_SUMMARY) {
        const lines = [
            '## Proposed verification plan (observation only)', '',
            `- Mode: \`${plan.mode}\``, `- Reason: \`${plan.reason}\``,
            `- Areas: ${plan.areas.join(', ') || 'all'}`,
            `- Checks: ${plan.checks.join(', ')}`, ''
        ];
        appendFileSync(GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) recordPlan();
