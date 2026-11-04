import React from 'react';
import {useWindowHost} from '@kubohiroya/turbowarp-editor-windows';
import {WindowLayoutContext} from '../editor-layout/index.jsx';
import {getBackpackOpenLabel} from '@tw-plus/backpack-window-host';
import {feature} from './integration.js';

function WebBackpackSurface(props) {
    const {showUndock, locale} = React.useContext(WindowLayoutContext);
    const internalHost = useWindowHost();
    return <feature.BackpackSurface {...props} showUndock={showUndock} locale={locale} internalHost={internalHost}
        openLabel={getBackpackOpenLabel(locale)} />;
}

export const BackpackSurface = feature ? WebBackpackSurface : undefined;
export {attachBackpackDrop, receiveBackpackDrop} from './integration.js';
