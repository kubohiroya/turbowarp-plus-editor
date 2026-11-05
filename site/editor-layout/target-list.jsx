import React from 'react';
import {BasicPanel} from './basic-panel.jsx';
import {createDesktopPanelHost} from './desktop-panel-host.js';
import {decorateSurface} from '../editor-backpack/surface-styles.js';
import {layoutFlags, layoutViews, WindowLayoutContext} from './index.jsx';
import styles from '@kubohiroya/turbowarp-editor-layout/editor.css';

const desktopPopout = createDesktopPanelHost('sprite-list', 'twPlusTargetPanelsPopout', 540, 420);

function useJapaneseLabels() {
    const {locale} = React.useContext(WindowLayoutContext);
    return /^ja(?:-|$)/i.test(locale);
}

function DockableTargetList({children}) {
    const japanese = useJapaneseLabels();
    return <BasicPanel id="sprite-list" title={japanese ? 'スプライト一覧' : 'Sprite list'}
        className={styles.targetListPanel} externalHost={desktopPopout} decorate={decorateSurface}
        renderInExternalDocument>
        <div className={styles.targetListContent}>{children}</div>
    </BasicPanel>;
}

const targetListEnabled = layoutFlags.targetList || layoutFlags.standardLayout;
export const TargetListLayout = targetListEnabled ?
    props => <layoutViews.TargetLayout {...props} compact={layoutFlags.targetList} /> : undefined;
export const TargetListPanel = layoutFlags.targetList ? DockableTargetList : undefined;
export const SpriteGrid = targetListEnabled ? layoutViews.SpriteGrid : undefined;
export const BackdropTile = targetListEnabled ? layoutViews.BackdropTile : undefined;
export const BackdropListActions = targetListEnabled ?
    props => <layoutViews.BackdropActions {...props} compact={layoutFlags.targetList} /> : undefined;
