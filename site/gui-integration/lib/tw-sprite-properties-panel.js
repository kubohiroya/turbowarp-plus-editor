import React from 'react';
import '@kubohiroya/turbowarp-editor-sprite-properties/styles.css';
import {SpritePropertiesPanel as Panel} from '@kubohiroya/turbowarp-editor-sprite-properties';
import {BasicPanel} from '../../editor-layout/basic-panel.jsx';

export function SpritePropertiesPanel(props) {
    const title = /^ja(?:-|$)/i.test(props.locale) ? 'スプライト' : 'Sprite';
    return <BasicPanel id="sprite-properties" title={title}><Panel {...props} /></BasicPanel>;
}
