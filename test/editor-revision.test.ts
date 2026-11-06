import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

const expected = 'a'.repeat(40);
const stale = 'b'.repeat(40);
const root = path.resolve(import.meta.dirname, '..');

function run(script: string, args: string[], expectedRevision = expected) {
    return spawnSync(process.execPath, [script, ...args], {
        cwd: root, encoding: 'utf8', timeout: 10_000,
        env: {...process.env, E2E_EXPECT_SITE_REVISION: expectedRevision, TW151_CHROME: '/missing/chromium'}
    });
}

test('code-window runner rejects missing and stale Web metadata before Chromium starts', async t => {
    const directory = await mkdtemp(path.join(tmpdir(), 'tw-editor-revision-'));
    t.after(() => rm(directory, {recursive: true, force: true}));
    const script = 'test/stage6/code-windows.ts';
    const filename = path.join(directory, 'build-info.json');
    const missing = run(script, [directory]);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, new RegExp(`expected ${expected}, actual unavailable`));
    await writeFile(filename, JSON.stringify({siteRevision: stale}));
    const mismatch = run(script, [directory]);
    assert.equal(mismatch.status, 1);
    assert.ok(mismatch.stderr.includes(filename));
    assert.ok(mismatch.stderr.includes(expected) && mismatch.stderr.includes(stale));
    const unspecified = run(script, [directory], '');
    assert.equal(unspecified.status, 1);
    assert.match(unspecified.stderr, /Set E2E_EXPECT_SITE_REVISION to a full Editor SHA/);
});

test('Desktop preflight reads the metadata from the selected packed renderer', async t => {
    const app = await mkdtemp(path.join(tmpdir(), 'tw-desktop-revision-'));
    t.after(() => rm(app, {recursive: true, force: true}));
    const resources = path.join(app, 'Contents/Resources');
    await mkdir(resources, {recursive: true});
    const old = Buffer.from(JSON.stringify({editorRevision: stale}));
    const current = Buffer.from(JSON.stringify({editorRevision: expected}));
    const header = Buffer.from(JSON.stringify({files: {'dist-renderer-webpack': {files: {editor: {files: {
        gui: {files: {'build-info.json': {offset: '0', size: old.length}}},
        'plus-gui': {files: {'build-info.json': {offset: String(old.length), size: current.length}}}
    }}}}}}));
    const padding = Buffer.alloc((4 - header.length % 4) % 4);
    const prefix = Buffer.alloc(16);
    prefix.writeUInt32LE(4, 0);
    prefix.writeUInt32LE(8 + header.length + padding.length, 4);
    prefix.writeUInt32LE(4 + header.length + padding.length, 8);
    prefix.writeUInt32LE(header.length, 12);
    await writeFile(path.join(resources, 'app.asar'), Buffer.concat([prefix, header, padding, old, current]));

    const accepted = run('scripts/desktop/check-editor-revision.ts', [app]);
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.match(accepted.stdout, new RegExp(`plus-gui/build-info.json: expected ${expected}, actual "${expected}"`));
    const rejected = run('test/stage3/check-desktop.ts', [app, '--code-popout']);
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, new RegExp(`/gui/build-info.json: expected ${expected}, actual "${stale}"`));
});
