import React from 'react';
import '@kubohiroya/turbowarp-editor-sprite-properties/styles.css';
import {SpritePropertiesPanel as Panel} from '@kubohiroya/turbowarp-editor-sprite-properties';
import {layoutFlags, WindowLayoutContext} from '../../editor-layout/index.jsx';
import {BasicPanel} from '../../editor-layout/basic-panel.jsx';
import {createDesktopPanelHost} from '../../editor-layout/desktop-panel-host.js';
import {decorateSurface} from '../../editor-backpack/surface-styles.js';
import styles from '../../editor-layout/layout.css';

const desktopPopout = createDesktopPanelHost('sprite-properties', 'twPlusTargetPanelsPopout', 620, 300);

export function SpritePropertiesPanel({fallback, ...props}) {
    const {plusLayout} = React.useContext(WindowLayoutContext);
    if (!plusLayout && !layoutFlags.spriteProperties) return fallback;
    const title = /^ja(?:-|$)/i.test(props.locale) ? 'スプライト' : 'Sprite';
    const panel = <BasicPanel id="sprite-properties" title={title} externalHost={desktopPopout}
        decorate={decorateSurface} renderInExternalDocument><Panel {...props} /></BasicPanel>;
    return plusLayout ? <details className={styles.spriteProperties}>
        <summary>{/^ja(?:-|$)/i.test(props.locale) ? 'スプライトの設定' : 'Sprite properties'}</summary>
        {panel}
    </details> : panel;
}
