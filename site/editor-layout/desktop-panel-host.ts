import {createBrowserHost} from '../editor-backpack/browser-host.ts';

export function createDesktopPanelHost(kind, flag, width, height, synchronousPageHide = true) {
    if (typeof EditorPreload === 'undefined' || new URLSearchParams(location.search).get(flag) !== '1') return null;
    return createBrowserHost(window, (_url, ticket) => window.open(
        'about:blank', `tw-plus-${kind}-${ticket}`, `popup,width=${width},height=${height}`
    ), `${kind}-popout.html`, true, synchronousPageHide);
}

export function createWebPanelHost(kind, width, height) {
    if (typeof EditorPreload !== 'undefined' || typeof window === 'undefined') return null;
    return createBrowserHost(window, (url, ticket) => window.open(
        url.href, `tw-plus-${kind}-${ticket}`, `popup,width=${width},height=${height}`
    ), 'stage-popout.html', true, true);
}
