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

test('documentation needs only Git and a selected browser suite pulls in its build prerequisites', () => {
    assert.deepEqual(select(scoped(['documentation'])), {
        mode: 'scoped', reason: 'matched-paths', base, checks: ['documentation'], reused: [],
        needsNpm: false, needsGui: false, needsBrowser: false
    });
    const browser = select(scoped(['layout-browser']));
    assert.deepEqual(browser.checks, ['layout-browser', 'site-build']);
    assert.ok(browser.needsNpm && browser.needsGui && browser.needsBrowser);
});

test('main runs missing items and its own build even if supplied matching evidence for the build', () => {
    const plan = scoped(['typecheck', 'unit', 'editor-browser', 'site-build']);
    const execution = select(plan, {main: true, evidence: {reason: 'verified-items',
        reusable: ['typecheck', 'editor-browser', 'site-build', 'layout-unit']}});
    assert.deepEqual(execution.reused, ['typecheck', 'editor-browser']);
    assert.deepEqual(execution.checks, ['unit', 'site-build']);
    assert.equal(execution.needsBrowser, false);
    assert.equal(execution.needsGui, true);

    const partial = select(plan, {main: true, evidence: {reason: 'verified-items', reusable: ['typecheck']}});
    assert.deepEqual(partial.checks, ['unit', 'editor-browser', 'site-build']);
    assert.equal(partial.needsBrowser, true);
});

test('missing, mismatched or unavailable evidence returns main to full verification', () => {
    const plan = scoped(['views-unit', 'site-build']);
    for (const reason of [undefined, 'no-verified-pr-run', 'missing-compatible-evidence', 'invalid-evidence',
        'unverified-attempt', 'evidence-unavailable']) {
        assert.deepEqual(select(plan, {main: true, evidence: reason && {reason, reusable: ['views-unit']}}),
            {mode: 'full', reason: reason ?? 'missing-evidence'});
    }
});

test('the final check rejects a skipped or missing selected step and incomplete release results', () => {
    const script = fileURLToPath(new URL('../scripts/ci/verification-execution.ts', import.meta.url));
    const run = (env: Record<string, string>) => spawnSync(process.execPath, [script, 'verify'], {
        encoding: 'utf8', env: {...process.env, CI_RELEASE_REVISION: '', CI_EXECUTION_MODE: 'scoped',
            CI_REQUIRED_CHECKS: '|yaml-browser|', ...env}
    });
    const passing = JSON.stringify({'yaml-roundtrip': {outcome: 'success'}, 'yaml-multi-document': {outcome: 'success'}});
    assert.equal(run({CI_STEP_OUTCOMES: passing}).status, 0);
    const skipped = run({CI_STEP_OUTCOMES: '{"yaml-roundtrip":{"outcome":"success"}}'});
    assert.notEqual(skipped.status, 0);
    assert.match(skipped.stderr, /Missing successful checks: yaml-browser/);
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
    const preflight = jobs.release.steps.findIndex(step => step.run?.includes('release-verification.ts'));
    const pack = jobs.release.steps.findIndex(step => step.id === 'pack');
    assert.ok(preflight >= 0 && preflight < pack);
    assert.equal(ci.on.workflow_call.inputs.release_revision.required, true);
    const scope = ci.jobs.check.steps.find(step => step.id === 'scope');
    assert.match(scope.if, /TW_PLUS_CI_SCOPED == '1' && inputs\.release_revision == ''/);
    const legacy = ci.jobs.check.steps.find(step => step.id === 'reuse');
    assert.match(legacy.if, /inputs\.release_revision == '' && env\.TW_PLUS_CI_SCOPED != '1'/);
    assert.match(ci.jobs.check.steps.find(step => step.id === 'tree').if, /steps\.editor-browser\.outcome == 'success'/);
});
