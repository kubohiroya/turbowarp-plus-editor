import assert from 'node:assert/strict';
import test from 'node:test';
import {attachHostScriptTransfer, hostStageTransferMenu, finalizeHostTransferMenu} from '../../../../site/gui-integration/lib/tw-plus-transfer.js';

test('without a host transfer leaves upstream workspace and stage menus alone', () => {
    const workspace = {};
    assert.equal(attachHostScriptTransfer({workspace}, null), null);
    assert.deepEqual(workspace, {});
    assert.deepEqual(hostStageTransferMenu({}, {}), {contextItems: [], backdropItems: []});
});

test('the host receives the GUI context and owns disposal and menu callbacks', () => {
    const context = {vm: {}, ScratchBlocks: {}, workspace: {}, document: {}, Zip: {}, deserializeBlocks () {}};
    const bridge = {dispose () {}};
    const menu = {contextItems: [{label: 'export'}], backdropItems: [{label: 'import'}]};
    const integration = {scriptTransfer: {
        attach: supplied => { assert.equal(supplied, context); return bridge; },
        stageMenu: supplied => { assert.equal(supplied, context); return menu; }
    }};
    assert.equal(attachHostScriptTransfer(context, integration), bridge);
    assert.equal(hostStageTransferMenu(context, integration), menu);
});


test('addon menus stay intact without a finalizer; a host can resolve conflicts after addons', () => {
    const items = [{text: 'Paste'}];
    assert.equal(finalizeHostTransferMenu(items, null), items);
    const final = [{text: 'Host paste'}];
    assert.equal(finalizeHostTransferMenu(items, {scriptTransfer: {
        finalizeMenu: supplied => { assert.equal(supplied, items); return final; }
    }}), final);
});
