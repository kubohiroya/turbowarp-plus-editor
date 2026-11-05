import {isPlusPermissionDenied} from './tw-plus-extension-host.ts';
import {describeExtensionLoadFailure, isExtensionLoadFailure} from './tw-plus-extension-load-failure.ts';

const returnToEditorStart = (dispatch, actions) => {
    const {cancelSecurityLoad, setProjectTitle, setFileHandle, closeLoadingProject, closeFileMenu,
        setPlayer, setFullScreen} = actions;
    // Remove the startup override before the default-project fetch is dispatched.
    // Otherwise ?project_url=... would immediately load the cancelled project again.
    const url = new URL(window.location.href);
    url.searchParams.delete('project_url');
    url.searchParams.delete('token');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    dispatch(closeLoadingProject());
    dispatch(closeFileMenu());
    dispatch(setProjectTitle(''));
    dispatch(setFileHandle(null));
    dispatch(setPlayer(false));
    dispatch(setFullScreen(false));
    dispatch(cancelSecurityLoad());
};

export const recoverProjectLoad = (dispatch, error, actions) => {
    // A cancelled review can also be marked as a loader failure.
    const cancelled = isPlusPermissionDenied(error);
    if (!cancelled && !isExtensionLoadFailure(error)) return false;

    returnToEditorStart(dispatch, actions);
    if (!cancelled) {
        dispatch(actions.setProjectError(describeExtensionLoadFailure(error)));
        dispatch(actions.openInvalidProjectModal());
    }
    return true;
};
