import {createSurfaceRecovery} from '@kubohiroya/turbowarp-editor-surfaces';
import {createBrowserHost} from '../editor-backpack/browser-host.ts';

const storage = () => {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
};
// Shared by the panel and backpack windows that live outside Dockview.
export const surfaceRecovery = createSurfaceRecovery(storage());

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
