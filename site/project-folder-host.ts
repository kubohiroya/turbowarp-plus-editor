import {flushPendingSurfaceEdits} from '@kubohiroya/turbowarp-editor-surfaces';
import {followProjectFolder, mountProjectFolder} from '@kubohiroya/turbowarp-plus-editor-project-folder';
import type {FolderVM, ReloadTarget} from '@kubohiroya/turbowarp-plus-editor-project-folder';
import type {EditorHost, EditorTarget} from '@kubohiroya/turbowarp-plus-editor-host';
import {refreshExternalBlockViews} from '@kubohiroya/turbowarp-plus-editor-views';
import {createScratchBlocksDiffRenderer, inspectPublicationRepository, mountGitPanel, openProjectComparison, pushPublicationCommit}
    from '@kubohiroya/turbowarp-plus-editor-git';
import {createGitConnectionSettings} from '@kubohiroya/turbowarp-plus-editor-auth';
import type {DesktopGitPreload} from '@kubohiroya/turbowarp-plus-editor-auth';
import type {PullRequestPublication, ScratchBlockDiffRendererOptions} from '@kubohiroya/turbowarp-plus-editor-git';
import {bindDesktopPublicationPushSession, createProjectPublication} from '@kubohiroya/turbowarp-plus-editor-ui/project-publication';
import type {PublicationBridge} from '@kubohiroya/turbowarp-plus-editor-ui/project-publication';
import {createCloudflarePublicationBridge} from '@kubohiroya/turbowarp-plus-editor-ui/cloudflare-publication';
import {loadedProjectTitle} from './project-tools/index.ts';
import {getDocumentWorkspace} from '@kubohiroya/turbowarp-plus-editor-workbench/sprite-tabs';
import {activateTargetView, connectionFor} from '@kubohiroya/turbowarp-plus-editor-ui/project-search-connections';

type RuntimeThread = {updateMonitor?: boolean};
type ProjectFolderVM = FolderVM & EditorHost['vm'] & {
    runtime: {threads: RuntimeThread[]; isActiveThread(thread: RuntimeThread): boolean};
    setEditingTarget(id: string): void;
};
type Action = {type: string};
type GuiStore = {
    getState(): {scratchGui: {vm: FolderVM; projectChanged: boolean; vmStatus: {running: boolean}}};
    dispatch(action: Action): void;
    subscribe(listener: () => void): () => void;
};
declare const __TW_PLUS_PROJECT_FOLDER_SET_FILE_HANDLE__: (handle: null) => Action;
declare const __TW_PLUS_PROJECT_FOLDER_SET_UNCHANGED__: () => Action;
declare const __TW_PLUS_PROJECT_FOLDER_SET_TITLE__: (title: string) => Action;
declare const __TW_PLUS_GIT_CLOUDFLARE__: {bffOrigin: string; proxyOrigin: string} | null;
declare const __TW_PLUS_CAPTURE_EDITOR_HOST__: ((host: EditorHost) => void) | undefined;

const folders = new WeakMap<FolderVM, {readonly directory: FileSystemDirectoryHandle | null}>();

/** The folder the loaded project came from, so its Dockview layout is kept apart from other projects. */
export const projectFolderDirectory = (vm: FolderVM) => folders.get(vm)?.directory ?? null;

export function attachProjectFolder(vm: ProjectFolderVM, document: Document, localGit: boolean, locale: string,
    getBlockly: ScratchBlockDiffRendererOptions['getBlockly'],
    blocks: Pick<EditorHost, 'deserializeBlocks' | 'createBlockContainer'>,
    attachNavigation?: ScratchBlockDiffRendererOptions['attachNavigation']) {
    const view = document?.defaultView as Window & {
        EditorPreload?: {localGitAuth?: DesktopGitPreload | null; localGit?: DesktopGitPreload | null;
            localGitPublication?: PublicationBridge | null}; ReduxStore?: GuiStore;
    };
    if (!view || typeof __TW_PLUS_PROJECT_FOLDER_SET_FILE_HANDLE__ === 'undefined') return null;
    const cloudflare = typeof __TW_PLUS_GIT_CLOUDFLARE__ === 'undefined' ? null : __TW_PLUS_GIT_CLOUDFLARE__;
    const connectionSettings = localGit ? createGitConnectionSettings({
        desktop: view.EditorPreload?.localGitAuth ?? view.EditorPreload?.localGit,
        cloudflare
    }) : undefined;
    const desktopBridge = view.EditorPreload?.localGitPublication;
    const cloudflareBridge = cloudflare && connectionSettings && createCloudflarePublicationBridge({
        ...cloudflare, view, getSession: connectionSettings.getSession
    });
    function publicationPort(bridge: PublicationBridge | undefined,
        bindPushSession?: NonNullable<typeof cloudflareBridge>['bindPushSession']): PullRequestPublication | undefined {
        if (!bridge || !connectionSettings) return undefined;
        const {getSession} = connectionSettings;
        return {
            pullRequestChecks: bridge.pullRequestChecks,
            mergeStatus: bridge.mergeStatus,
            mergePullRequest: bridge.mergePullRequest,
            prepare: ({root, guard, commit}) => createProjectPublication({bridge, guard,
                inspect: () => inspectPublicationRepository({root, getSession, guard, write: false}),
                async push(options, job) {
                    const session = bindPushSession?.(job) ??
                        await bindDesktopPublicationPushSession(getSession, options.remote, job);
                    await pushPublicationCommit({root, ...options, getSession: session, guard});
                }
            }).prepare(commit)
        };
    }
    const desktopPublication = publicationPort(desktopBridge ?? undefined);
    const cloudflarePublication = publicationPort(cloudflareBridge || undefined, cloudflareBridge ? cloudflareBridge.bindPushSession : undefined);
    if (view.EditorPreload && !connectionSettings?.modes.length) return null;
    const store = view.ReduxStore;
    if (!store || store.getState().scratchGui.vm !== vm) return null;
    const {runtime} = vm;
    const host = {
        vm,
        locale,
        getBlockly,
        ...blocks,
        markSaved: () => store.dispatch(__TW_PLUS_PROJECT_FOLDER_SET_UNCHANGED__()),
        isProjectDirty: () => store.getState().scratchGui.projectChanged,
        isRunning: () => store.getState().scratchGui.vmStatus.running ||
            runtime.threads.some(thread => !thread.updateMonitor && runtime.isActiveThread(thread)),
        subscribe: listener => store.subscribe(listener),
        refreshBlockViews: (targets: readonly (EditorTarget | ReloadTarget)[]) => refreshExternalBlockViews(vm, targets)
    } satisfies EditorHost;
    // A local browser test observes the same host object this attachment uses.
    if (typeof __TW_PLUS_CAPTURE_EDITOR_HOST__ === 'function') __TW_PLUS_CAPTURE_EDITOR_HOST__(host);
    let gitPanel: ReturnType<typeof mountGitPanel> = null;
    const renderReviewBlock = createScratchBlocksDiffRenderer({
        getBlockly: host.getBlockly,
        deserializeBlocks: host.deserializeBlocks,
        createBlockContainer: host.createBlockContainer,
        showUnregisteredBlocks: true,
        locale: host.locale,
        attachNavigation
    });
    const folder = mountProjectFolder({vm: host.vm, document, locale: host.locale, host: {
        blockReload: {
            isRunning: host.isRunning,
            subscribe: host.subscribe,
            onApplied(targets) {
                host.refreshBlockViews(targets);
                host.markSaved();
            },
            deserializeBlocks: host.deserializeBlocks,
            compareChanges: request => openProjectComparison(document, {...request, renderBlock: renderReviewBlock, locale: host.locale})
        },
        isProjectDirty: host.isProjectDirty,
        beforeLoad: () => store.dispatch(__TW_PLUS_PROJECT_FOLDER_SET_FILE_HANDLE__(null)),
        onOpened(title) {
            store.dispatch(__TW_PLUS_PROJECT_FOLDER_SET_TITLE__(loadedProjectTitle(vm) ?? title));
            host.markSaved();
        },
        onSaved() {
            host.markSaved();
            void gitPanel?.refresh();
        }
    }});
    if (folder) folders.set(vm, folder);
    if (!folder || !localGit) return folder;
    const workspace = getDocumentWorkspace(vm);
    const dirtyFiles = () => workspace.fileEdits().filter(file => file.directory === folder.directory);
    gitPanel = mountGitPanel({vm: host.vm, document, host: {
        connectionSettings,
        pullRequestPublication: () => connectionSettings?.getView().mode === 'desktop' ?
            desktopPublication : cloudflarePublication,
        // Stage and commit with the repository's own Git identity (#318).
        localWrite: {},
        renderReviewBlock,
        openProject: folder.openDirectory,
        projectDirectory: () => folder.directory,
        unsavedProjectPaths() {
            const paths = host.isProjectDirty() ? folder.unsavedPaths() : new Set<string>();
            return paths && new Set([...paths, ...dirtyFiles().map(file => file.path)]);
        },
        readUnsavedProjectFile(path) {
            const edit = dirtyFiles().find(file => file.path === path);
            return edit ? edit.readUnsaved?.() : host.isProjectDirty() ? folder.readUnsavedFile(path) : undefined;
        },
        subscribeProjectEdits(listener) {
            const stopProject = folder.subscribeEdits(listener);
            const stopFiles = workspace.subscribeSave(listener);
            return () => {stopProject(); stopFiles();};
        },
        async saveProjectFiles() {
            const directory = folder.directory;
            await flushPendingSurfaceEdits();
            if (directory !== folder.directory) throw new Error('Project folder changed');
            if (host.isProjectDirty()) await folder.save();
            for (const file of dirtyFiles()) {
                if (directory !== folder.directory) throw new Error('Project folder changed');
                await file.save();
                if (file.isDirty()) throw new Error('A file still has unsaved changes');
            }
        },
        // A transient tab beside the code, as the YAML documents open; the folder handle cannot outlive a reload.
        openPanel: request => workspace.open({...request, transient: true,
            pinWithProjectFolder: request.reference.documentId === 'local-git'}),
        // The same route as project search, so the code opens where people already work.
        openTargetCode(targetId) {
            const navigation = connectionFor(vm.runtime as unknown as Parameters<typeof connectionFor>[0]).navigation;
            if (!navigation || !activateTargetView(navigation, targetId, 0)) vm.setEditingTarget(targetId);
        },
        getWorkspace: async () => (await host.getBlockly()).getMainWorkspace() as never,
        isProjectDirty: () => host.isProjectDirty() || dirtyFiles().length > 0,
        isProjectRunning: host.isRunning,
        subscribe(listener) {
            const loaded = () => listener('loaded');
            const unsubscribe = host.subscribe(() => listener('changed'));
            const stopFiles = workspace.subscribeSave(() => listener('changed'));
            let directory = folder.directory;
            const unfollow = followProjectFolder(vm, (_folder, next) => {
                if (next === directory) return;
                directory = next;
                listener('folder');
            });
            vm.runtime.on('PROJECT_LOADED', loaded);
            return () => {unfollow(); unsubscribe(); stopFiles(); vm.runtime.off('PROJECT_LOADED', loaded);};
        }
    }});
    let disposed = false;
    let scheduled = false;
    const ensureProjectTab = () => {
        if (scheduled || workspace.saveScope !== 'tab') return;
        scheduled = true;
        queueMicrotask(() => {
            scheduled = false;
            if (!disposed && workspace.saveScope === 'tab') gitPanel?.open(document.documentElement.lang || locale, true);
        });
    };
    const stopProjectTab = workspace.subscribeSave(ensureProjectTab);
    ensureProjectTab();
    return {...folder, dispose() {
        disposed = true;
        stopProjectTab();
        gitPanel?.dispose();
        folder.dispose();
    }};
}
