/**
 * What the pinned-GUI resolver refuses.
 *
 * The suites that compile the GUI's own source prove something only about the revision the build
 * and CI resolve. A checkout a few commits ahead renames modules those sources import, so without
 * this the run reports missing files — one per suite, naming neither revision. These cases hold the
 * drift to being named once, with both revisions in the message.
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import resolvePinnedGui from './pinned-gui.cjs';
import pins from '../site/source.json' with {type: 'json'};

const resolver = fileURLToPath(new URL('./pinned-gui.cjs', import.meta.url));
const configured = process.env.E2E_GUI_ROOT;

/** Point the resolver at one checkout for a case, and leave the run's own setting as it was. */
const pointAt = (t: {after: (restore: () => void) => void}, checkout: string) => {
    process.env.E2E_GUI_ROOT = checkout;
    t.after(() => {
        if (typeof configured === 'string') process.env.E2E_GUI_ROOT = configured;
        else delete process.env.E2E_GUI_ROOT;
    });
};
const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});

test('a checkout at another revision is named against the pin instead of being used', t => {
    const checkout = fs.mkdtempSync(path.join(os.tmpdir(), 'twplus-pinned-gui-'));
    t.after(() => fs.rmSync(checkout, {recursive: true, force: true}));
    git(checkout, 'init', '--quiet', '-b', 'main');
    fs.writeFileSync(path.join(checkout, 'package.json'), '{}');
    git(checkout, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test',
        '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', 'fixture');
    const revision = git(checkout, 'rev-parse', 'HEAD').trim();
    assert.notEqual(revision, pins.guiRevision);
    pointAt(t, checkout);
    // Both revisions, because either side can be the stale one: the checkout may need moving
    // forward, or the pin may need moving to it.
    assert.throws(() => resolvePinnedGui('probe'),
        new RegExp(`${revision}[\\s\\S]*${pins.guiRevision}`));
});

test('a directory that is no checkout of its own answers for no revision', t => {
    // `checkout-layout.test.cjs` builds exactly this to exercise module resolution alone. Its git
    // ancestor is this repository, whose HEAD is not and never will be the GUI pin.
    fs.mkdirSync(path.resolve('.host'), {recursive: true});
    const nested = fs.mkdtempSync(path.resolve('.host', 'pinned-gui-layout-'));
    t.after(() => fs.rmSync(nested, {recursive: true, force: true}));
    fs.writeFileSync(path.join(nested, 'package.json'), '{}');
    pointAt(t, nested);
    assert.equal(resolvePinnedGui('probe'), nested);
});

test('no checkout at all says what to prepare rather than resolving against nothing', t => {
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'twplus-pinned-gui-cwd-'));
    t.after(() => fs.rmSync(elsewhere, {recursive: true, force: true}));
    const {E2E_GUI_ROOT: _unset, ...environment} = process.env;
    const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(resolver)})('probe')`],
        {cwd: elsewhere, env: environment, encoding: 'utf8', timeout: 10000});
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /probe: set E2E_GUI_ROOT/);
    assert.match(result.stderr, /\.host\/scratch-gui/);
});
