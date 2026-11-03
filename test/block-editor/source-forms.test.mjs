import assert from 'node:assert/strict';
import {test} from 'node:test';
import exposeBlockEditorAPI from '../../site/block-editor/capabilities.js';
const {default: getBlockEditorService} = await import('../../site/gui-integration/lib/tw-block-editor-service.js');
// The editor itself is the host's. What this file is about is this fork's side: one service per VM,
// and the strings it supplies, so the host's part is a stub that answers with the real shape.
const integration = {blockEditor: {createService: ({getIntl}) => {
    const editors = new Map();
    return {api: Object.freeze({
        register: definition => editors.set(definition.editorId, definition),
        registerSourceEditor: definition => editors.set(definition.editorId, definition),
        registerFixedInputEditor: definition => editors.set(definition.editorId, definition),
        messages: () => getIntl()
    })};
}}};

test('the standard GUI exposes source forms and preserves older artifact capabilities', () => {
    assert.equal(typeof getBlockEditorService({}, undefined, integration).api.registerSourceEditor, 'function');
    const legacy = {apiVersion: 1, register() {}};
    assert.equal(exposeBlockEditorAPI(legacy), legacy);
    assert.equal(exposeBlockEditorAPI(legacy).registerSourceEditor, undefined);
    assert.equal(exposeBlockEditorAPI({...legacy, registerSourceEditor: true}).registerSourceEditor, undefined);
});
