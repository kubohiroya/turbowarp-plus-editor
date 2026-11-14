import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
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
    if (resolved.startsWith('file:')) {
        assert.equal(resolved, `file:vendor/kubohiroya-turbowarp-plus-editor-workbench-${version}.tgz`);
        assert.equal(manifest.devDependencies[name], resolved);
        const archive = readFileSync(new URL(`../${resolved.slice(5)}`, import.meta.url));
        assert.equal(integrity, `sha512-${createHash('sha512').update(archive).digest('base64')}`);
    } else {
        assert.equal(manifest.devDependencies[name], version);
        assert.equal(resolved, `https://registry.npmjs.org/${name}/-/turbowarp-plus-editor-workbench-${version}.tgz`);
    }
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
    const {version, resolved, integrity} = lock.packages[`node_modules/${name}`];
    assert.equal(resolved, `file:vendor/kubohiroya-turbowarp-plus-editor-sprite-panes-${version}.tgz`);
    assert.equal(manifest.devDependencies[name], resolved);
    const archive = readFileSync(new URL(`../${resolved.slice(5)}`, import.meta.url));
    assert.equal(integrity, `sha512-${createHash('sha512').update(archive).digest('base64')}`);
});
