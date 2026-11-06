import React from 'react';
import '@kubohiroya/turbowarp-editor-sprite-properties/styles.css';
import {SpritePropertiesPanel as Panel} from '@kubohiroya/turbowarp-editor-sprite-properties';
import {layoutFlags, layoutViews} from '../../editor-layout/index.tsx';
import {BasicPanel} from '../../editor-layout/basic-panel.tsx';
import {createDesktopPanelHost} from '../../editor-layout/desktop-panel-host.ts';
import {decorateSurface} from '../../editor-backpack/surface-styles.ts';

const desktopPopout = createDesktopPanelHost('sprite-properties', 'twPlusTargetPanelsPopout', 620, 300);

export function SpritePropertiesPanel({fallback, ...props}: React.ComponentProps<typeof Panel> & {fallback?: React.ReactNode}) {
    const {SpritePropertiesSection} = layoutViews;
    const title = /^ja(?:-|$)/i.test(props.locale) ? 'スプライト' : 'Sprite';
    const panel = renderDockHeading => <BasicPanel id="sprite-properties" title={title} externalHost={desktopPopout}
        decorate={decorateSurface} renderDockHeading={renderDockHeading} renderInExternalDocument><Panel {...props} /></BasicPanel>;
    return <SpritePropertiesSection fallback={layoutFlags.spriteProperties ? panel(undefined) : fallback}>
        {panel(action => action)}
    </SpritePropertiesSection>;
}
