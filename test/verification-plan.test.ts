import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {planForEvent, readChangedPaths, selectVerification} from '../scripts/ci/verification-plan.ts';

test('full verification includes the project-folder and Git panel browser tests', () => {
    // Git package bumps change package.json, which has no narrower rule, so they always run these tests.
    assert.ok(selectVerification(['package.json']).checks.includes('git-browser'));
    assert.ok(selectVerification([]).checks.includes('git-browser'));
});

test('documentation, isolated package tests and multiple areas select distinct checks', () => {
    assert.deepEqual(selectVerification(['README.ja.md', 'docs/gui-integration/README.md']).checks, ['documentation']);
    assert.deepEqual(selectVerification(['README.md'], true).checks, ['documentation', 'site-build']);
    assert.deepEqual(selectVerification(['packages/editor-views/test/code-session.test.ts']).checks, ['views-unit']);
    const plan = selectVerification([
        'packages/editor-views/index.ts',
        'packages/editor-backpack/test/script.test.ts',
        'test/e2e/extension-loader/catalog-authoring.spec.cts'
    ]);
    assert.equal(plan.mode, 'scoped');
    assert.deepEqual(plan.areas, ['backpack-tests', 'extension-loader-tests', 'views']);
    assert.deepEqual(plan.checks, ['typecheck', 'views-unit', 'backpack-unit', 'gui-integration',
        'site-build', 'code-windows-browser', 'editor-browser', 'extension-loader-browser']);
});

test('pins, shared infrastructure, unknown paths and empty diffs plan a full run', () => {
    for (const path of ['site/source.json', 'package-lock.json', 'packages/editor-views/package.json',
        '.github/workflows/ci.yml', 'site/gui-integration/index.ts', 'docs/tool.sh', 'unclassified.txt']) {
        const plan = selectVerification(['README.md', path]);
        assert.equal(plan.mode, 'full', path);
        assert.equal(plan.reason, 'unclassified-path', path);
        assert.ok(plan.checks.includes('extension-host'));
        assert.ok(plan.checks.includes('extension-loader-browser'));
    }
    assert.equal(selectVerification([]).reason, 'empty-diff');
});

test('malformed and non-regular Git records cannot be classified', () => {
    assert.throws(() => readChangedPaths(Buffer.from(':100644 120000 abc1234 abc5678 T\0docs/link.md\0')));
    assert.throws(() => readChangedPaths(Buffer.from(':000000 100644 0000000 abc5678 A\0README.md')));
    assert.throws(() => readChangedPaths(Buffer.from([0xff, 0])));
});

test('the PR merge candidate is compared to its exact base and a rename covers both areas', t => {
    const cwd = mkdtempSync(join(tmpdir(), 'verification-plan-'));
    t.after(() => rmSync(cwd, {recursive: true, force: true}));
    const git = (args: string[]) => execFileSync('git', args, {cwd, stdio: ['ignore', 'pipe', 'pipe']});
    const head = () => git(['rev-parse', 'HEAD']).toString().trim();
    git(['init', '-q', '-b', 'main']);
    git(['config', 'user.name', 'Verification Plan Test']);
    git(['config', 'user.email', 'verification-plan@example.invalid']);
    git(['config', 'commit.gpgsign', 'false']);
    const source = 'packages/editor-views/test/sample.test.ts';
    const destination = 'packages/editor-backpack/test/sample.test.ts';
    mkdirSync(join(cwd, 'packages/editor-views/test'), {recursive: true});
    mkdirSync(join(cwd, 'packages/editor-backpack/test'), {recursive: true});
    writeFileSync(join(cwd, source), 'const value = 1;\n');
    git(['add', '--', source]);
    git(['commit', '-qm', 'Base']);
    git(['switch', '-qc', 'topic']);
    renameSync(join(cwd, source), join(cwd, destination));
    git(['add', '-A']);
    git(['commit', '-qm', 'Rename test']);
    const topic = head();
    git(['switch', '-q', 'main']);
    writeFileSync(join(cwd, 'README.md'), '# Main changed\n');
    git(['add', 'README.md']);
    git(['commit', '-qm', 'Advance base']);
    const base = head();
    git(['merge', '-q', '--no-ff', '-m', 'Merge candidate', topic]);
    const revision = head();
    const event = {pull_request: {base: {sha: base}, head: {sha: topic}}};
    const plan = planForEvent('pull_request', event, revision, git);
    assert.equal(plan.mode, 'scoped');
    assert.deepEqual([...plan.paths].sort(), [destination, source]);
    assert.deepEqual(plan.checks, ['views-unit', 'backpack-unit']);
    assert.equal(planForEvent('pull_request', {pull_request: {base: {sha: base}, head: {sha: base}}},
        revision, git).reason, 'checkout-mismatch');

    const shallow = join(cwd, 'shallow');
    git(['clone', '-q', '--depth=1', '--branch', 'main', pathToFileURL(cwd).href, shallow]);
    const shallowGit = (args: string[]) =>
        execFileSync('git', args, {cwd: shallow, stdio: ['ignore', 'pipe', 'pipe']});
    assert.throws(() => shallowGit(['cat-file', '-e', `${base}^{commit}`]));
    assert.deepEqual(planForEvent('pull_request', event, revision, shallowGit), plan);

    const push = planForEvent('push', {ref: 'refs/heads/main', before: base, after: revision}, revision, git);
    assert.deepEqual(push.checks, ['views-unit', 'backpack-unit', 'site-build']);

    const summary = join(cwd, 'summary.md');
    const eventPath = join(cwd, 'event.json');
    writeFileSync(eventPath, JSON.stringify(event));
    const script = new URL('../scripts/ci/verification-plan.ts', import.meta.url);
    const output = execFileSync(process.execPath, [fileURLToPath(script)], {cwd, env: {...process.env,
        GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: eventPath, GITHUB_SHA: revision,
        GITHUB_STEP_SUMMARY: summary}, encoding: 'utf8'});
    assert.deepEqual(JSON.parse(output), plan);
    assert.match(readFileSync(summary, 'utf8'), /observation only[\s\S]*Checks: views-unit, backpack-unit/);
});

test('stale checkout, missing commits and unavailable diffs fall back to full', () => {
    const revision = 'a'.repeat(40);
    const base = 'b'.repeat(40);
    const event = {ref: 'refs/heads/main', before: base, after: revision};
    assert.equal(planForEvent('push', event, revision, () => Buffer.from(base)).reason, 'checkout-mismatch');
    assert.equal(planForEvent('push', {...event, before: '0'.repeat(40)}, revision,
        () => assert.fail('must not call Git')).reason, 'invalid-revisions');
    for (const failAt of ['fetch', 'diff']) {
        const calls = [];
        const plan = planForEvent('push', event, revision, args => {
            calls.push(args[0]);
            if (args[0] === 'rev-parse') return Buffer.from(revision);
            if (args[0] === 'cat-file' || args[0] === failAt) throw new Error('not available');
            return Buffer.alloc(0);
        });
        assert.ok(calls.includes(failAt));
        assert.equal(plan.mode, 'full');
        assert.equal(plan.reason, 'diff-unavailable');
    }
});
