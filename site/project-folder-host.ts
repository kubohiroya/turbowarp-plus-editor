import {mountProjectFolder} from '@kubohiroya/turbowarp-plus-editor-project-folder';
import type {FolderVM} from '@kubohiroya/turbowarp-plus-editor-project-folder';
import {mountGitPanel} from '@kubohiroya/turbowarp-plus-editor-git';
import {loadedProjectTitle} from './project-tools/index.ts';

type Action = {type: string};
type GuiStore = {
    getState(): {scratchGui: {vm: FolderVM; projectChanged: boolean}};
    dispatch(action: Action): void;
    subscribe(listener: () => void): () => void;
};
declare const __TW_PLUS_PROJECT_FOLDER_SET_FILE_HANDLE__: (handle: null) => Action;
declare const __TW_PLUS_PROJECT_FOLDER_SET_UNCHANGED__: () => Action;
declare const __TW_PLUS_PROJECT_FOLDER_SET_TITLE__: (title: string) => Action;

export function attachProjectFolder(vm: FolderVM, document: Document, localGit: boolean) {
    const view = document?.defaultView as Window & {EditorPreload?: unknown; ReduxStore?: GuiStore};
    if (!view || view.EditorPreload || typeof __TW_PLUS_PROJECT_FOLDER_SET_FILE_HANDLE__ === 'undefined') return null;
    const store = view.ReduxStore;
    if (!store || store.getState().scratchGui.vm !== vm) return null;
    const markSaved = () => store.dispatch(__TW_PLUS_PROJECT_FOLDER_SET_UNCHANGED__());
    let gitPanel: ReturnType<typeof mountGitPanel> = null;
    const isProjectDirty = () => store.getState().scratchGui.projectChanged;
    const folder = mountProjectFolder({vm, document, host: {
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
        openProject: folder.openDirectory,
        isProjectDirty,
        subscribe(listener) {
            const loaded = () => listener('loaded');
            const unsubscribe = store.subscribe(() => listener('changed'));
            vm.runtime.on('PROJECT_LOADED', loaded);
            return () => {unsubscribe(); vm.runtime.off('PROJECT_LOADED', loaded);};
        }
    }});
    return {...folder, dispose() {gitPanel?.dispose(); folder.dispose();}};
}
