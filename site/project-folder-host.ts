import {mountProjectFolder} from '@kubohiroya/turbowarp-plus-editor-project-folder';
import type {FolderVM} from '@kubohiroya/turbowarp-plus-editor-project-folder';
import {loadedProjectTitle} from './project-tools/index.ts';

type Action = {type: string};
type GuiStore = {
    getState(): {scratchGui: {vm: FolderVM; projectChanged: boolean}};
    dispatch(action: Action): void;
};
declare const __TW_PLUS_PROJECT_FOLDER_SET_FILE_HANDLE__: (handle: null) => Action;
declare const __TW_PLUS_PROJECT_FOLDER_SET_UNCHANGED__: () => Action;
declare const __TW_PLUS_PROJECT_FOLDER_SET_TITLE__: (title: string) => Action;

export function attachProjectFolder(vm: FolderVM, document: Document) {
    const view = document?.defaultView as Window & {EditorPreload?: unknown; ReduxStore?: GuiStore};
    if (!view || view.EditorPreload || typeof __TW_PLUS_PROJECT_FOLDER_SET_FILE_HANDLE__ === 'undefined') return null;
    const store = view.ReduxStore;
    if (!store || store.getState().scratchGui.vm !== vm) return null;
    const markSaved = () => store.dispatch(__TW_PLUS_PROJECT_FOLDER_SET_UNCHANGED__());
    return mountProjectFolder({vm, document, host: {
        isProjectDirty: () => store.getState().scratchGui.projectChanged,
        beforeLoad: () => store.dispatch(__TW_PLUS_PROJECT_FOLDER_SET_FILE_HANDLE__(null)),
        onOpened(title) {
            store.dispatch(__TW_PLUS_PROJECT_FOLDER_SET_TITLE__(loadedProjectTitle(vm) ?? title));
            markSaved();
        },
        onSaved: markSaved
    }});
}
