export function readYamlEditorFlags(search = '') {
    return Object.freeze({embeddedYamlEditor: new URLSearchParams(search).get('twPlusYamlEditor') === '1'});
}

// Resolve once at startup; changing history never changes an active document's flags.
export const yamlEditorFlags = readYamlEditorFlags(globalThis.location?.search || '');
