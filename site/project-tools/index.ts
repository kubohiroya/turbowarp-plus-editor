import {createProjectTools} from '@kubohiroya/turbowarp-plus-editor-workbench/project-tools';
import {installProjectProperties} from './properties.ts';
import {createProjectDialogs} from './dialog.ts';
import {installEditorExtensionHost} from '../extension-host/editor-host.ts';
import {editorProjectArchives} from '../extension-host/shared-project-archive.ts';
import {MANUAL_PROJECT_URI_ENABLED, PROJECT_TOOLS_ENABLED} from './config.ts';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';

export const {installProjectToolsHost, projectScreenState, loadedProjectTitle, restoreProjectTitle, isProjectLoading, subscribeProjectLoad, projectSaveName, setProjectSaveName, createFolderFromCurrentProject, projectFileActions, projectCreation, renderFileMenu, projectToolsOwnKeyEvent} = createProjectTools({
    installEditorExtensionHost, installProjectProperties, createProjectDialogs, editorProjectArchives,
    projectToolsEnabled: PROJECT_TOOLS_ENABLED, manualProjectURIEnabled: MANUAL_PROJECT_URI_ENABLED,
    readStartupFlags: readWebStartupFeatureFlags,
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
