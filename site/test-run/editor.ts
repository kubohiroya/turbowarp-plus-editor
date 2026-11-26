/**
 * The test run view in the editor (issue #774): the run view menu item that opens it, the tab it opens in, the
 * frame its tests run in, and the way back to a block that failed. The view, its text and the runner are
 * `@kubohiroya/turbowarp-plus-editor-test`'s; this module only connects them to this editor.
 */
import {getDocumentWorkspace} from '@kubohiroya/turbowarp-plus-editor-workbench/sprite-tabs';
import {connectTestFrame} from '@kubohiroya/turbowarp-plus-editor-test/test-frame';
import {TEST_EXTENSION_ID} from '@kubohiroya/turbowarp-plus-editor-test';
import JSZip from '@turbowarp/jszip';
import {createTestRunView, testRunMenuItem, testRunPanelRequest, testRunText} from '@kubohiroya/turbowarp-plus-editor-test/test-run-view';
import {activateTargetView, connectionFor} from '@kubohiroya/turbowarp-plus-editor-project-model/project-search-connections';
import {getExtensionIdentities} from '../extension-host/loader-connections.ts';

type EditorVM = {
    runtime: {targets: Array<{id: string; isOriginal: boolean; getName(): string}>};
    toJSON(targetId?: string, options?: {allowOptimization?: boolean}): string;
    _saveProjectZip(): {file(name: string, data: string): unknown; generateAsync(options: {type: 'arraybuffer'}): Promise<ArrayBuffer>};
    extensionManager: {getExtensionURLs?(): Record<string, string>};
    setEditingTarget(targetId: string): void;
};

let editorVm: EditorVM | null = null;

/** The frame page this build carries, under whatever prefix the site was built for. */
const frameURL = (view: Window = window) => new URL(`${process.env.ROOT || './'}test-frame.html`, view.location.href).href;

/** A one-use runner for a saved archive. It receives no handle or state from the live Editor. */
export const runSavedGenerationTests = async (document: Document, archive: ArrayBuffer, signal: AbortSignal) => {
    const view = document.defaultView!;
    const zip = await JSZip.loadAsync(archive);
    const project = JSON.parse(await zip.file('project.json')!.async('string'));
    const extensionURLs = Object.values(project.extensionURLs ?? {}).filter((url): url is string => typeof url === 'string');
    const declared = project.turboWarpPlus?.extensions;
    const managed = Array.isArray(declared) && declared.some(extension => extension?.id === TEST_EXTENSION_ID);
    const testExtensionURL = managed ? undefined : project.extensionURLs?.[TEST_EXTENSION_ID];
    signal.throwIfAborted();
    const frame = document.createElement('iframe');
    frame.src = frameURL(view);
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:absolute;left:-10000px;width:480px;height:360px;border:0;';
    const runner = connectTestFrame(frame, {origin: view.location.origin,
        context: () => ({savedGeneration: true, extensionURLs, testExtensionURL})});
    let abort: (() => void) | undefined;
    try {
        document.body.append(frame);
        const cancelled = new Promise<never>((_, reject) => {
            abort = () => reject(signal.reason);
            signal.addEventListener('abort', abort, {once: true});
        });
        return await Promise.race([runner.run({project: archive, signal}), cancelled]);
    } finally {
        if (abort) signal.removeEventListener('abort', abort);
        runner.dispose?.();
        frame.remove();
    }
};

const contextFor = (vm: EditorVM) => ({
    extensionURLs: Object.values(vm.extensionManager.getExtensionURLs?.() ?? {}),
    sandboxedExtensions: getExtensionIdentities(vm)
        .filter(extension => extension.execution === 'sandboxed')
        .map(({id, sha256}) => ({id, sha256}))
});

type TestProjectSnapshot = {archive: ArrayBuffer; extensionContext: ReturnType<typeof contextFor>};

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
    async getProject(): Promise<TestProjectSnapshot> {
        const extensionContext = contextFor(vm);
        const zip = vm._saveProjectZip();
        // Keep the archive's assets and Plus manifest, but use the editor's block IDs for failure navigation.
        zip.file('project.json', vm.toJSON(undefined, {allowOptimization: false}));
        const archive = await zip.generateAsync({type: 'arraybuffer'});
        return {archive, extensionContext};
    },
    // The view lists tests from project.json and passes the snapshot to the runner unchanged.
    listProject: () => vm.toJSON(undefined, {allowOptimization: false}),
    createRunner(stage: HTMLElement) {
        const frame = doc.createElement('iframe');
        frame.src = frameURL();
        frame.title = testRunText(locale).stage;
        frame.style.cssText = 'width: 100%; height: 100%; border: 0; display: block;';
        stage.append(frame);
        const runner = connectTestFrame(frame, {
            origin: location.origin,
            context: request => 'extensionContext' in request ? request.extensionContext : undefined
        });
        return {
            ...runner,
            run(request: Parameters<typeof runner.run>[0]) {
                const {archive, extensionContext} = request.project as TestProjectSnapshot;
                const frameRequest = {...request, project: archive, extensionContext};
                return runner.run(frameRequest);
            }
        };
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
