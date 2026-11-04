import {createBrowserHost} from '../editor-backpack/browser-host.ts';

export function createDesktopPanelHost(kind, flag, width, height, synchronousPageHide = true) {
    if (typeof EditorPreload === 'undefined' || new URLSearchParams(location.search).get(flag) !== '1') return null;
    return createBrowserHost(window, (_url, ticket) => window.open(
        'about:blank', `tw-plus-${kind}-${ticket}`, `popup,width=${width},height=${height}`
    ), `${kind}-popout.html`, true, synchronousPageHide);
}
