import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {test} from 'node:test';
import {attachStageInput} from '@kubohiroya/turbowarp-plus-editor-workbench';
import {createSpriteInfoAdapter} from '@kubohiroya/turbowarp-plus-editor-sprite-panes/sprite-properties';
import {WindowDesktop} from '@kubohiroya/turbowarp-plus-editor-windows';
import lock from '../package-lock.json' with {type: 'json'};
import manifest from '../package.json' with {type: 'json'};

test('the Editor resolves the pinned layout package and its host entry points', () => {
    const name = '@kubohiroya/turbowarp-plus-editor-workbench';
    const {version, resolved, integrity} = lock.packages[`node_modules/${name}`];
    assert.match(integrity, /^sha512-[A-Za-z0-9+/]{86}==$/);
    assert.equal(manifest.devDependencies[name], version);
    assert.equal(resolved, `https://registry.npmjs.org/${name}/-/turbowarp-plus-editor-workbench-${version}.tgz`);
    for (const entry of [attachStageInput, createSpriteInfoAdapter]) {
        assert.equal(typeof entry, 'function');
    }
});

test('the Editor resolves the pinned npm windows package split out of the layout', () => {
    const name = '@kubohiroya/turbowarp-plus-editor-windows';
    const {version, resolved} = lock.packages[`node_modules/${name}`];
    assert.equal(manifest.devDependencies[name], version);
    assert.equal(resolved, `https://registry.npmjs.org/${name}/-/turbowarp-plus-editor-windows-${version}.tgz`);
    assert.equal(typeof WindowDesktop, 'function');
});

test('the Editor resolves the pinned sprite-panes package split out of the layout', () => {
    const name = '@kubohiroya/turbowarp-plus-editor-sprite-panes';
    const {version, resolved} = lock.packages[`node_modules/${name}`];
    assert.equal(manifest.devDependencies[name], version);
    assert.equal(resolved, `https://registry.npmjs.org/${name}/-/turbowarp-plus-editor-sprite-panes-${version}.tgz`);
});

test('the Editor installs no package from a .tgz archive outside npm and keeps none in the repository', () => {
    // Bundling package .tgz files is not allowed: publish to npm and pin the published version instead.
    const deps = manifest as unknown as Record<string, Record<string, string> | undefined>;
    const specs = Object.entries({...deps.dependencies, ...deps.devDependencies, ...deps.optionalDependencies});
    assert.deepEqual(specs.filter(([, spec]) => /\.tgz$/u.test(spec)), []);
    const local = Object.entries(lock.packages as Record<string, {resolved?: unknown}>).filter(([, entry]) => typeof entry.resolved === 'string' &&
        entry.resolved.endsWith('.tgz') && !entry.resolved.startsWith('https://registry.npmjs.org/'));
    assert.deepEqual(local.map(([name]) => name), []);
    const tracked = execFileSync('git', ['ls-files', '*.tgz'], {cwd: new URL('..', import.meta.url), encoding: 'utf8'}).trim();
    assert.equal(tracked, '');
});
