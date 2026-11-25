import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {parse} from 'yaml';
import {requireReleaseVerification} from '../scripts/ci/release-verification.ts';
import {selectExecution} from '../scripts/ci/verification-execution.ts';

const base = 'b'.repeat(40);
const revision = 'a'.repeat(40);
const scoped = (checks: string[]) => ({mode: 'scoped', reason: 'matched-paths', checks, base});
const select = (plan, options = {}) => selectExecution({enabled: true, release: false, main: false, plan, ...options});

test('flag off selects legacy and stable releases select full verification regardless of the flag', () => {
    const plan = scoped(['documentation']);
    assert.equal(select(plan, {enabled: false}).mode, 'legacy');
    assert.equal(select(plan, {enabled: false, main: true}).mode, 'legacy');
    for (const enabled of [true, false]) {
        assert.deepEqual(select(plan, {enabled, release: true}), {mode: 'full', reason: 'stable-release'});
    }
    assert.deepEqual(select({mode: 'full', reason: 'unclassified-path', checks: []}),
        {mode: 'full', reason: 'unclassified-path'});
});

test('documentation needs only Git and a selected GUI check needs npm and the GUI', () => {
    assert.deepEqual(select(scoped(['documentation'])), {
        mode: 'scoped', reason: 'matched-paths', base, checks: ['documentation'], reused: [],
        needsNpm: false, needsGui: false
    });
    const gui = select(scoped(['gui-integration']));
    assert.deepEqual(gui.checks, ['gui-integration']);
    assert.ok(gui.needsNpm && gui.needsGui);
});

test('main runs missing items and its own build even if supplied matching evidence for the build', () => {
    const plan = scoped(['typecheck', 'unit', 'gui-integration', 'site-build']);
    const execution = select(plan, {main: true, evidence: {reason: 'verified-items',
        reusable: ['typecheck', 'gui-integration', 'site-build', 'project-tools']}});
    assert.deepEqual(execution.reused, ['typecheck', 'gui-integration']);
    assert.deepEqual(execution.checks, ['unit', 'site-build']);
    assert.equal(execution.needsGui, true);

    const partial = select(plan, {main: true, evidence: {reason: 'verified-items', reusable: ['typecheck']}});
    assert.deepEqual(partial.checks, ['unit', 'gui-integration', 'site-build']);
});

test('missing, mismatched or unavailable evidence returns main to full verification', () => {
    const plan = scoped(['project-tools', 'site-build']);
    for (const reason of [undefined, 'no-verified-pr-run', 'missing-compatible-evidence', 'invalid-evidence',
        'unverified-attempt', 'evidence-unavailable']) {
        assert.deepEqual(select(plan, {main: true, evidence: reason && {reason, reusable: ['project-tools']}}),
            {mode: 'full', reason: reason ?? 'missing-evidence'});
    }
});

test('an allowlisted main push can reuse every non-build check from the exact successful PR tree', () => {
    const plan = {...scoped(['documentation', 'site-build']), mode: 'full', exactMainReuse: true};
    const reusable = ['typecheck', 'package', 'unit', 'infrastructure', 'extension-host', 'gui-integration', 'project-tools'];
    const evidence = {reason: 'verified-items', reusable};
    const options = {enabled: false, main: true, exactMain: true, evidence};
    assert.deepEqual(select(plan, options), {
        mode: 'scoped', reason: 'exact-main-tree', base, checks: ['documentation', 'site-build'],
        reused: reusable, needsNpm: true, needsGui: true
    });
    assert.equal(select(plan, {...options, main: false}).mode, 'legacy');
    assert.equal(select(plan, {...options, exactMain: false}).mode, 'legacy');
    assert.equal(select({...plan, exactMainReuse: false}, options).mode, 'legacy');
    assert.equal(select(plan, {...options, release: true}).reason, 'stable-release');
    assert.deepEqual(select(plan, {...options, evidence: undefined}), {mode: 'full', reason: 'missing-evidence'});
    assert.deepEqual(select(plan, {...options, evidence: {reason: 'verified-items', reusable: reusable.slice(1)}}),
        {mode: 'full', reason: 'incomplete-exact-tree-evidence'});
    assert.deepEqual(select(plan, {...options, evidence: {reason: 'invalid-evidence', reusable}}),
        {mode: 'full', reason: 'invalid-evidence'});
});

test('the final check rejects a skipped or missing selected step and incomplete release results', () => {
    const script = fileURLToPath(new URL('../scripts/ci/verification-execution.ts', import.meta.url));
    const run = (env: Record<string, string>) => spawnSync(process.execPath, [script, 'verify'], {
        encoding: 'utf8', env: {...process.env, CI_RELEASE_REVISION: '', CI_EXECUTION_MODE: 'scoped',
            CI_REQUIRED_CHECKS: '|typecheck|unit|', ...env}
    });
    const passing = JSON.stringify({typecheck: {outcome: 'success'}, 'unit-tests': {outcome: 'success'}});
    assert.equal(run({CI_STEP_OUTCOMES: passing}).status, 0);
    const skipped = run({CI_STEP_OUTCOMES: '{"typecheck":{"outcome":"success"}}'});
    assert.notEqual(skipped.status, 0);
    assert.match(skipped.stderr, /Missing successful checks: unit/);
    const incomplete = run({CI_RELEASE_REVISION: revision, CI_STEP_OUTCOMES: passing});
    assert.notEqual(incomplete.status, 0);
    assert.match(incomplete.stderr, /Missing successful checks:.*site-build/);
});

test('publication refuses stable tags without successful verification of their matching revision', () => {
    const release = {tag: 'v1.2.3', version: '1.2.3', revision, result: 'success'};
    assert.doesNotThrow(() => requireReleaseVerification(release));
    for (const result of ['failure', 'cancelled', 'skipped', '']) {
        assert.throws(() => requireReleaseVerification({...release, result}), /successful full verification/);
    }
    assert.throws(() => requireReleaseVerification({...release, tag: 'v1.2.4'}), /does not match/);
    assert.throws(() => requireReleaseVerification({...release, revision: 'main'}), /does not match/);
    assert.throws(() => requireReleaseVerification({tag: 'v1.2.3+build-name', version: '1.2.3+build-name',
        revision, result: 'skipped'}), /successful full verification/);
    assert.doesNotThrow(() => requireReleaseVerification({tag: 'v1.2.3-rc.1', version: '1.2.3-rc.1',
        revision, result: 'skipped'}));
});

test('the stable release publisher is gated by a full check of the tagged commit', () => {
    const read = name => parse(readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8'));
    const ci = read('ci');
    const {jobs} = read('release');
    assert.equal(jobs['verify-stable'].uses, './.github/workflows/ci.yml');
    assert.equal(jobs['verify-stable'].with.release_revision, '${{ github.sha }}');
    assert.equal(jobs.release.needs, 'verify-stable');
    assert.match(jobs.release.if, /needs\.verify-stable\.result == 'success'/);
    assert.match(jobs.release.if, /needs\.verify-stable\.result == 'skipped'/);
    for (const [command, check] of [['npm test', 'unit-tests'], ['npm run test:e2e:infrastructure', 'infrastructure-tests']]) {
        assert.equal(ci.jobs.check.steps.find(step => step.id === check)?.run, command);
        const repeated = jobs.release.steps.filter(step => step.run === command);
        assert.equal(repeated.length, 1);
        assert.equal(repeated[0].if, "needs.verify-stable.result == 'skipped'");
    }
    const preflight = jobs.release.steps.findIndex(step => step.run?.includes('release-verification.ts'));
    const pack = jobs.release.steps.findIndex(step => step.id === 'pack');
    assert.ok(preflight >= 0 && preflight < pack);
    assert.equal(ci.on.workflow_call.inputs.release_revision.required, true);
    const scope = ci.jobs.check.steps.find(step => step.id === 'scope');
    assert.match(scope.if, /inputs\.release_revision == ''/);
    assert.match(scope.if, /github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
    assert.match(scope.if, /TW_PLUS_CI_EXACT_MAIN_REUSE != '0'/);
    const outcomes = ci.jobs.check.steps.find(step => step.name === 'Require all selected verification to pass');
    assert.match(outcomes.if, /inputs\.release_revision != ''/);
    assert.match(outcomes.if, /steps\.scope\.outputs\.mode == 'scoped'/);
});

test('no workflow installs a browser or runs browser tests: those run locally during development', () => {
    const directory = new URL('../.github/workflows/', import.meta.url);
    for (const name of ['ci', 'pages', 'release']) {
        const text = readFileSync(new URL(`${name}.yml`, directory), 'utf8');
        assert.doesNotMatch(text, /playwright|\.browser\.ts|test:e2e:(?!infrastructure)|test:yaml:/, name);
    }
});
