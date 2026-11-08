module.exports = (source: string) => {
    const download = 'this.props.saveProjectSb3().then(content => {';
    const start = '        const writable = await handle.createWritable();\n        this.startedSaving();\n\n        await new Promise((resolve, reject) => {';
    const end = '        });\n    }\n    handleSaveError (e) {';
    if (!source.includes(download) || !source.includes(start) || !source.includes(end)) {
        throw new Error('Pinned GUI project save boundaries have changed');
    }
    // Leave the native file picker and the StreamHelper API in the GUI.
    const render = '        return children(';
    const signature = '    async saveToHandle (handle) {';
    const stream = '            const jszipStream = this.props.saveProjectSb3Stream();';
    const finish = '                    this.finishedSaving();';
    const close = '                    await writable.close();';
    for (const marker of [render, signature, stream, finish, close]) {
        if (source.indexOf(marker) === -1 || source.indexOf(marker) !== source.lastIndexOf(marker)) {
            throw new Error('The pinned GUI project save callback has changed');
        }
    }
    return `import {getHostIntegration} from '../addons/hooks.js';
import {withWaitCursor} from '@kubohiroya/turbowarp-plus-editor-ui/busy-cursor';\n${source
        .replace(download, 'withWaitCursor([document], () => this.props.saveProjectSb3()).then(content => {')
        .replace(start, start.replace('await new Promise', 'await withWaitCursor([document], () => new Promise'))
        .replace(end, end.replace('});', '})).catch(async error => {\n            await writable.abort().catch(() => {});\n            throw error;\n        });'))
        .replace(signature, '    async saveToHandle (handle, serialize = run => run(), finish = () => this.finishedSaving(), current = () => true) {')
        .replace(stream, '            const jszipStream = serialize(() => this.props.saveProjectSb3Stream());')
        .replace(finish, '                    finish();')
        .replace(close, `                    if (!current()) throw new DOMException('The project changed', 'AbortError');
${close}`)
        .replace(render, `        const canPick = Boolean(this.props.showSaveFilePicker);
        const projectFileStorage = {
            canSave: this.props.canSaveProject,
            filename: this.props.projectFilename,
            overwrite: this.props.fileHandle && this.saveToLastFile,
            pick: canPick && (filename => this.props.showSaveFilePicker({
                suggestedName: filename,
                types: [{description: 'Scratch 3 Project', accept: {'application/octet-stream': '.sb3'}}],
                excludeAcceptAllOption: true
            })),
            write: (handle, serialize, current) => this.saveToHandle(handle, serialize, () => {}, current),
            download: async (filename, serialize, current) => {
                this.startedSaving();
                const blob = await withWaitCursor([document], () => serialize(() => this.props.saveProjectSb3()));
                if (current()) downloadBlob(filename, blob);
            },
            finish: (handle, title, unchanged) => {
                this.props.onSetFileHandle(handle);
                this.props.onSetProjectTitle(title);
                if (unchanged) this.finishedSaving();
                else this.props.onShowSaveSuccessAlert();
            },
            fail: error => this.handleSaveError(error)
        };
        const smartSave = original => {
            const host = getHostIntegration();
            return host?.saveProjectFromFileMenu ?
                event => host.saveProjectFromFileMenu(this.props.vm, projectFileStorage, Boolean(event)) : original;
        };
${render}`)
        .replace('smartSave: this.saveToLastFileOrNew', 'projectFileStorage, smartSave: smartSave(this.saveToLastFileOrNew)')
        .replace('smartSave: this.downloadProject', 'projectFileStorage, smartSave: smartSave(this.downloadProject)')
        .replace('    fileHandle: PropTypes.shape({', '    vm: PropTypes.object,\n    fileHandle: PropTypes.shape({')
        .replace('    fileHandle: state.scratchGui.tw.fileHandle,', '    vm: state.scratchGui.vm,\n    fileHandle: state.scratchGui.tw.fileHandle,')}`;
};
