import {importScript, importScriptWithReceipt} from '@kubohiroya/turbowarp-script-transfer';
import {createBackpackIntegration} from '@kubohiroya/turbowarp-editor-backpack';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';
import {decorateSurface} from './surface-styles.js';
import {createBrowserHost} from './browser-host.ts';
import {detachBackpackOpener, openBackpackWindow} from '@tw-plus/backpack-window-host';

const layoutFlags = readWebStartupFeatureFlags(typeof window === 'undefined' ? '' : window.location.search);
export const feature = (layoutFlags.backpackPopout || layoutFlags.internalWindows) ? createBackpackIntegration({
    host: layoutFlags.backpackPopout ?
        createBrowserHost(window, openBackpackWindow, 'backpack-popout.html', detachBackpackOpener) : null,
    importScript, importScriptWithReceipt, decorateSurface
}) : null;

export const attachBackpackDrop = context => feature?.attachBackpackDrop(context);
export const receiveBackpackDrop = feature?.receiveBackpackDrop;
