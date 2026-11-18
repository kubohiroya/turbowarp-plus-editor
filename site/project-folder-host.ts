import {hasProjectVersionValidator, openProjectVersionPreview, packProjectVersion, validateProjectVersion} from './git-project-preview.ts';
import {chooseBrowserProject, createProjectFolder, followProjectFolder, mountProjectFolder, projectFolderActions}
    from '@kubohiroya/turbowarp-plus-editor-project-folder';
import type {FolderHost, FolderVM, ReloadTarget} from '@kubohiroya/turbowarp-plus-editor-project-folder';
import type {EditorHost, EditorTarget} from '@kubohiroya/turbowarp-plus-editor-host';
import {refreshExternalBlockViews} from '@kubohiroya/turbowarp-plus-editor-code-views';
import {createScratchBlocksDiffRenderer, inspectPublicationRepository, mountGitPanel, openProjectComparison, openRemoteRepositoryDialog,
    pushPublicationCommit}
    from '@kubohiroya/turbowarp-plus-editor-git';
import {createGitConnectionSettings} from '@kubohiroya/turbowarp-plus-editor-auth';
import type {DesktopGitPreload} from '@kubohiroya/turbowarp-plus-editor-auth';
import type {GitAuthor, PullRequestPublication, ScratchBlockDiffRendererOptions} from '@kubohiroya/turbowarp-plus-editor-git';
import type {ProjectCommitJob, ProjectCommitPort} from '@kubohiroya/turbowarp-plus-editor-git/project-commit-dialog';
import {bindDesktopPublicationPushSession, createProjectPublication} from '@kubohiroya/turbowarp-plus-editor-git/project-publication';
import type {PublicationBridge, ProjectPublicationPort}
    from '@kubohiroya/turbowarp-plus-editor-git/project-publication';
import {createCloudflarePublicationBridge} from '@kubohiroya/turbowarp-plus-editor-git/cloudflare-publication';
import {loadedProjectTitle, projectSaveName, projectScreenState, setProjectSaveName, showProjectNotice} from './project-tools/index.ts';
import {askSaveName, isValidSaveName, suggestSaveName} from '@kubohiroya/turbowarp-plus-editor-workbench/project-file-dialogs';
import {projectTitleFieldClassName} from '@kubohiroya/turbowarp-plus-editor-workbench/project-info-menu';
import {flushPendingSurfaceEdits} from '@kubohiroya/turbowarp-plus-editor-windows/surfaces';
import {getDocumentWorkspace} from '@kubohiroya/turbowarp-plus-editor-workbench/sprite-tabs';
import {activateTargetView, connectionFor} from '@kubohiroya/turbowarp-plus-editor-project-model/project-search-connections';
import {bindProjectRepositoryCreation} from './project-repository-host.ts';
import type {BrowserRepositoryFolders, DesktopRepositoryCreation} from './project-repository-host.ts';
import {withProjectFolderTitle} from './project-tools/properties.ts';

type RuntimeThread = {updateMonitor?: boolean};
type ProjectFolderVM = FolderVM & EditorHost['vm'] & {
    runtime: {threads: RuntimeThread[]; isActiveThread(thread: RuntimeThread): boolean};
    setEditingTarget(id: string): void;
};
type Action = {type: string};
type GuiStore = {
    getState(): {scratchGui: {vm: FolderVM; projectChanged: boolean; projectTitle: string; vmStatus: {running: boolean}}};
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
};
type GitCommitMount = NonNullable<ReturnType<typeof mountGitPanel>> & {
    getCommitRepository?(): {root: FileSystemDirectoryHandle; current(): boolean} | null;
    selectRepository?(root: FileSystemDirectoryHandle, project: FileSystemDirectoryHandle): Promise<boolean>;
    clearRepository?(): void;
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
export interface ProjectFolderWorkflows {
    /**
     * Creates a project folder from the current project and opens it. `title` names a folder made in the browser, where
     * the user names a new folder instead of picking one. `destination` is `browser` for a new folder in the browser's
     * storage, or an empty folder already picked on the device; without it the folder follows `folderLocation`.
     */
    createFolder?(serialize: () => Promise<Uint8Array>, current: () => boolean, title?: string,
        destination?: 'browser' | FileSystemDirectoryHandle): Promise<boolean>;
    /** Writes the current project into a new folder and leaves the open project as it is (Save a Copy, #679). */
    copyFolder?(serialize: () => Promise<Uint8Array>, current: () => boolean, title?: string): Promise<boolean>;
    /** Picks an empty folder on the device for a new project; `null` when the person cancelled. */
    pickEmptyFolder?(language: string): Promise<FileSystemDirectoryHandle | null>;
    /** Where new project folders can be made: the browser's own storage, and folders picked on the device. */
    locations?: {browser: boolean; device: boolean};
    /** Marks the open project as saved, for a new default project that is about to be replaced by its folder. */
    markSaved?(): void;
    /** `browser` when new project folders go to the browser's own storage, where there is no folder picker. */
    folderLocation?: 'device' | 'browser';
    repositoryCreation?: NonNullable<ReturnType<typeof bindProjectRepositoryCreation>>;
    commit?: ProjectCommitPort;
    publication?: ProjectPublicationPort;
}
type PickerWindow = Window & {
    EditorPreload?: {
        localGitAuth?: DesktopGitPreload | null;
        localGit?: DesktopGitPreload | null;
        localGitCreation?: DesktopRepositoryCreation | null;
        localGitPublication?: PublicationBridge | null;
        localGitAuthor?(): Promise<GitAuthor | null>;
    };
    ReduxStore?: GuiStore;
    showDirectoryPicker?(options: {id: string; mode: 'readwrite'}): Promise<FileSystemDirectoryHandle>;
};
const gitCloudflare = () => typeof __TW_PLUS_GIT_CLOUDFLARE__ === 'undefined' ? null : __TW_PLUS_GIT_CLOUDFLARE__;
const gitDesktop = (view: PickerWindow) => view.EditorPreload?.localGitAuth ?? view.EditorPreload?.localGit;

const folders = new WeakMap<FolderVM, {folder: LocalFolderMount; workflows(): ProjectFolderWorkflows;
    openRemote?(locale: string): void}>();

export const projectFolderWorkflows = (vm: FolderVM) => folders.get(vm)?.workflows();
/** Opens a remote Git repository: clones it, then opens the project at its root (#676). */
export const projectFolderOpenRemote = (vm: FolderVM) => folders.get(vm)?.openRemote;

/** The folder the loaded project came from, so its Dockview layout is kept apart from other projects. */
export const projectFolderDirectory = (vm: FolderVM) => folders.get(vm)?.folder.directory ?? null;

export function attachProjectFolder(vm: ProjectFolderVM, document: Document, localGit: boolean, gitRestoreVersion: boolean, locale: string,
    getBlockly: ScratchBlockDiffRendererOptions['getBlockly'],
    blocks: Pick<EditorHost, 'deserializeBlocks' | 'createBlockContainer'>,
    attachNavigation?: ScratchBlockDiffRendererOptions['attachNavigation']) {
    const view = document?.defaultView as PickerWindow;
    if (!view || typeof __TW_PLUS_PROJECT_FOLDER_SET_FILE_HANDLE__ === 'undefined') return null;
    const cloudflare = gitCloudflare();
    const connectionSettings = localGit ? createGitConnectionSettings({
        desktop: gitDesktop(view),
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
        // A project folder is not an SB3, so it keeps the screen state the project tools installed for this VM.
        screenState: {
            serialize: () => projectScreenState(vm)?.serialize(),
            prepareLoad: text => projectScreenState(vm)?.prepareLoad(text),
            register: (key, slice) => projectScreenState(vm)?.register(key, slice) ?? (() => {})
        },
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
    // Folders saved in the browser are offered in every browser, beside the device's folders where the browser has them.
    const folder = mountProjectFolder({vm: host.vm, document, locale: host.locale, host: folderHost,
        browserStorage: 'always'}) as LocalFolderMount | null;
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
    const browserStorage = folder.browserProjects;
    // A new folder in the browser's storage, named by the project title, removed again when nothing is written to it.
    const withNewBrowserFolder = async (title: string | undefined, run: (directory: FileSystemDirectoryHandle) => Promise<boolean>) => {
        const project = await browserStorage!.create(title || 'Project', {projectPath: ''});
        let kept = false;
        try {
            kept = await run(project.root);
            return kept;
        } finally {
            if (!kept) await browserStorage!.remove(project.id).catch(() => {});
        }
    };
    const createFolder = folder.createFromSnapshot && unpackProject ?
        async (serialize: () => Promise<Uint8Array>, current: () => boolean, title?: string,
            destination?: 'browser' | FileSystemDirectoryHandle) => {
            const create = async (directory?: FileSystemDirectoryHandle) => {
                try {
                    return await folder.createFromSnapshot({current, collectEdits: flushPendingSurfaceEdits, title, directory,
                        prepareFiles: () => unpackProject(serialize, current)}) === 'opened';
                } catch (error) {
                    if ((error as DOMException).name === 'AbortError') return false;
                    throw error;
                }
            };
            if (destination === 'browser') return browserStorage ? withNewBrowserFolder(title, create) : false;
            return create(destination);
        } : undefined;
    const folderLocation = folder.browserProjects && !view.showDirectoryPicker ? 'browser' as const : 'device' as const;
    const isEmptyFolder = async (directory: FileSystemDirectoryHandle) => {
        for await (const _entry of (directory as unknown as {values(): AsyncIterable<unknown>}).values()) return false;
        return true;
    };
    const pickEmptyFolder = typeof view.showDirectoryPicker === 'function' ? async (language: string) => {
        let directory: FileSystemDirectoryHandle;
        try {
            directory = await view.showDirectoryPicker!({id: 'turbowarp-plus-project-folder', mode: 'readwrite'});
        } catch (error) {
            if ((error as DOMException).name === 'AbortError') return null;
            throw error;
        }
        if (!await isEmptyFolder(directory)) throw new Error(language.startsWith('ja') ? '空のフォルダを選んでください。' : 'Choose an empty folder.');
        return directory;
    } : undefined;
    // Save a Copy writes the folder without opening it, so the open project keeps its own file or folder (#679).
    const copyFolder = unpackProject ? async (serialize: () => Promise<Uint8Array>, current: () => boolean, title?: string) => {
        const write = async (directory: FileSystemDirectoryHandle, picked: boolean) => {
            try {
                const overwrite = picked && !await isEmptyFolder(directory);
                if (!current() || overwrite && !view.confirm(locale.startsWith('ja') ?
                    '指定されたフォルダは空ではありません。フォルダに保存されている内容が上書きされる場合があります。よろしいですか？' :
                    'The selected folder is not empty. Contents in the folder may be overwritten. Continue?')) return false;
                await flushPendingSurfaceEdits();
                if (!current()) return false;
                const files = await unpackProject(serialize, current);
                await createProjectFolder({directory, files, storage: vm.runtime.storage, overwrite, current});
                return true;
            } catch (error) {
                if ((error as DOMException).name === 'AbortError') return false;
                throw error;
            }
        };
        if (folderLocation === 'browser') return browserStorage ? withNewBrowserFolder(title, directory => write(directory, false)) : false;
        let directory: FileSystemDirectoryHandle;
        try {
            directory = await view.showDirectoryPicker!({id: 'turbowarp-plus-project-folder', mode: 'readwrite'});
        } catch (error) {
            if ((error as DOMException).name === 'AbortError') return false;
            throw error;
        }
        return write(directory, true);
    } : undefined;
    const locations = {browser: Boolean(browserStorage), device: typeof view.showDirectoryPicker === 'function'};
    // Without the folder picker, repositories live in the browser's storage, with the project folder inside (#660).
    const browserProjects = folderLocation === 'browser' ? folder.browserProjects : null;
    const browserFolders: BrowserRepositoryFolders | undefined = browserProjects ? {
        async create(title) {
            // One repository holds one project at its root; the initial commit is written into the empty folder.
            return (await browserProjects.create(title, {projectPath: ''})).root;
        },
        async choose() {
            const choice = await chooseBrowserProject({document, projects: browserProjects, locale, purpose: 'open'});
            return choice && browserProjects.root(choice.project.id);
        }
    } : undefined;
    const repositoryCreation = localGit && createFolder ? bindProjectRepositoryCreation({
        view, locale, desktop: view.EditorPreload?.localGitCreation,
        cloudflare,
        browserFolders,
        createBrowserFolder: browserStorage ? async title => (await browserStorage.create(title, {projectPath: ''})).root : undefined,
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
        mode: 'desktop' | 'cloudflare'; port: ProjectPublicationPort} | undefined;
    const workflows = (): ProjectFolderWorkflows => {
        const common = {createFolder, copyFolder, pickEmptyFolder, locations, markSaved: host.markSaved, folderLocation, repositoryCreation};
        const directory = folder.directory;
        const repository = gitPanel?.getCommitRepository?.();
        if (!directory || !repository || !folder.save || !saveWithLock ||
            typeof __TW_PLUS_CREATE_SAVE_COMMIT_QUEUE__ !== 'function' ||
            typeof __TW_PLUS_CREATE_SAVE_COMMIT_JOURNAL__ !== 'function' || !view.indexedDB) return common;
        const guard = () => {
            if (!repository.current() || folder.directory !== directory || store.getState().scratchGui.vm !== vm) {
                throw Object.assign(new Error('The project or repository changed'), {code: 'changed'});
            }
        };
        const publicationBridge = view.EditorPreload?.localGitPublication;
        const desktopPublication = typeof publicationBridge?.repository === 'function';
        const mode = connectionSettings?.getView().mode ?? (desktopPublication ? 'desktop' : 'cloudflare');
        const canPublish = connectionSettings && (mode === 'desktop' ? desktopPublication : cloudflare);
        if (canPublish && (!publication || publication.directory !== directory || publication.root !== repository.root ||
            publication.mode !== mode || !publication.current())) {
            const access: PublicationGitAccess = {root: repository.root, guard, async getSession(remote, write) {
                guard();
                const session = await connectionSettings.getSession(remote, write);
                guard();
                return session?.connection.mode === mode ? session : null;
            }};
            const cloudflareBridge = mode === 'cloudflare' ? createCloudflarePublicationBridge({
                ...cloudflare, view, getSession: access.getSession
            }) : undefined;
            publication = {directory, root: repository.root, mode, current: repository.current, port: createProjectPublication({
                bridge: cloudflareBridge ?? publicationBridge,
                inspect: () => inspectPublicationRepository(access),
                async push(options, job) {
                    const getSession = cloudflareBridge ? cloudflareBridge.bindPushSession(job) :
                        await bindDesktopPublicationPushSession(access.getSession, options.remote, job);
                    try {
                        await pushPublicationCommit({...access, ...options, getSession});
                    } catch (error) {
                        if (!await getSession(options.remote, true).catch(() => null)) throw new Error('SESSION_REQUIRED');
                        throw error;
                    }
                },
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
        return {...common, publication: canPublish ? publication?.port : undefined, commit: {
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
    // Open Remote Git Repository…: a read session clones the repository into an empty folder on the device or in the
    // browser, then the root opens as the project folder and the Git panel binds to it.
    const openRemote = connectionSettings ? (language: string) => {
        const projects = folder.browserProjects;
        const created = new Map<FileSystemDirectoryHandle, string>();
        void openRemoteRepositoryDialog({
            document, locale: language, connectionSettings,
            deviceFolders: typeof view.showDirectoryPicker === 'function',
            ...typeof view.showDirectoryPicker === 'function' && {async pickDeviceFolder() {
                let directory: FileSystemDirectoryHandle;
                try {
                    directory = await view.showDirectoryPicker!({id: 'turbowarp-plus-remote-repository', mode: 'readwrite'});
                } catch (error) {
                    if ((error as DOMException).name === 'AbortError') return null;
                    throw error;
                }
                for await (const _entry of (directory as unknown as {values(): AsyncIterable<unknown>}).values()) {
                    view.alert(language.startsWith('ja') ? '空のフォルダを選んでください。' : 'Choose an empty folder.');
                    return null;
                }
                return directory;
            }},
            ...projects && {
                async createBrowserFolder(name: string) {
                    const project = await projects.create(name, {projectPath: ''});
                    created.set(project.root, project.id);
                    return project.root;
                },
                async removeBrowserFolder(handle: FileSystemDirectoryHandle) {
                    const id = created.get(handle);
                    if (id) await projects.remove(id);
                }
            },
            openProject: (root: FileSystemDirectoryHandle) => folder.openDirectory(root, () => view.confirm(
                language.startsWith('ja') ? '現在の作品に未保存の変更があります。リポジトリの作品を開きますか？' :
                    'The current project has unsaved changes. Open the repository\'s project?'), root, {locale: language})
        });
    } : undefined;
    folders.set(vm, {folder, workflows, openRemote});
    const stopTitleWatch = watchTitleCommits(document, () => store.getState().scratchGui.projectTitle, title => {
        void reflectProjectTitle(title).catch(() => {});
    });
    // A title the person committed in the menu bar renames what the browser can rename, and says what it cannot (#679).
    async function reflectProjectTitle(title: string) {
        const directory = folder.directory;
        const repository = Boolean(gitPanel?.getCommitRepository?.());
        if (!directory || !title.trim()) return;
        const language = document.documentElement.lang || locale;
        const ja = language.startsWith('ja');
        const entry = browserStorage ? await browserStorage.find(folder.root ?? directory).catch(() => null) : null;
        if (folder.directory !== directory) return;
        if (entry) await browserStorage!.rename(entry.id, title).catch(() => {});
        if (!isValidSaveName(title) && !projectSaveName(vm)) {
            const name = await askSaveName({document, locale: language, title, current: suggestSaveName(title) || undefined});
            if (name && folder.directory === directory) setProjectSaveName(vm, name);
        }
        const notes = [];
        if (!entry) notes.push(ja ?
            'この作品のフォルダは手元のフォルダなので、フォルダ名は変わりません（ブラウザー版では手元のフォルダ名を変えられません）。' :
            'This project folder is on your device, so its name stays as it is (the browser version cannot rename folders on your device).');
        // Renaming the GitHub repository needs the keybroker's rename route first (#681).
        if (repository) notes.push(ja ? 'Git のリポジトリの名前は、まだ変わりません。' : 'The Git repository keeps its name for now.');
        if (notes.length) showProjectNotice(vm, notes.join(' '), language);
    }
    let author: GitAuthor | undefined;
    if (localGit) void readAuthor().then(value => {author = value;});
    if (!localGit) return {...folder, dispose() {
        stopTitleWatch();
        if (folders.get(vm)?.folder === folder) folders.delete(vm);
        folder.dispose();
    }};
    const workspace = getDocumentWorkspace(vm);
    const dirtyFiles = () => workspace.fileEdits().filter(file => file.directory === folder.directory);
    gitPanel = mountGitPanel({vm: host.vm, document, host: {
        connectionSettings,
        pullRequestPublication: () => connectionSettings?.getView().mode === 'desktop' ?
            desktopPublication : cloudflarePublication,
        // Stage and commit with the repository's own Git identity (#318).
        localWrite: {author: () => author},
        ...browserFolders && {chooseRoot: browserFolders.choose},
        // Git is set up by opening a folder, with the File menu's own commands; the panel no longer chooses a repository.
        openFolder: language => projectFolderActions(vm, language)?.open(),
        ...folder.browserProjects && {openBrowserFolder: (language: string) => projectFolderActions(vm, language)?.openBrowser?.()},
        deviceFolders: typeof view.showDirectoryPicker === 'function',
        renderReviewBlock,
        // A folder that is not a project shows project-folder's own dialog; the panel hears that nothing opened.
        openProject: async (directory, confirmReplace) =>
            await folder.openDirectory(directory, confirmReplace) === 'opened' ? 'opened' : 'cancelled',
        projectDirectory: () => folder.directory,
        ...hasProjectVersionValidator() && {
            restoreProjectVersions: gitRestoreVersion,
            validateProjectVersion,
            async previewProjectVersion({oid, files}) {
                openProjectVersionPreview(document, oid, await packProjectVersion(files), locale);
            }
        },
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
    // One repository holds one project: an opened folder with `.git` binds the Git panel to that repository, any other
    // folder unbinds it. `root` is the folder the user chose, which may hold the project in `project/`.
    let boundDirectory: FileSystemDirectoryHandle | null | undefined;
    const unfollowBinding = followProjectFolder(vm, (_folder, directory, root) => {
        if (directory === boundDirectory) return;
        boundDirectory = directory;
        const candidate = root ?? directory;
        void (async () => {
            const repository = candidate && await hasGitDirectory(candidate) ? candidate : null;
            if (boundDirectory !== directory) return;
            if (repository && directory) await gitPanel?.selectRepository?.(repository, directory);
            else gitPanel?.clearRepository?.();
        })();
    });
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
        stopTitleWatch();
        stopProjectTab();
        if (folders.get(vm)?.folder === folder) folders.delete(vm);
        unfollowBinding();
        gitPanel?.dispose();
        folder.dispose();
    }};
}

/**
 * Calls `commit` with the new title when the person commits an edit of the menu bar's title field, on Enter or when
 * the field loses focus, as the GUI's own field does. Titles set by loading, a new project or the properties are not
 * edits of the field, so they are not reported.
 */
function watchTitleCommits(document: Document, readTitle: () => string, commit: (title: string) => void) {
    const view = document.defaultView;
    if (!view) return () => {};
    const isTitleField = (target: EventTarget | null) =>
        target instanceof view.HTMLInputElement && target.classList.contains(projectTitleFieldClassName);
    let before: string | null = null;
    let scheduled = false;
    const focus = (event: Event) => {
        if (isTitleField(event.target) && !scheduled) before = readTitle();
    };
    const settle = (event: Event) => {
        if (before === null || scheduled || !isTitleField(event.target)) return;
        if (event.type === 'keydown' && ((event as KeyboardEvent).key !== 'Enter' || (event as KeyboardEvent).isComposing)) return;
        const previous = before;
        scheduled = true;
        // The field writes the title after this event (Enter also blurs it); read it once the GUI has handled both.
        view.setTimeout(() => {
            scheduled = false;
            const title = readTitle();
            before = isTitleField(document.activeElement) ? title : null;
            if (title !== previous) commit(title);
        }, 0);
    };
    document.addEventListener('focusin', focus, true);
    document.addEventListener('keydown', settle, true);
    document.addEventListener('change', settle, true);
    document.addEventListener('focusout', settle, true);
    return () => {
        document.removeEventListener('focusin', focus, true);
        document.removeEventListener('keydown', settle, true);
        document.removeEventListener('change', settle, true);
        document.removeEventListener('focusout', settle, true);
    };
}

/** Whether `directory` is the root of a Git repository, as the Git panel opens one. */
async function hasGitDirectory(directory: FileSystemDirectoryHandle) {
    try {
        await directory.getDirectoryHandle('.git');
        return true;
    } catch {
        return false;
    }
}
