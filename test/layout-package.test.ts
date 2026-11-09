import assert from 'node:assert/strict';
import {test} from 'node:test';
import {attachStageInput} from '@kubohiroya/turbowarp-plus-editor-layout';
import {createSpriteInfoAdapter} from '@kubohiroya/turbowarp-plus-editor-layout/sprite-properties';
import {WindowDesktop} from '@kubohiroya/turbowarp-plus-editor-windows';
import lock from '../package-lock.json' with {type: 'json'};
import manifest from '../package.json' with {type: 'json'};

test('the Editor resolves the pinned npm layout package and its host entry points', () => {
    const name = '@kubohiroya/turbowarp-plus-editor-layout';
    const {version, resolved, integrity} = lock.packages[`node_modules/${name}`];
    assert.equal(manifest.devDependencies[name], version);
    assert.equal(resolved, `https://registry.npmjs.org/${name}/-/turbowarp-plus-editor-layout-${version}.tgz`);
    assert.match(integrity, /^sha512-[A-Za-z0-9+/]{86}==$/);
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
