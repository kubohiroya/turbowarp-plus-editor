import {startDocumentEditorHost} from '@kubohiroya/turbowarp-document-editor/host';
export * from '@kubohiroya/turbowarp-document-editor/host';

// Keep the distribution-specific URL out of the shared bridge implementation.
export function startYamlEditorHost(options = {}) {
    return startDocumentEditorHost({publicPath: '/turbowarp-plus-editor/', editorPath: '/turbowarp-plus-editor/editor.html', ...options});
}
