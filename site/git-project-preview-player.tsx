import React from 'react';
import {render} from 'react-dom';
import {PROJECT_VERSION_PREVIEW_PROJECT, PROJECT_VERSION_PREVIEW_READY, projectVersionPreviewMessages}
    from '@kubohiroya/turbowarp-plus-editor-git/project-version-preview';

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

function connect(vm: PreviewVM) {
    const origin = location.origin;
    window.addEventListener('message', async function load(event) {
        if (event.source !== parent || event.origin !== origin || event.data?.kind !== PROJECT_VERSION_PREVIEW_PROJECT ||
            !(event.data.archive instanceof ArrayBuffer)) return;
        window.removeEventListener('message', load);
        const loadingState = () => ReduxStore.getState().scratchGui.projectState.loadingState;
        const {requestProjectUpload, onLoadedProject} = __TW_PLUS_REVISION_PROJECT_STATE__;
        ReduxStore.dispatch(requestProjectUpload(loadingState()));
        try {
            await vm.loadProject(event.data.archive);
            ReduxStore.dispatch(onLoadedProject(loadingState(), false, true));
            requestAnimationFrame(() => vm.renderer.draw());
        } catch {
            ReduxStore.dispatch(onLoadedProject(loadingState(), false, false));
            const error = document.createElement('p');
            error.role = 'alert';
            error.textContent = projectVersionPreviewMessages(new URLSearchParams(location.search).get('lang')).loadFailed;
            app.prepend(error);
        }
    });
    parent.postMessage(PROJECT_VERSION_PREVIEW_READY, origin);
}

if (parent !== window) {
    render(<Player isPlayerOnly canSave={false} canUseCloud={false} hasCloudPermission={false}
        basePath={process.env.ROOT} onVmInit={connect}/>, app);
}
