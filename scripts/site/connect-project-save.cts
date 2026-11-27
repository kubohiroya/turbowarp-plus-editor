module.exports = (source: string) => {
    const download = `        this.startedSaving();
        this.props.saveProjectSb3().then(content => {
            this.finishedSaving();
            downloadBlob(this.props.projectFilename, content);
        });`;
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
import {withWaitCursor} from '@kubohiroya/turbowarp-plus-editor-workbench/busy-cursor';\n${source
        .replace('    downloadProject () {', '    async downloadProject () {')
        .replace(download, `        const {vm, projectFilename} = this.props;
        const stage = vm.runtime.getTargetForStage();
        const current = () => this.props.vm === vm && vm.runtime.getTargetForStage() === stage;
        let edited = false;
        const changed = () => { edited = true; };
        vm.on('PROJECT_CHANGED', changed);
        try {
            await this.downloadSb3(projectFilename, run => run(), current);
            if (current()) {
                if (edited) this.props.onShowSaveSuccessAlert();
                else this.finishedSaving();
            }
        } catch (error) {
            this.handleSaveError(error);
        } finally {
            vm.removeListener('PROJECT_CHANGED', changed);
        }
    }
    async downloadSb3 (filename, serialize, current, useProjectFormat = true) {
        await withWaitCursor([document], async () => {
            const prepare = useProjectFormat ? getHostIntegration()?.prepareProjectSb3Save : undefined;
            const prepared = prepare ? await prepare(this.props.vm, serialize, current) : undefined;
            if (!current()) throw new DOMException('The project changed', 'AbortError');
            this.startedSaving();
            const content = await (prepared?.serialize ?? serialize)(() => this.props.saveProjectSb3());
            prepared?.assertCurrent();
            if (!current()) throw new DOMException('The project changed', 'AbortError');
            downloadBlob(filename, content);
            prepared?.commit();
        });`)
        .replace(start, `        const prepare = useProjectFormat ? getHostIntegration()?.prepareProjectSb3Save : undefined;
        const prepared = prepare ? await withWaitCursor([document], () => prepare(this.props.vm, serialize, current)) : undefined;
        if (!current()) throw new DOMException('The project changed', 'AbortError');
        prepared?.assertCurrent();
${start.replace('await new Promise', 'await withWaitCursor([document], () => new Promise')}`)
        .replace(end, end.replace('});', '})).catch(async error => {\n            await writable.abort().catch(() => {});\n            throw error;\n        });'))
        .replace(signature, '    async saveToHandle (handle, serialize = run => run(), finish = () => this.finishedSaving(), current = () => true, useProjectFormat = true) {')
        .replace(stream, '            const jszipStream = (prepared?.serialize ?? serialize)(() => this.props.saveProjectSb3Stream());')
        .replace(finish, '                    prepared?.commit();\n                    finish();')
        .replace(close, `                    if (!current()) throw new DOMException('The project changed', 'AbortError');
                    prepared?.assertCurrent();
${close}`)
        .replace(render, `        const canPick = Boolean(this.props.showSaveFilePicker);
        const projectFileStorage = {
            canSave: this.props.canSaveProject,
            filename: this.props.projectFilename,
            overwrite: this.props.fileHandle && (async () => {
                const {vm, fileHandle} = this.props;
                const stage = vm.runtime.getTargetForStage();
                const current = () => this.props.vm === vm && vm.runtime.getTargetForStage() === stage;
                let edited = false;
                const changed = () => { edited = true; };
                vm.on('PROJECT_CHANGED', changed);
                try {
                    await this.saveToHandle(fileHandle, run => run(), () => {
                        if (!current()) return;
                        if (edited) this.props.onShowSaveSuccessAlert();
                        else this.finishedSaving();
                    }, current);
                } catch (error) {
                    this.handleSaveError(error);
                } finally {
                    vm.removeListener('PROJECT_CHANGED', changed);
                }
            }),
            pick: canPick && (filename => this.props.showSaveFilePicker({
                suggestedName: filename,
                types: [{description: 'Scratch 3 Project', accept: {'application/octet-stream': '.sb3'}}],
                excludeAcceptAllOption: true
            })),
            write: (handle, serialize, current, useProjectFormat) =>
                this.saveToHandle(handle, serialize, () => {}, current, useProjectFormat),
            download: (filename, serialize, current, useProjectFormat) =>
                this.downloadSb3(filename, serialize, current, useProjectFormat),
            // Save a Copy leaves the project's file, title and unsaved state alone; only the save indicator ends.
            copied: () => this.props.onShowSaveSuccessAlert(),
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
