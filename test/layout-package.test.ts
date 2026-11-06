import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {attachStageInput} from '@kubohiroya/turbowarp-plus-editor-layout';
import {createSpriteInfoAdapter} from '@kubohiroya/turbowarp-plus-editor-layout/sprite-properties';
import {WindowDesktop} from '@kubohiroya/turbowarp-plus-editor-layout/windows';
import lock from '../package-lock.json' with {type: 'json'};

test('the Editor resolves the pinned layout archive and its host entry points', async () => {
    const name = '@kubohiroya/turbowarp-plus-editor-layout';
    const {resolved, integrity} = lock.packages[`node_modules/${name}`];
    assert.match(resolved, /^file:vendor\/turbowarp-plus-editor-layout-[\w.-]+\.tgz$/);
    const archive = await readFile(new URL(`../${resolved.slice('file:'.length)}`, import.meta.url));
    assert.equal(integrity, `sha512-${createHash('sha512').update(archive).digest('base64')}`);
    for (const entry of [attachStageInput, createSpriteInfoAdapter, WindowDesktop]) {
        assert.equal(typeof entry, 'function');
    }
});
