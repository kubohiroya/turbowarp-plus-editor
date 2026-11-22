import React from 'react';
import {render} from 'react-dom';
import {receiveProjectVersionPreview} from '@kubohiroya/turbowarp-plus-editor-git/project-version-preview';

type PreviewVM = {loadProject(archive: ArrayBuffer): Promise<void>; renderer: {draw(): void}};
type ProjectState = {loadingState: string};
declare const __TW_PLUS_REVISION_GUI__: React.ComponentType<Record<string, unknown>> & {setAppElement(element: HTMLElement): void};
declare const __TW_PLUS_REVISION_APP_STATE__: (gui: typeof __TW_PLUS_REVISION_GUI__) => typeof __TW_PLUS_REVISION_GUI__;
declare const __TW_PLUS_REVISION_PROJECT_STATE__: {
    requestProjectUpload(state: string): unknown;
    onLoadedProject(state: string, canSave: boolean, success: boolean): unknown;
};
declare const ReduxStore: {
    getState(): {scratchGui: {projectState: ProjectState}};
    dispatch(action: unknown): void;
};

const app = document.createElement('div');
document.body.append(app);
__TW_PLUS_REVISION_GUI__.setAppElement(app);
document.body.style.margin = '0';
const Player = __TW_PLUS_REVISION_APP_STATE__(__TW_PLUS_REVISION_GUI__);

// The handshake and its checks are the Git package's; this page supplies the pinned GUI's player.
function connect(vm: PreviewVM) {
    const loadingState = () => ReduxStore.getState().scratchGui.projectState.loadingState;
    const {requestProjectUpload, onLoadedProject} = __TW_PLUS_REVISION_PROJECT_STATE__;
    receiveProjectVersionPreview(window, {
        loading: () => ReduxStore.dispatch(requestProjectUpload(loadingState())),
        async load(archive) {
            await vm.loadProject(archive);
            requestAnimationFrame(() => vm.renderer.draw());
        },
        loaded: success => ReduxStore.dispatch(onLoadedProject(loadingState(), false, success)),
        showError(message) {
            const error = document.createElement('p');
            error.role = 'alert';
            error.textContent = message;
            app.prepend(error);
        }
    });
}

if (parent !== window) {
    render(<Player isPlayerOnly canSave={false} canUseCloud={false} hasCloudPermission={false}
        basePath={process.env.ROOT} onVmInit={connect}/>, app);
}
