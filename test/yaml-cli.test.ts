import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

test('the npm-style symlink entry invokes CLI argument validation', async t => {
    const directory = await mkdtemp(path.join(tmpdir(), 'twpe-cli-entry-'));
    t.after(() => rm(directory, {recursive: true, force: true}));
    const entry = path.join(directory, 'editor command');
    await symlink(fileURLToPath(new URL('../scripts/yaml-editor/cli.ts', import.meta.url)), entry);
    const result = spawnSync(process.execPath, [entry, '--unknown'], {encoding: 'utf8'});
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Use --site-dir DIR/);
});
