import {createProjectTools} from '@kubohiroya/turbowarp-plus-editor-workbench/project-tools';
import {installProjectProperties} from './properties.ts';
import {createProjectDialogs} from './dialog.ts';
import {installEditorExtensionHost} from '../extension-host/editor-host.ts';
import {editorProjectArchives} from '../extension-host/shared-project-archive.ts';
import {MANUAL_PROJECT_URI_ENABLED, PROJECT_TOOLS_ENABLED} from './config.ts';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';
import {installProjectOpenTabs} from '@kubohiroya/turbowarp-plus-editor-workbench/project-open-tabs';
import {extensionLoadErrors} from '../extension-host/load-errors.ts';
import '@kubohiroya/turbowarp-plus-editor-workbench/project-catalog.css';

const tools = createProjectTools({
    installEditorExtensionHost, installProjectProperties, createProjectDialogs, editorProjectArchives,
    projectToolsEnabled: PROJECT_TOOLS_ENABLED, manualProjectURIEnabled: MANUAL_PROJECT_URI_ENABLED,
    readStartupFlags: readWebStartupFeatureFlags,
    catalogEnvironment(document) {
        const store = (document.defaultView as Window & {ReduxStore?: {
            getState(): {scratchGui: {tw: {fileHandle?: FileSystemFileHandle}; projectChanged: boolean}};
            subscribe(listener: () => void): () => void;
        }})?.ReduxStore;
        return store && {readFile: () => store.getState().scratchGui.tw.fileHandle ?? null,
            isDirty: () => store.getState().scratchGui.projectChanged,
            subscribeLocation: listener => store.subscribe(listener)};
    },
    projectLoadState(document) {
        const store = (document?.defaultView as Window & {ReduxStore?: {
            getState(): {scratchGui: {projectState: {loadingState: string}}};
            subscribe(listener: () => void): () => void;
        }})?.ReduxStore;
        return store && {
            current: () => store.getState().scratchGui.projectState.loadingState,
            isShown: () => store.getState().scratchGui.projectState.loadingState === 'SHOWING_WITHOUT_ID',
            subscribe: listener => store.subscribe(listener)
        };
    }
});

export const {projectScreenState, loadedProjectTitle, restoreProjectTitle, isProjectLoading, subscribeProjectLoad,
    projectSaveName, setProjectSaveName, createFolderFromCurrentProject, projectFileActions, projectCreation,
    renderFileMenu, projectToolsOwnKeyEvent, bindProjectCatalogFolder, projectCatalog, projectFileOpened} = tools;
export const installProjectToolsHost: typeof tools.installProjectToolsHost = (vm, settings = {}, ...args) => {
    const host = tools.installProjectToolsHost(vm, settings, ...args);
    const document = settings.document ?? globalThis.document;
    const store = document?.defaultView?.ReduxStore;
    const dispose = store && installProjectOpenTabs(vm, {document,
        locale: () => settings.getLocale?.() ?? settings.locale ?? 'en',
        ready: () => store.getState().scratchGui.projectState.loadingState.startsWith('SHOWING_'),
        subscribe: listener => store.subscribe(listener), isCancelled: error => extensionLoadErrors.isCancelled(error)});
    return {...host, dispose() {dispose?.(); return host.dispose();}};
};
