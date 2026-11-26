import assert from 'node:assert/strict';
import {test} from 'node:test';

import {createPlusBlockEditor} from '@kubohiroya/turbowarp-extension-data-editor/plus';

const plusBlockEditor = createPlusBlockEditor();

const {default: getBlockEditorService} = await import('../../site/gui-integration/lib/tw-block-editor-service.ts');

// The GUI keeps one service per VM and the strings for it; the service itself is this
// distribution's, so it is handed in the way the integration hands it in a real editor.
const integration = {blockEditor: plusBlockEditor};

test('the real block editor service exposes registrations only to the GUI of the same VM', () => {
    const vm = {};
    const service = getBlockEditorService(vm, undefined, integration);
    const sameVM = getBlockEditorService(vm, undefined, integration);
    const otherVM = getBlockEditorService({}, undefined, integration);
    assert.equal(sameVM, service);
    assert.notEqual(otherVM, service);
    const remove = service.api.register({
        apiVersion: 1, extensionId: 'demo', editorId: 'properties', opcodes: ['demo_scene'],
        editableArguments: ['PROPERTIES'], read: () => ({}), validate: () => [], createPatch: () => [],
        mount: () => () => {}
    });
    assert.ok(sameVM.registry.resolve('demo_scene'));
    assert.equal(otherVM.registry.resolve('demo_scene'), undefined);
    remove();
});
