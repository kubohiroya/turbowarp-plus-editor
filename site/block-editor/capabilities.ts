// Expose every capability provided by the installed artifact, without URL gating.
const exposeBlockEditorAPI = api => {
    const visible = {...api};
    let changed = false;
    for (const key of ['registerSourceEditor', 'registerFixedInputEditor']) {
        if (typeof api[key] !== 'function' && key in api) {
            delete visible[key];
            changed = true;
        }
    }
    return changed ? Object.freeze(visible) : api;
};

export default exposeBlockEditorAPI;
