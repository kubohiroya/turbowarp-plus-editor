import React from 'react';
import {render} from 'react-dom';
import JSZip from '@turbowarp/jszip';
import {connectMergePlaytest, focusPlaytestStop, isObservedProjectVersion, isProjectVersionEditor, receiveProjectVersionEditor,
    receiveProjectVersionPreview, type MergePlaytestRequest, type PlaytestVM, type PlaytestStop, type PlaytestReadRequest}
    from '@kubohiroya/turbowarp-plus-editor-git/project-version-preview';
import '@kubohiroya/turbowarp-plus-editor-git/style.css';

type PreviewVM = PlaytestVM & {loadProject(archive: ArrayBuffer): Promise<void>; renderer: {draw(): void}; stopAll(): void};
type ProjectState = {loadingState: string};
declare const __TW_PLUS_REVISION_GUI__: React.ComponentType<Record<string, unknown>> & {setAppElement(element: HTMLElement): void};
declare const __TW_PLUS_REVISION_APP_STATE__: (gui: typeof __TW_PLUS_REVISION_GUI__) => typeof __TW_PLUS_REVISION_GUI__;
declare const __TW_PLUS_REVISION_RUN_ADDONS__: () => void;
declare const __TW_PLUS_REVISION_BLOCKLY__: {
    isLoaded(): boolean;
    get(): {getMainWorkspace(): ReturnType<Parameters<typeof focusPlaytestStop>[3]>};
};
declare const __TW_PLUS_REVISION_DESERIALIZE_BLOCKS__: Parameters<typeof connectMergePlaytest>[3]['deserialize'];
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
const editing = isProjectVersionEditor(window);
const observing = isObservedProjectVersion(window);

// The handshake and its checks are the Git package's; this page supplies the pinned GUI's player.
function connect(vm: PreviewVM) {
    let inspect: ReturnType<typeof connectMergePlaytest> | undefined;
    const loadingState = () => ReduxStore.getState().scratchGui.projectState.loadingState;
    const {requestProjectUpload, onLoadedProject} = __TW_PLUS_REVISION_PROJECT_STATE__;
    const ports = {
        loading: () => ReduxStore.dispatch(requestProjectUpload(loadingState())),
        async load(archive: ArrayBuffer, playtest?: MergePlaytestRequest) {
            await vm.loadProject(archive);
            if (playtest) inspect = connectMergePlaytest(window, vm, playtest, {
                player: app, zip: JSZip, deserialize: __TW_PLUS_REVISION_DESERIALIZE_BLOCKS__, trackEdits: observing
            });
            requestAnimationFrame(() => vm.renderer.draw());
        },
        loaded: (success: boolean) => ReduxStore.dispatch(onLoadedProject(loadingState(), false, success)),
        inspect: (query: PlaytestReadRequest) => inspect?.(query),
        showError(message: string) {
            const error = document.createElement('p');
            error.role = 'alert';
            error.textContent = message;
            app.prepend(error);
        }
    };
    if (editing) receiveProjectVersionEditor(window, {...ports,
        snapshot() {
            vm.stopAll();
            return vm.toJSON(undefined, {allowOptimization: false});
        },
        focus(stop: PlaytestStop) {
            focusPlaytestStop(window, vm, stop, () => __TW_PLUS_REVISION_BLOCKLY__.isLoaded() ?
                __TW_PLUS_REVISION_BLOCKLY__.get().getMainWorkspace() : undefined);
        }
    });
    else receiveProjectVersionPreview(window, ports);
}

if (parent !== window) {
    render(<Player isPlayerOnly={!editing && !observing} canManageFiles={false} canSave={false} canUseCloud={false} hasCloudPermission={false}
        basePath={process.env.ROOT} onVmInit={connect}/>, app);
    if (observing) __TW_PLUS_REVISION_RUN_ADDONS__();
}
