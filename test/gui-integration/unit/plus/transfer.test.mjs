import assert from 'node:assert/strict';
import test from 'node:test';
import {attachHostScriptTransfer, hostStageTransferMenu, finalizeHostTransferMenu} from '../../../../site/gui-integration/lib/tw-plus-transfer.js';

test('without a host transfer leaves upstream workspace and stage menus alone', () => {
    const workspace = {};
    assert.equal(attachHostScriptTransfer({workspace}, null), null);
    assert.deepEqual(workspace, {});
    assert.equal(hostStageTransferMenu({}, {}), null);
});

test('disposing a workspace releases both the Backpack drop and script transfer attachments', () => {
    const context = {workspace: {}};
    const disposed = [];
    const integration = {scriptTransfer: {attach: () => ({dispose: () => disposed.push('script')})}};
    const attachment = attachHostScriptTransfer(context, integration, supplied => {
        assert.equal(supplied, context);
        return {dispose: () => disposed.push('backpack')};
    });
    attachment.dispose();
    assert.deepEqual(disposed, ['backpack', 'script']);
});

test('the host receives the GUI context and supplies stage actions through the native menu components', () => {
    const context = {vm: {}, ScratchBlocks: {}, workspace: {}, document: {}, Zip: {}, deserializeBlocks () {}};
    const bridge = {dispose () {}};
    const onExport = () => {};
    const onImport = () => {};
    const menu = {contextItems: [{label: 'export', onClick: onExport}], backdropItems: [{label: 'import', onClick: onImport}]};
    const integration = {scriptTransfer: {
        attach: supplied => { assert.equal(supplied, context); return bridge; },
        stageMenu: supplied => { assert.equal(supplied, context); return menu; }
    }};
    assert.equal(attachHostScriptTransfer(context, integration), bridge);
    const stageMenu = hostStageTransferMenu(context, integration);
    const nativeIcon = {};
    assert.deepEqual(stageMenu.backdropButtons(nativeIcon), [{title: 'import', img: nativeIcon, onClick: onImport}]);

    const primitives = {ContextMenuTrigger: () => null, ContextMenu: () => null, MenuItem: () => null};
    const stage = 'stage';
    const trigger = stageMenu.wrap(stage, primitives);
    assert.equal(trigger.type, primitives.ContextMenuTrigger);
    const [content, renderedMenu] = trigger.props.children;
    assert.equal(content, stage);
    assert.equal(renderedMenu.type, primitives.ContextMenu);
    assert.equal(trigger.props.id, renderedMenu.props.id);
    assert.equal(renderedMenu.props.children[0].type, primitives.MenuItem);
    assert.equal(renderedMenu.props.children[0].props.onClick, onExport);
    assert.equal(renderedMenu.props.children[0].props.children, 'export');
});


test('addon menus stay intact without a finalizer; a host can resolve conflicts after addons', () => {
    const items = [{text: 'Paste'}];
    assert.equal(finalizeHostTransferMenu(items, null), items);
    const final = [{text: 'Host paste'}];
    assert.equal(finalizeHostTransferMenu(items, {scriptTransfer: {
        finalizeMenu: supplied => { assert.equal(supplied, items); return final; }
    }}), final);
});
