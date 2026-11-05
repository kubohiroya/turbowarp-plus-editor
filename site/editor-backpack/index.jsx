import React from 'react';
import {OpenWindowButton, useWindowHost} from '@kubohiroya/turbowarp-editor-windows';
import {WindowLayoutContext} from '../editor-layout/index.jsx';
import {getBackpackOpenLabel} from '@tw-plus/backpack-window-host';
import {feature} from './integration.js';
import {PopupLayout} from '../editor-layout/popup-layout.jsx';
import styles from '@kubohiroya/turbowarp-editor-layout/editor.css';

function WebBackpackSurface(props) {
    const {showUndock, locale, plusLayout} = React.useContext(WindowLayoutContext);
    const internalHost = useWindowHost();
    const canUndock = showUndock || plusLayout;
    return <div className={styles.backpackPanel} tabIndex={canUndock ? -1 : undefined} onClick={canUndock ? event => {
        const node = event.currentTarget;
        if (node.contains(event.target) && !node.contains(node.ownerDocument.activeElement)) node.focus({preventScroll: true});
    } : undefined}>
        <feature.BackpackSurface {...props} showUndock={canUndock} locale={locale} internalHost={internalHost}
            renderPopupTools={plusLayout ? ({mount, onDock}) => <div className={styles.popupTools}>
                <PopupLayout window={mount.ownerDocument.defaultView} locale={locale} onDock={onDock} />
            </div> : undefined}
            openLabel={getBackpackOpenLabel(locale)} launchClassName={styles.backpackActions}
            renderLaunchButton={button => <span className={styles.openWindowAction}><OpenWindowButton {...button} /></span>} />
    </div>;
}

export const BackpackSurface = feature ? WebBackpackSurface : undefined;
export {attachBackpackDrop, receiveBackpackDrop} from './integration.js';
