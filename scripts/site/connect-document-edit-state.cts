const path = require('node:path');

module.exports = (source: string) => {
    const render = '        const focusedTab = tablist.contains(doc.activeElement)';
    const saved = '    function finishSaved() {';
    if ([render, saved].some(slot => source.indexOf(slot) < 0 || source.indexOf(slot) !== source.lastIndexOf(slot))) {
        throw new Error('The pinned document editor edit state connection has changed');
    }
    const unsaved = require.resolve('@kubohiroya/turbowarp-plus-editor-code-views/dockview-unsaved');
    return `import {documentEditEvent} from ${JSON.stringify(unsaved)};\n` + source
        .replace(render, `        if (docked) docked.element.dispatchEvent(new win.CustomEvent(documentEditEvent, {
            detail: {draft: hasWork(), applied: false}
        }));\n${render}`)
        .replace(saved, `${saved}
        if (docked && !externalFile && hasWork()) docked.element.dispatchEvent(new win.CustomEvent(documentEditEvent, {
            detail: {draft: false, applied: true}
        }));`);
};
