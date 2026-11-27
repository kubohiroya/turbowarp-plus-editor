import {createProjectFolderIntegration} from '@kubohiroya/turbowarp-plus-editor-workbench/project-folder-integration';
import type {ProjectRepositoryHostServices} from '@kubohiroya/turbowarp-plus-editor-git/project-repository-host';
import type {EditorHost} from '@kubohiroya/turbowarp-plus-editor-host';
import type {GitAuthor} from '@kubohiroya/turbowarp-plus-editor-git';
import {hasProjectVersionValidator, validateProjectVersion, packProjectVersion,
    openProjectVersionPreview, openProjectVersionEditor} from './git-project-preview.ts';
import * as tools from './project-tools/index.ts';
import {runSavedGenerationTests} from './test-run/editor.ts';
export type {ProjectFolderWorkflows} from '@kubohiroya/turbowarp-plus-editor-workbench/project-folder-workflows';

type Services = Parameters<typeof createProjectFolderIntegration>[0];
type Environment = NonNullable<ReturnType<Services['environment']>>;
type GuiAction = {type: string};
type GuiStore = {
    getState(): {scratchGui: {vm: unknown; projectChanged: boolean; projectTitle: string; vmStatus: {running: boolean}}};
    dispatch(action: GuiAction): void;
    subscribe(listener: () => void): () => void;
};
type NativeWindow = Window & {ReduxStore?: GuiStore; EditorPreload?: {
    localGitAuth?: Environment['desktop']['auth']; localGit?: Environment['desktop']['auth'];
    localGitAccounts?: Environment['desktop']['accounts'];
    localGitCreation?: Environment['desktop']['creation']; localGitPublication?: Environment['desktop']['publication'];
    localGitAuthor?(): Promise<GitAuthor | null>; mergePlanShare?: Environment['desktop']['mergePlanShare'];
}};
declare const __TW_PLUS_PROJECT_FOLDER_SET_FILE_HANDLE__: (handle: null) => GuiAction;
declare const __TW_PLUS_PROJECT_FOLDER_SET_UNCHANGED__: () => GuiAction;
declare const __TW_PLUS_PROJECT_FOLDER_SET_TITLE__: (title: string) => GuiAction;
declare const __TW_PLUS_GIT_CLOUDFLARE__: Services['cloudflare'];
declare const __TW_PLUS_CAPTURE_EDITOR_HOST__: ((host: EditorHost) => void) | undefined;
declare const __TW_PLUS_UNPACK_PROJECT_FOLDER__: Services['unpackProject'];
declare const __TW_PLUS_CREATE_SAVE_COMMIT_QUEUE__: Services['createCommitQueue'];
declare const __TW_PLUS_CREATE_SAVE_COMMIT_JOURNAL__: Services['createCommitJournal'];
declare const __TW_PLUS_PROJECT_SAVE_LOCK__: Services['saveWithLock'];
// The build supplies these (scripts/site/webpack.config.cts); repository creation is in the Git package.
declare const __TW_PLUS_CREATE_REPOSITORY_CLIENT__: ProjectRepositoryHostServices['createRepositoryClient'];
declare const __TW_PLUS_CREATE_CLOUDFLARE_REPOSITORY_AUTH__: ProjectRepositoryHostServices['createCloudflareRepositoryAuth'];
declare const __TW_PLUS_CREATE_CLOUDFLARE_GIT_AUTH__: ProjectRepositoryHostServices['createCloudflareGitAuth'];
declare const __TW_PLUS_COMPOSE_REPOSITORY_SEED__: ProjectRepositoryHostServices['composeRepositorySeed'];
declare const __TW_PLUS_PREPARE_INITIAL_REPOSITORY__: ProjectRepositoryHostServices['prepareInitialRepository'];
declare const __TW_PLUS_PUSH_INITIAL_REPOSITORY__: ProjectRepositoryHostServices['pushInitialRepository'];
declare const __TW_PLUS_SB3_TOOLCHAIN_VERSION__: string | null;
declare const __TW_PLUS_REPOSITORY_LICENSES__: ProjectRepositoryHostServices['licenses'];

/** What this build bundled for repository creation; a build without it leaves creation unavailable. */
const repositoryHostServices = (): ProjectRepositoryHostServices => ({
    createRepositoryClient: typeof __TW_PLUS_CREATE_REPOSITORY_CLIENT__ === 'function' ? __TW_PLUS_CREATE_REPOSITORY_CLIENT__ : undefined!,
    createCloudflareRepositoryAuth: typeof __TW_PLUS_CREATE_CLOUDFLARE_REPOSITORY_AUTH__ === 'function' ?
        __TW_PLUS_CREATE_CLOUDFLARE_REPOSITORY_AUTH__ : undefined,
    createCloudflareGitAuth: typeof __TW_PLUS_CREATE_CLOUDFLARE_GIT_AUTH__ === 'function' ? __TW_PLUS_CREATE_CLOUDFLARE_GIT_AUTH__ : undefined,
    composeRepositorySeed: typeof __TW_PLUS_COMPOSE_REPOSITORY_SEED__ === 'function' ? __TW_PLUS_COMPOSE_REPOSITORY_SEED__ : undefined!,
    prepareInitialRepository: typeof __TW_PLUS_PREPARE_INITIAL_REPOSITORY__ === 'function' ? __TW_PLUS_PREPARE_INITIAL_REPOSITORY__ : undefined!,
    pushInitialRepository: typeof __TW_PLUS_PUSH_INITIAL_REPOSITORY__ === 'function' ? __TW_PLUS_PUSH_INITIAL_REPOSITORY__ : undefined!,
    sb3ToolchainVersion: typeof __TW_PLUS_SB3_TOOLCHAIN_VERSION__ === 'string' ? __TW_PLUS_SB3_TOOLCHAIN_VERSION__ : null,
    licenses: typeof __TW_PLUS_REPOSITORY_LICENSES__ === 'undefined' ? [] : __TW_PLUS_REPOSITORY_LICENSES__
});

const integration = createProjectFolderIntegration({
    repository: repositoryHostServices(), tools,
    cloudflare: typeof __TW_PLUS_GIT_CLOUDFLARE__ === 'undefined' ? null : __TW_PLUS_GIT_CLOUDFLARE__,
    unpackProject: typeof __TW_PLUS_UNPACK_PROJECT_FOLDER__ === 'function' ? __TW_PLUS_UNPACK_PROJECT_FOLDER__ : undefined,
    createCommitQueue: typeof __TW_PLUS_CREATE_SAVE_COMMIT_QUEUE__ === 'function' ? __TW_PLUS_CREATE_SAVE_COMMIT_QUEUE__ : undefined,
    createCommitJournal: typeof __TW_PLUS_CREATE_SAVE_COMMIT_JOURNAL__ === 'function' ? __TW_PLUS_CREATE_SAVE_COMMIT_JOURNAL__ : undefined,
    saveWithLock: typeof __TW_PLUS_PROJECT_SAVE_LOCK__ === 'function' ? __TW_PLUS_PROJECT_SAVE_LOCK__ : undefined,
    versions: {available: hasProjectVersionValidator, validate: validateProjectVersion, pack: packProjectVersion,
        preview: openProjectVersionPreview, edit: openProjectVersionEditor},
    runSavedGenerationTests,
    environment(vm, document) {
        const view = document?.defaultView as NativeWindow;
        const store = view?.ReduxStore;
        if (!store || typeof __TW_PLUS_PROJECT_FOLDER_SET_FILE_HANDLE__ === 'undefined') return null;
        const preload = view.EditorPreload;
        return {
            isCurrent: () => store.getState().scratchGui.vm === vm,
            isProjectDirty: () => store.getState().scratchGui.projectChanged,
            isRunning: () => store.getState().scratchGui.vmStatus.running,
            subscribe: listener => store.subscribe(listener),
            markSaved: () => store.dispatch(__TW_PLUS_PROJECT_FOLDER_SET_UNCHANGED__()),
            clearFileHandle: () => store.dispatch(__TW_PLUS_PROJECT_FOLDER_SET_FILE_HANDLE__(null)),
            setTitle: title => store.dispatch(__TW_PLUS_PROJECT_FOLDER_SET_TITLE__(title)),
            getTitle: () => store.getState().scratchGui.projectTitle,
            desktop: preload && {auth: preload.localGitAuth ?? preload.localGit, accounts: preload.localGitAccounts, creation: preload.localGitCreation,
                publication: preload.localGitPublication, author: () => preload.localGitAuthor?.(), mergePlanShare: preload.mergePlanShare},
            captureHost: typeof __TW_PLUS_CAPTURE_EDITOR_HOST__ === 'function' ? __TW_PLUS_CAPTURE_EDITOR_HOST__ : undefined
        };
    }
});
export const {attachProjectFolder, projectFolderWorkflows, projectFolderOpenRemote, projectFolderDirectory} = integration;
