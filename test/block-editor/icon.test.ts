import assert from 'node:assert/strict';
import {test} from 'node:test';

import {createPlusBlockEditor} from '@kubohiroya/turbowarp-extension-data-editor/plus';

const plusBlockEditor = createPlusBlockEditor();

const {default: getBlockEditorService} = await import('../../site/gui-integration/lib/tw-block-editor-service.ts');

// The GUI keeps one service per VM and the strings for it; the service itself is this
// distribution's, so it is handed in the way the integration hands it in a real editor.
const integration = {blockEditor: plusBlockEditor};


test('one managed editor service is shared per VM, with registration and disposal notifications', () => {
    const vm = {};
    const service = getBlockEditorService(vm, undefined, integration);
    assert.equal(service, getBlockEditorService(vm, undefined, integration));
    assert.notEqual(service, getBlockEditorService({}, undefined, integration));
    let updates = 0;
    const stop = service.subscribe(() => { updates++; });
    const remove = service.api.register({
        apiVersion: 1, extensionId: 'demo', editorId: 'properties', opcodes: ['demo_scene'],
        editableArguments: ['PROPERTIES'], read: () => ({}), validate: () => [], createPatch: () => [],
        mount: () => () => {}
    });
    assert.ok(service.registry.resolve('demo_scene'));
    remove(); remove();
    assert.equal(service.registry.resolve('demo_scene'), undefined);
    assert.equal(updates, 2);
    stop();
});
