/**
 * The test run view in the editor (issue #774): the run view menu item that opens it, the tab it opens in, the
 * frame its tests run in, and the way back to a block that failed. The view, its text and the runner are
 * `@kubohiroya/turbowarp-plus-editor-test`'s; this module only connects them to this editor.
 */
import {getDocumentWorkspace} from '@kubohiroya/turbowarp-plus-editor-workbench/sprite-tabs';
import {connectTestFrame} from '@kubohiroya/turbowarp-plus-editor-test/test-frame';
import {createTestRunView, testRunMenuItem, testRunPanelRequest, testRunText} from '@kubohiroya/turbowarp-plus-editor-test/test-run-view';
import {activateTargetView, connectionFor} from '@kubohiroya/turbowarp-plus-editor-project-model/project-search-connections';

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

/**
 * The project for one run: the archive the editor would save, with assets and the Plus manifest, but with the
 * block IDs the editor shows. The default serialization renumbers them, and a failed check could not be found.
 */
const projectForTests = async (vm: EditorVM) => {
    const zip = vm._saveProjectZip();
    zip.file('project.json', vm.toJSON(undefined, {allowOptimization: false}));
    return zip.generateAsync({type: 'arraybuffer'});
};

/** The way project search reveals a block: the sprite's code view, then the block at its center. */
const showBlock = (vm: EditorVM, targetName: string, blockId: string) => {
    const target = vm.runtime.targets.find(candidate => candidate.isOriginal && candidate.getName() === targetName);
    if (!target) return;
    const navigation = connectionFor(vm.runtime as never).navigation;
    if (!navigation || !activateTargetView(navigation, target.id, 0)) vm.setEditingTarget(target.id);
    requestAnimationFrame(() => navigation?.centerBlock(blockId));
};

const viewOptions = (vm: EditorVM, locale: string, doc: Document) => ({
    document: doc,
    locale,
    getProject: () => projectForTests(vm),
    createRunner(stage: HTMLElement) {
        const frame = doc.createElement('iframe');
        frame.src = frameURL();
        frame.title = testRunText(locale).stage;
        frame.style.cssText = 'width: 100%; height: 100%; border: 0; display: block;';
        stage.append(frame);
        return connectTestFrame(frame, {
            origin: location.origin,
            // The standard extensions the editor runs now, which the frame may load as well. Plus extensions are
            // trusted in the frame as in the editor: by the distributed catalog.
            context: () => ({extensionURLs: Object.values(vm.extensionManager.getExtensionURLs?.() ?? {})})
        });
    },
    showBlock: (target: string, blockId: string) => showBlock(vm, target, blockId)
});

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
