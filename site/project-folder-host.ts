import {mountProjectFolder} from '@kubohiroya/turbowarp-plus-editor-project-folder';
import type {FolderVM} from '@kubohiroya/turbowarp-plus-editor-project-folder';
import {refreshExternalBlockViews} from '@kubohiroya/turbowarp-plus-editor-views';
import {createScratchBlocksDiffRenderer, mountGitPanel} from '@kubohiroya/turbowarp-plus-editor-git';
import {createGitConnectionSettings} from '@kubohiroya/turbowarp-plus-editor-auth';
import type {DesktopGitPreload} from '@kubohiroya/turbowarp-plus-editor-auth';
import type {ScratchBlockDiffRendererOptions} from '@kubohiroya/turbowarp-plus-editor-git';
import {loadedProjectTitle} from './project-tools/index.ts';
import {getDocumentWorkspace} from '@kubohiroya/turbowarp-plus-editor-layout/sprite-tabs';
import {activateTargetView, connectionFor} from '@kubohiroya/turbowarp-plus-editor-ui/project-search-connections';

type RuntimeThread = {updateMonitor?: boolean};
type Runtime = FolderVM['runtime'] & {threads: RuntimeThread[]; isActiveThread(thread: RuntimeThread): boolean};
type Action = {type: string};
type GuiStore = {
    getState(): {scratchGui: {vm: FolderVM; projectChanged: boolean; vmStatus: {running: boolean}}};
    dispatch(action: Action): void;
    subscribe(listener: () => void): () => void;
};
declare const __TW_PLUS_PROJECT_FOLDER_SET_FILE_HANDLE__: (handle: null) => Action;
declare const __TW_PLUS_PROJECT_FOLDER_SET_UNCHANGED__: () => Action;
declare const __TW_PLUS_PROJECT_FOLDER_SET_TITLE__: (title: string) => Action;
declare const __TW_PLUS_GIT_DESERIALIZE_BLOCKS__: ScratchBlockDiffRendererOptions['deserializeBlocks'];
declare const __TW_PLUS_GIT_VM_BLOCKS__: new () => ReturnType<ScratchBlockDiffRendererOptions['createBlockContainer']>;
declare const __TW_PLUS_GIT_CLOUDFLARE__: {bffOrigin: string; proxyOrigin: string} | null;

export function attachProjectFolder(vm: FolderVM, document: Document, localGit: boolean, locale: string,
    getBlockly: ScratchBlockDiffRendererOptions['getBlockly'], attachNavigation?: ScratchBlockDiffRendererOptions['attachNavigation']) {
    const view = document?.defaultView as Window & {EditorPreload?: {localGit?: DesktopGitPreload | null}; ReduxStore?: GuiStore};
    if (!view || typeof __TW_PLUS_PROJECT_FOLDER_SET_FILE_HANDLE__ === 'undefined') return null;
    const connectionSettings = localGit ? createGitConnectionSettings({
        desktop: view.EditorPreload?.localGit,
        cloudflare: typeof __TW_PLUS_GIT_CLOUDFLARE__ === 'undefined' ? null : __TW_PLUS_GIT_CLOUDFLARE__
    }) : undefined;
    if (view.EditorPreload && !connectionSettings?.modes.length) return null;
    const store = view.ReduxStore;
    if (!store || store.getState().scratchGui.vm !== vm) return null;
    const markSaved = () => store.dispatch(__TW_PLUS_PROJECT_FOLDER_SET_UNCHANGED__());
    let gitPanel: ReturnType<typeof mountGitPanel> = null;
    const isProjectDirty = () => store.getState().scratchGui.projectChanged;
    const runtime = vm.runtime as Runtime;
    const isRunning = () => store.getState().scratchGui.vmStatus.running ||
        runtime.threads.some(thread => !thread.updateMonitor && runtime.isActiveThread(thread));
    const folder = mountProjectFolder({vm, document, locale, host: {
        blockReload: {
            isRunning,
            subscribe: listener => store.subscribe(listener),
            onApplied(targets) {
                refreshExternalBlockViews(vm, targets);
                markSaved();
            }
        },
        isProjectDirty,
        beforeLoad: () => store.dispatch(__TW_PLUS_PROJECT_FOLDER_SET_FILE_HANDLE__(null)),
        onOpened(title) {
            store.dispatch(__TW_PLUS_PROJECT_FOLDER_SET_TITLE__(loadedProjectTitle(vm) ?? title));
            markSaved();
        },
        onSaved() {
            markSaved();
            void gitPanel?.refresh();
        }
    }});
    if (!folder || !localGit) return folder;
    gitPanel = mountGitPanel({vm, document, host: {
        connectionSettings,
        renderReviewBlock: typeof __TW_PLUS_GIT_DESERIALIZE_BLOCKS__ === 'function' && typeof __TW_PLUS_GIT_VM_BLOCKS__ === 'function' ?
            createScratchBlocksDiffRenderer({
                getBlockly, deserializeBlocks: __TW_PLUS_GIT_DESERIALIZE_BLOCKS__,
                createBlockContainer: () => new __TW_PLUS_GIT_VM_BLOCKS__(), showUnregisteredBlocks: true, locale, attachNavigation
            }) : undefined,
        openProject: folder.openDirectory,
        // A transient tab beside the code, as the YAML documents open; the folder handle cannot outlive a reload.
        openPanel: request => getDocumentWorkspace(vm).open({...request, transient: true}),
        // The same route as project search, so the code opens where people already work.
        openTargetCode(targetId) {
            const navigation = connectionFor(vm.runtime as unknown as Parameters<typeof connectionFor>[0]).navigation;
            if (!navigation || !activateTargetView(navigation, targetId, 0)) (vm as FolderVM & {setEditingTarget(id: string): void}).setEditingTarget(targetId);
        },
        getWorkspace: async () => (await getBlockly()).getMainWorkspace() as never,
        isProjectDirty,
        isProjectRunning: isRunning,
        subscribe(listener) {
            const loaded = () => listener('loaded');
            const unsubscribe = store.subscribe(() => listener('changed'));
            vm.runtime.on('PROJECT_LOADED', loaded);
            return () => {unsubscribe(); vm.runtime.off('PROJECT_LOADED', loaded);};
        }
    }});
    return {...folder, dispose() {gitPanel?.dispose(); folder.dispose();}};
}
