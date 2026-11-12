import {mountProjectFolder} from '@kubohiroya/turbowarp-plus-editor-project-folder';
import type {FolderHost, FolderVM, ReloadTarget} from '@kubohiroya/turbowarp-plus-editor-project-folder';
import type {EditorHost, EditorTarget} from '@kubohiroya/turbowarp-plus-editor-host';
import {refreshExternalBlockViews} from '@kubohiroya/turbowarp-plus-editor-views';
import {createScratchBlocksDiffRenderer, mountGitPanel, openProjectComparison} from '@kubohiroya/turbowarp-plus-editor-git';
import {createGitConnectionSettings} from '@kubohiroya/turbowarp-plus-editor-auth';
import type {DesktopGitPreload} from '@kubohiroya/turbowarp-plus-editor-auth';
import type {GitAuthor, ScratchBlockDiffRendererOptions} from '@kubohiroya/turbowarp-plus-editor-git';
import type {ProjectCommitJob, ProjectCommitPort} from '@kubohiroya/turbowarp-plus-editor-ui/project-commit-dialog';
import {createProjectPublication} from '@kubohiroya/turbowarp-plus-editor-ui/project-publication';
import type {DesktopPublicationBridge, ProjectPublicationPort, PublicationRepository}
    from '@kubohiroya/turbowarp-plus-editor-ui/project-publication';
import {loadedProjectTitle} from './project-tools/index.ts';
import {flushPendingSurfaceEdits} from '@kubohiroya/turbowarp-editor-surfaces';
import {getDocumentWorkspace} from '@kubohiroya/turbowarp-plus-editor-workbench/sprite-tabs';
import {activateTargetView, connectionFor} from '@kubohiroya/turbowarp-plus-editor-ui/project-search-connections';
import {bindProjectRepositoryCreation} from './project-repository-host.ts';
import type {DesktopRepositoryCreation} from './project-repository-host.ts';
import {withProjectFolderTitle} from './project-tools/properties.ts';

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

type LocalFolderMount = NonNullable<ReturnType<typeof mountProjectFolder>> & {
    save?(): Promise<unknown>;
    createFromSnapshot?(options: {directory: FileSystemDirectoryHandle; current(): boolean;
        prepareFiles(): Promise<ReadonlyMap<string, Uint8Array>>}): Promise<'opened' | 'cancelled'>;
};
type GitCommitMount = NonNullable<ReturnType<typeof mountGitPanel>> & {
    getCommitRepository?(): {root: FileSystemDirectoryHandle; current(): boolean} | null;
    selectRepository?(root: FileSystemDirectoryHandle, project: FileSystemDirectoryHandle): Promise<boolean>;
};
type Selection = {branch: string; files: {path: string}[]};
type CommitQueue = {
    capture(): Promise<Selection>;
    enqueue(input: {selection: Selection; message: string}): Promise<ProjectCommitJob>;
    list(): Promise<ProjectCommitJob[]>;
    run(id: string): Promise<ProjectCommitJob>;
};
type CommitJournal = unknown;
declare const __TW_PLUS_UNPACK_PROJECT_FOLDER__: (data: Uint8Array) =>
    {files: ReadonlyMap<string, Uint8Array>; warnings: readonly {path: string}[]};
declare const __TW_PLUS_CREATE_SAVE_COMMIT_QUEUE__: (options: {root: FileSystemDirectoryHandle; journal: CommitJournal;
    projectFolder: string; guard(): void; author?(): Promise<GitAuthor | undefined>}) => CommitQueue;
declare const __TW_PLUS_CREATE_SAVE_COMMIT_JOURNAL__: (factory: IDBFactory) => CommitJournal;
declare const __TW_PLUS_PROJECT_SAVE_LOCK__: <T>(operation: () => Promise<T>) => Promise<T>;
type PublicationGitAccess = {
    root: FileSystemDirectoryHandle;
    getSession: ReturnType<typeof createGitConnectionSettings>['getSession'];
    guard(): void;
};
declare const __TW_PLUS_INSPECT_PUBLICATION_REPOSITORY__: (options: PublicationGitAccess) => Promise<PublicationRepository>;
declare const __TW_PLUS_PUSH_PUBLICATION_COMMIT__: (options: PublicationGitAccess & {
    remote: string; oid: string; ref: string;
}) => Promise<void>;

export interface ProjectFolderWorkflows {
    createFolder?(serialize: () => Promise<Uint8Array>, current: () => boolean): Promise<boolean>;
    repositoryCreation?: NonNullable<ReturnType<typeof bindProjectRepositoryCreation>>;
    commit?: ProjectCommitPort;
    publication?: ProjectPublicationPort;
}
type PickerWindow = Window & {
    showDirectoryPicker?(options: {id: string; mode: 'readwrite'}): Promise<FileSystemDirectoryHandle>;
    EditorPreload?: {
        localGitAuth?: DesktopGitPreload | null;
        localGit?: DesktopGitPreload | null;
        localGitCreation?: DesktopRepositoryCreation | null;
        localGitPublication?: DesktopPublicationBridge | null;
        localGitAuthor?(): Promise<GitAuthor | null>;
    };
    ReduxStore?: GuiStore;
};
const folders = new WeakMap<FolderVM, {folder: LocalFolderMount; workflows(): ProjectFolderWorkflows}>();

export const projectFolderWorkflows = (vm: FolderVM) => folders.get(vm)?.workflows();

/** The folder the loaded project came from, so its Dockview layout is kept apart from other projects. */
export const projectFolderDirectory = (vm: FolderVM) => folders.get(vm)?.folder.directory ?? null;

export function attachProjectFolder(vm: ProjectFolderVM, document: Document, localGit: boolean, locale: string,
    getBlockly: ScratchBlockDiffRendererOptions['getBlockly'],
    blocks: Pick<EditorHost, 'deserializeBlocks' | 'createBlockContainer'>,
    attachNavigation?: ScratchBlockDiffRendererOptions['attachNavigation']) {
    const view = document?.defaultView as PickerWindow;
    if (!view || typeof __TW_PLUS_PROJECT_FOLDER_SET_FILE_HANDLE__ === 'undefined') return null;
    const connectionSettings = localGit ? createGitConnectionSettings({
        desktop: view.EditorPreload?.localGitAuth ?? view.EditorPreload?.localGit,
        cloudflare: typeof __TW_PLUS_GIT_CLOUDFLARE__ === 'undefined' ? null : __TW_PLUS_GIT_CLOUDFLARE__
    }) : undefined;
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
    let gitPanel: GitCommitMount | null = null;
    const saveWithLock = typeof __TW_PLUS_PROJECT_SAVE_LOCK__ === 'function' ? __TW_PLUS_PROJECT_SAVE_LOCK__ : undefined;
    const readAuthor = async () => {
        try {
            return await view.EditorPreload?.localGitAuthor?.() ?? undefined;
        } catch {
            return undefined;
        }
    };
    const renderReviewBlock = createScratchBlocksDiffRenderer({
        getBlockly: host.getBlockly,
        deserializeBlocks: host.deserializeBlocks,
        createBlockContainer: host.createBlockContainer,
        showUnregisteredBlocks: true,
        locale: host.locale,
        attachNavigation
    });
    const folderHost: FolderHost & {saveWithLock?: typeof saveWithLock} = {
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
        saveWithLock,
        beforeLoad: () => store.dispatch(__TW_PLUS_PROJECT_FOLDER_SET_FILE_HANDLE__(null)),
        onOpened(title) {
            store.dispatch(__TW_PLUS_PROJECT_FOLDER_SET_TITLE__(loadedProjectTitle(vm) ?? title));
            host.markSaved();
        },
        onSaved() {
            host.markSaved();
            void gitPanel?.refresh();
        }
    };
    const folder = mountProjectFolder({vm: host.vm, document, locale: host.locale, host: folderHost}) as LocalFolderMount | null;
    if (!folder) return null;
    const unpackProject = typeof __TW_PLUS_UNPACK_PROJECT_FOLDER__ === 'function' ?
        async (serialize: () => Promise<Uint8Array>, current: () => boolean) => {
            const {files, warnings} = __TW_PLUS_UNPACK_PROJECT_FOLDER__(await serialize());
            if (!current()) throw new DOMException('Cancelled', 'AbortError');
            if (warnings.length) {
                const paths = warnings.slice(0, 6).map(warning => warning.path).join('\n') +
                    (warnings.length > 6 ? '\n…' : '');
                const notice = locale.startsWith('ja') ?
                    '作品から参照されていないファイルは新しいフォルダに入りません。保存しますか？' :
                    'Unreferenced files will be omitted from the new project folder. Save the folder?';
                if (!view.confirm(notice + '\n\n' + paths)) throw new DOMException('Cancelled', 'AbortError');
            }
            return files;
        } : undefined;
    const createFolder = folder.createFromSnapshot && unpackProject ?
        async (serialize: () => Promise<Uint8Array>, current: () => boolean) => {
            try {
                // Request the picker before awaiting work so it retains the Save click's activation.
                const directory = await view.showDirectoryPicker({id: 'turbowarp-plus-project-folder', mode: 'readwrite'});
                if (!current()) return false;
                await flushPendingSurfaceEdits();
                if (!current()) return false;
                return await folder.createFromSnapshot({directory, current, prepareFiles: () => unpackProject(serialize, current)}) === 'opened';
            } catch (error) {
                if ((error as DOMException).name === 'AbortError') return false;
                throw error;
            }
        } : undefined;
    const repositoryCreation = localGit && createFolder ? bindProjectRepositoryCreation({
        view, locale, desktop: view.EditorPreload?.localGitCreation,
        cloudflare: typeof __TW_PLUS_GIT_CLOUDFLARE__ === 'undefined' ? undefined : __TW_PLUS_GIT_CLOUDFLARE__,
        author: readAuthor,
        async prepareSource(serialize, current, title) {
            await flushPendingSurfaceEdits();
            if (!current()) return null;
            let edited = false;
            const stage = vm.runtime.getTargetForStage();
            const changed = () => {edited = true;};
            vm.on('PROJECT_CHANGED', changed);
            try {
                const files = await unpackProject(serialize, () => current() && !edited && stage === vm.runtime.getTargetForStage());
                return withProjectFolderTitle(files, title);
            } finally {
                vm.off('PROJECT_CHANGED', changed);
            }
        },
        async openProject(project, root) {
            if (await folder.openDirectory(project, () => view.confirm(locale.startsWith('ja') ?
                '現在の作品に未保存の変更があります。保存済みの作品フォルダを開きますか？' :
                'The current project has unsaved changes. Open the saved project folder?')) !== 'opened') return false;
            await gitPanel?.selectRepository?.(root, project);
            return true;
        }
    }) : undefined;
    let journal: CommitJournal;
    let publication: {directory: FileSystemDirectoryHandle; root: FileSystemDirectoryHandle; current(): boolean;
        port: ProjectPublicationPort} | undefined;
    const workflows = (): ProjectFolderWorkflows => {
        const directory = folder.directory;
        const repository = gitPanel?.getCommitRepository?.();
        if (!directory || !repository || !folder.save || !saveWithLock ||
            typeof __TW_PLUS_CREATE_SAVE_COMMIT_QUEUE__ !== 'function' ||
            typeof __TW_PLUS_CREATE_SAVE_COMMIT_JOURNAL__ !== 'function' || !view.indexedDB) return {createFolder, repositoryCreation};
        const guard = () => {
            if (!repository.current() || folder.directory !== directory || store.getState().scratchGui.vm !== vm) {
                throw Object.assign(new Error('The project or repository changed'), {code: 'changed'});
            }
        };
        const publicationBridge = view.EditorPreload?.localGitPublication;
        const canPublish = typeof publicationBridge?.repository === 'function' && connectionSettings &&
            typeof __TW_PLUS_INSPECT_PUBLICATION_REPOSITORY__ === 'function' &&
            typeof __TW_PLUS_PUSH_PUBLICATION_COMMIT__ === 'function';
        if (canPublish && (!publication || publication.directory !== directory || publication.root !== repository.root ||
            !publication.current())) {
            const access: PublicationGitAccess = {root: repository.root, guard, async getSession(remote, write) {
                const session = await connectionSettings.getSession(remote, write);
                return session?.connection.mode === 'desktop' ? session : null;
            }};
            publication = {directory, root: repository.root, current: repository.current, port: createProjectPublication({
                bridge: publicationBridge,
                inspect: () => __TW_PLUS_INSPECT_PUBLICATION_REPOSITORY__(access),
                push: options => __TW_PLUS_PUSH_PUBLICATION_COMMIT__({...access, ...options}),
                guard
            })};
        }
        let queue: Promise<CommitQueue>;
        const getQueue = () => queue ??= (async () => {
            guard();
            const relative = await repository.root.resolve(directory);
            guard();
            if (!relative) throw Object.assign(new Error('Select the repository containing the open project folder'), {code: 'outsideRepository'});
            journal ??= __TW_PLUS_CREATE_SAVE_COMMIT_JOURNAL__(view.indexedDB);
            return __TW_PLUS_CREATE_SAVE_COMMIT_QUEUE__({root: repository.root, journal, projectFolder: relative.join('/'),
                guard, author: readAuthor});
        })();
        return {createFolder, repositoryCreation, publication: canPublish ? publication?.port : undefined, commit: {
            async prepare(current) {
                const queue = await getQueue();
                const selection = await saveWithLock(async () => {
                    if (!current()) return null;
                    guard();
                    await flushPendingSurfaceEdits();
                    if (!current()) return null;
                    guard();
                    await folder.save();
                    return current() ? queue.capture() : null;
                });
                if (!selection) return null;
                return {branch: selection.branch, paths: selection.files.map(file => file.path),
                    enqueue: message => queue.enqueue({selection, message})};
            },
            async jobs() {return (await getQueue()).list();},
            async run(id) {
                const job = await (await getQueue()).run(id);
                void gitPanel?.refresh();
                return job;
            }
        }};
    };
    folders.set(vm, {folder, workflows});
    let author: GitAuthor | undefined;
    if (localGit) void readAuthor().then(value => {author = value;});
    if (localGit) gitPanel = mountGitPanel({vm: host.vm, document, host: {
        connectionSettings,
        // Stage and commit with the repository's own Git identity (#318).
        localWrite: {author: () => author},
        renderReviewBlock,
        openProject: folder.openDirectory,
        // A transient tab beside the code, as the YAML documents open; the folder handle cannot outlive a reload.
        openPanel: request => getDocumentWorkspace(vm).open({...request, transient: true}),
        // The same route as project search, so the code opens where people already work.
        openTargetCode(targetId) {
            const navigation = connectionFor(vm.runtime as unknown as Parameters<typeof connectionFor>[0]).navigation;
            if (!navigation || !activateTargetView(navigation, targetId, 0)) vm.setEditingTarget(targetId);
        },
        getWorkspace: async () => (await host.getBlockly()).getMainWorkspace() as never,
        isProjectDirty: host.isProjectDirty,
        isProjectRunning: host.isRunning,
        subscribe(listener) {
            const loaded = () => listener('loaded');
            const unsubscribe = host.subscribe(() => listener('changed'));
            vm.runtime.on('PROJECT_LOADED', loaded);
            return () => {unsubscribe(); vm.runtime.off('PROJECT_LOADED', loaded);};
        }
    }});
    return {...folder, dispose() {
        if (folders.get(vm)?.folder === folder) folders.delete(vm);
        gitPanel?.dispose();
        folder.dispose();
    }};
}
