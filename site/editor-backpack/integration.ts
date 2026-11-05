import {importScript, importScriptWithReceipt} from '@kubohiroya/turbowarp-script-transfer';
import {createBackpackIntegration} from '@kubohiroya/turbowarp-editor-backpack';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';
import {decorateSurface} from './surface-styles.ts';
import {createBrowserHost} from './browser-host.ts';
import {detachBackpackOpener, openBackpackWindow} from '@tw-plus/backpack-window-host';

const layoutFlags = readWebStartupFeatureFlags(typeof window === 'undefined' ? '' : window.location.search);
const desktopPopup = typeof EditorPreload !== 'undefined' &&
    new URLSearchParams(window.location.search).get('twPlusBackpackPopout') === '1';
const popupHost = typeof EditorPreload === 'undefined' && layoutFlags.standardLayout && typeof window !== 'undefined' ?
    createBrowserHost(window, (url, ticket) => window.open(url.href, `tw-plus-backpack-${ticket}`,
        'popup,width=560,height=320'), 'backpack-popout.html', true) : null;
export const feature = (layoutFlags.backpackPopout || layoutFlags.internalWindows || layoutFlags.standardLayout) ? createBackpackIntegration({
    host: layoutFlags.backpackPopout || desktopPopup ?
        createBrowserHost(window, openBackpackWindow, 'backpack-popout.html', detachBackpackOpener) : popupHost,
    importScript, importScriptWithReceipt, decorateSurface
}) : null;

export const attachBackpackDrop = context => feature?.attachBackpackDrop(context);
export const receiveBackpackDrop = feature?.receiveBackpackDrop;
