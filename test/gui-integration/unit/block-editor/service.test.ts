// @ts-nocheck -- Migrated test fixture with dynamic host mocks.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import getBlockEditorService from '../../../../site/gui-integration/lib/tw-block-editor-service.ts';

test('without a supplied block editor no service or API is invented', () => {
    assert.equal(getBlockEditorService({}, undefined, null), null);
    assert.equal(getBlockEditorService({}, undefined, {}), null);
});

test('each VM keeps one host service and the host reads the latest Intl context', () => {
    let reads;
    let creations = 0;
    const integration = {blockEditor: {createService: ({getIntl}) => {
        creations++;
        reads = getIntl;
        return {api: {}};
    }}};
    const vm = {};
    const firstIntl = {locale: 'en'};
    const first = getBlockEditorService(vm, firstIntl, integration);
    assert.equal(reads(), firstIntl);
    const nextIntl = {locale: 'ja'};
    assert.equal(getBlockEditorService(vm, nextIntl, integration), first);
    assert.equal(reads(), nextIntl);
    assert.equal(creations, 1);
    assert.notEqual(getBlockEditorService({}, nextIntl, integration), first);
});


test('ordinary extensions receive the GUI API without a host block editor', async () => {
    const {createRequire} = await import('node:module');
    const require = createRequire(import.meta.url);
    require('../extension-security/helpers.cts');
    const implementGuiAPI = require('../../../src/lib/tw-extension-gui-api.js').default;
    const scratch = {vm: {}};
    assert.doesNotThrow(() => implementGuiAPI(scratch));
    assert.equal(typeof scratch.gui.getBlockly, 'function');
    assert.equal(scratch.gui.createPreviewVm, undefined);
    assert.equal(scratch.gui.blockEditors, undefined);
    assert.equal(scratch.gui.stageControls, undefined);
});
