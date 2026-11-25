/**
 * The test run view in the editor (issue #774): the run view menu item that opens it, the tab it opens in, the
 * frame its tests run in, and the way back to a block that failed. The view, its text and the runner are
 * `@kubohiroya/turbowarp-plus-editor-test`'s; this module only connects them to this editor.
 */
import {getDocumentWorkspace} from '@kubohiroya/turbowarp-plus-editor-workbench/sprite-tabs';
import {connectTestFrame} from '@kubohiroya/turbowarp-plus-editor-test/test-frame';
import {createTestRunView, testRunMenuItem, testRunPanelRequest, testRunText} from '@kubohiroya/turbowarp-plus-editor-test/test-run-view';
import {activateTargetView, connectionFor} from '@kubohiroya/turbowarp-plus-editor-project-model/project-search-connections';
import {getEditorExtensionIdentities} from '../extension-host/editor-host.ts';

type EditorVM = {
    runtime: {targets: Array<{id: string; isOriginal: boolean; getName(): string}>};
    toJSON(targetId?: string, options?: {allowOptimization?: boolean}): string;
    _saveProjectZip(): {file(name: string, data: string): unknown; generateAsync(options: {type: 'arraybuffer'}): Promise<ArrayBuffer>};
    extensionManager: {getExtensionURLs?(): Record<string, string>};
    setEditingTarget(targetId: string): void;
};

let editorVm: EditorVM | null = null;

/** The frame page this build carries, under whatever prefix the site was built for. */
const frameURL = () => new URL(`${process.env.ROOT || './'}test-frame.html`, location.href).href;

const contextFor = (vm: EditorVM) => ({
    extensionURLs: Object.values(vm.extensionManager.getExtensionURLs?.() ?? {}),
    sandboxedExtensions: getEditorExtensionIdentities(vm)
        .filter(extension => extension.execution === 'sandboxed')
        .map(({id, sha256}) => ({id, sha256}))
});

/** The way project search reveals a block: the sprite's code view, then the block at its center. */
const showBlock = (vm: EditorVM, targetName: string, blockId: string) => {
    const target = vm.runtime.targets.find(candidate => candidate.isOriginal && candidate.getName() === targetName);
    if (!target) return;
    const navigation = connectionFor(vm.runtime as never).navigation;
    if (!navigation || !activateTargetView(navigation, target.id, 0)) vm.setEditingTarget(target.id);
    requestAnimationFrame(() => navigation?.centerBlock(blockId));
};

const viewOptions = (vm: EditorVM, locale: string, doc: Document) => {
    const snapshotContexts = new WeakMap<ArrayBuffer, ReturnType<typeof contextFor>>();
    return {
        document: doc,
        locale,
        async getProject() {
            const context = contextFor(vm);
            const zip = vm._saveProjectZip();
            // Keep the archive's assets and Plus manifest, but use the editor's block IDs for failure navigation.
            zip.file('project.json', vm.toJSON(undefined, {allowOptimization: false}));
            const project = await zip.generateAsync({type: 'arraybuffer'});
            snapshotContexts.set(project, context);
            return project;
        },
        // The archive above cannot be read by the view; the same project.json lists the tests before they run.
        listProject: () => vm.toJSON(undefined, {allowOptimization: false}),
        createRunner(stage: HTMLElement) {
            const frame = doc.createElement('iframe');
            frame.src = frameURL();
            frame.title = testRunText(locale).stage;
            frame.style.cssText = 'width: 100%; height: 100%; border: 0; display: block;';
            stage.append(frame);
            return connectTestFrame(frame, {
                origin: location.origin,
                context: ({project}) => project instanceof ArrayBuffer ? snapshotContexts.get(project) : undefined
            });
        },
        showBlock: (target: string, blockId: string) => showBlock(vm, target, blockId)
    };
};

/** Opens the view as a workspace tab, or in a window of its own when the workspace takes no tabs. */
const openTestRun = (vm: EditorVM, locale: string) => {
    if (getDocumentWorkspace(vm).open(testRunPanelRequest(viewOptions(vm, locale, document)))) return;
    const popup = window.open('', 'tw-plus-test-run', 'width=760,height=560');
    if (!popup) return;
    popup.document.title = testRunText(locale).title;
    popup.document.body.style.margin = '0';
    popup.document.body.replaceChildren();
    const view = createTestRunView(viewOptions(vm, locale, popup.document));
    popup.document.body.append(view.element);
    popup.addEventListener('pagehide', () => view.dispose(), {once: true});
    void view.refresh();
};

/** The run view menu's items (the workbench's `menuItems`). */
export const testRunMenuItems = (locale: string) => {
    const vm = editorVm;
    return vm ? [testRunMenuItem(locale, () => openTestRun(vm, locale))] : [];
};

/** Called when the editor's workspace attaches to its VM. */
export const connectTestRun = (vm: EditorVM) => {
    editorVm = vm;
    return {dispose() {
        if (editorVm === vm) editorVm = null;
    }};
};
