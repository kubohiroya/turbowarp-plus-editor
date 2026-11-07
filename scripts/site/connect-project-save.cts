module.exports = (source: string) => {
    const download = 'this.props.saveProjectSb3().then(content => {';
    const start = '        const writable = await handle.createWritable();\n        this.startedSaving();\n\n        await new Promise((resolve, reject) => {';
    const end = '        });\n    }\n    handleSaveError (e) {';
    if (!source.includes(download) || !source.includes(start) || !source.includes(end)) {
        throw new Error('Pinned GUI project save boundaries have changed');
    }
    // Leave the native file picker and the StreamHelper API in the GUI.
    return `import {withWaitCursor} from '@kubohiroya/turbowarp-plus-editor-ui/busy-cursor';\n${source
        .replace(download, 'withWaitCursor([document], () => this.props.saveProjectSb3()).then(content => {')
        .replace(start, start.replace('await new Promise', 'await withWaitCursor([document], () => new Promise'))
        .replace(end, end.replace('});', '}));'))}`;
};
