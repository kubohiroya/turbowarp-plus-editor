import {decorateSurface} from './surface-styles.js';
import React from 'react';
import {importScript} from '@kubohiroya/turbowarp-script-transfer';
import {createBackpackIntegration} from '@kubohiroya/turbowarp-editor-backpack';
import {useWindowHost} from '@kubohiroya/turbowarp-editor-windows';
import {layoutFlags, WindowLayoutContext} from '../editor-layout/index.jsx';
import {createBrowserHost} from './browser-host.ts';
import {detachBackpackOpener, getBackpackOpenLabel, openBackpackWindow} from '@tw-plus/backpack-window-host';

const feature = (layoutFlags.backpackPopout || layoutFlags.internalWindows) ? createBackpackIntegration({
    host: layoutFlags.backpackPopout ?
        createBrowserHost(window, openBackpackWindow, 'backpack-popout.html', detachBackpackOpener) : null,
    importScript, decorateSurface
}) : null;

function WebBackpackSurface(props) {
    const {showUndock, locale} = React.useContext(WindowLayoutContext);
    const internalHost = useWindowHost();
    return <feature.BackpackSurface {...props} showUndock={showUndock} locale={locale} internalHost={internalHost}
        openLabel={getBackpackOpenLabel(locale)} />;
}

export const BackpackSurface = feature ? WebBackpackSurface : undefined;
export const attachBackpackDrop = context => feature?.attachBackpackDrop(context);
