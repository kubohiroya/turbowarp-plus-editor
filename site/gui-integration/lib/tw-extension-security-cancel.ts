import {isPlusPermissionDenied} from './tw-plus-extension-host.ts';
import {isExtensionLoadFailure} from './tw-plus-extension-load-failure.ts';
import {cancelProjectTabOpening} from '@kubohiroya/turbowarp-plus-editor-workbench/project-open-tabs';
import {showProjectLoadFailure} from '@kubohiroya/turbowarp-plus-editor-workbench/project-load-failure';

export const recoverProjectLoad = (dispatch, error, actions) => {
    // A cancelled review can also be marked as a loader failure.
    const cancelled = isPlusPermissionDenied(error);
    if (!cancelled && !isExtensionLoadFailure(error)) return false;
    dispatch(actions.closeLoadingProject());
    dispatch(actions.closeFileMenu());
    dispatch(actions.cancelSecurityLoad());
    showProjectLoadFailure(window.document, {cancelled});
    if (cancelled) cancelProjectTabOpening(window.document);
    return true;
};
