import React from 'react';
import {createPortal} from 'react-dom';
import {BasicPanel} from './basic-panel.tsx';
import {createDesktopPanelHost, createWebPanelHost} from './desktop-panel-host.ts';
import {decorateSurface} from '../editor-backpack/surface-styles.ts';
import {layoutFlags, layoutViews, WindowLayoutContext} from './index.tsx';
import styles from '@kubohiroya/turbowarp-plus-editor-layout/editor.css';

const desktopPopout = createDesktopPanelHost('sprite-list', 'twPlusTargetPanelsPopout', 540, 420);
const externalHost = desktopPopout ?? (layoutFlags.standardLayout ? createWebPanelHost('sprite-list', 540, 420) : null);

function DockableTargetList({children}) {
    const {plusLayout} = React.useContext(WindowLayoutContext);
    const {mount, query, renderTools, title, openLabel} = layoutViews.useSpriteListTools();
    const dockHeading = openAction => {
        const tools = renderTools(openAction);
        return mount ? createPortal(tools, mount) : tools;
    };
    if (!plusLayout && !layoutFlags.targetList) return children;
    return <BasicPanel id="sprite-list" title={title}
        className={styles.targetListPanel} externalHost={externalHost} decorate={decorateSurface}
        layer={plusLayout ? 'utility' : undefined} alwaysShowUndock={plusLayout} renderDockHeading={plusLayout ? dockHeading : undefined}
        openLabel={plusLayout ? openLabel : undefined}
        renderInExternalDocument>
        <layoutViews.TargetSearchProvider value={query}>
            <layoutViews.SpriteListContent>{children}</layoutViews.SpriteListContent>
        </layoutViews.TargetSearchProvider>
    </BasicPanel>;
}

const targetListEnabled = layoutFlags.targetList || layoutFlags.standardLayout;
export const TargetListLayout = targetListEnabled ?
    props => <layoutViews.TargetLayout {...props} compact={layoutFlags.targetList} /> : undefined;
export const TargetListPanel = targetListEnabled ? DockableTargetList : undefined;
export const SpriteGrid = targetListEnabled ? layoutViews.SpriteGrid : undefined;
export const BackdropTile = targetListEnabled ? layoutViews.BackdropTile : undefined;
export const BackdropListActions = targetListEnabled ?
    props => <layoutViews.BackdropActions {...props} compact={layoutFlags.targetList} /> : undefined;
