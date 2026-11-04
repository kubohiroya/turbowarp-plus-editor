import React from 'react';
import '@kubohiroya/turbowarp-editor-sprite-properties/styles.css';
import {SpritePropertiesPanel as Panel} from '@kubohiroya/turbowarp-editor-sprite-properties';
import {BasicPanel} from '../../editor-layout/basic-panel.jsx';
import {createDesktopPanelHost} from '../../editor-layout/desktop-panel-host.js';
import {decorateSurface} from '../../editor-backpack/surface-styles.js';

const desktopPopout = createDesktopPanelHost('sprite-properties', 'twPlusTargetPanelsPopout', 620, 300);

export function SpritePropertiesPanel(props) {
    const title = /^ja(?:-|$)/i.test(props.locale) ? 'スプライト' : 'Sprite';
    return <BasicPanel id="sprite-properties" title={title} externalHost={desktopPopout}
        decorate={decorateSurface} renderInExternalDocument><Panel {...props} /></BasicPanel>;
}
