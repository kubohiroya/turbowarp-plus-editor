import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixedMessages, plusBlockEditorTranslations} from '@kubohiroya/turbowarp-extension-data-editor/plus';
import {guiRequire} from '../extension-host/pinned-host.ts';
const {default: getBlockEditorService} = await import('../../site/gui-integration/lib/tw-block-editor-service.ts');
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


test('fixed labels use the actual GUI Intl locale and preserve one service per VM', () => {
    const {IntlProvider} = guiRequire('react-intl');
    const translations = plusBlockEditorTranslations;
    const vm = {};
    let previous;
    for (const locale of ['en', 'ja']) {
        const intl = new IntlProvider({locale, messages: translations[locale]}, {}).getChildContext().intl;
        const service = getBlockEditorService(vm, intl, integration);
        if (previous) assert.equal(service, previous);
        const serviceIntl = service.api.messages();
        assert.equal(serviceIntl, intl);
        assert.equal(fixedMessages(serviceIntl).reset, translations[locale]['tw.blockEditor.fixed.reset']);
        previous = service;
    }
});
test('the Editor GUI exposes the fixed-input registration capability', () => {
    assert.equal(typeof getBlockEditorService({}, undefined, integration).api.registerFixedInputEditor, 'function');
});
