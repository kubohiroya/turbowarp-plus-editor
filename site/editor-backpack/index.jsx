import React from 'react';
import {OpenWindowButton, useWindowHost} from '@kubohiroya/turbowarp-editor-windows';
import {WindowLayoutContext} from '../editor-layout/index.jsx';
import {getBackpackOpenLabel} from '@tw-plus/backpack-window-host';
import {feature} from './integration.js';
import styles from '../editor-layout/layout.css';

function WebBackpackSurface(props) {
    const {showUndock, locale} = React.useContext(WindowLayoutContext);
    const internalHost = useWindowHost();
    return <div className={styles.backpackPanel} tabIndex={showUndock ? -1 : undefined} onClick={showUndock ? event => {
        const node = event.currentTarget;
        if (node.contains(event.target) && !node.contains(node.ownerDocument.activeElement)) node.focus({preventScroll: true});
    } : undefined}>
        <feature.BackpackSurface {...props} showUndock={showUndock} locale={locale} internalHost={internalHost}
            openLabel={getBackpackOpenLabel(locale)} launchClassName={styles.backpackActions}
            renderLaunchButton={button => <span className={styles.openWindowAction}><OpenWindowButton {...button} /></span>} />
    </div>;
}

export const BackpackSurface = feature ? WebBackpackSurface : undefined;
export {attachBackpackDrop, receiveBackpackDrop} from './integration.js';
