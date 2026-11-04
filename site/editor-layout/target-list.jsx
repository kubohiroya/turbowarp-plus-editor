import React from 'react';
import {createTargetList} from '@kubohiroya/turbowarp-editor-layout';
import targetStyles from '@kubohiroya/turbowarp-editor-layout/targets.css';
import {BasicPanel} from './basic-panel.jsx';
import {createDesktopPanelHost} from './desktop-panel-host.js';
import {decorateSurface} from '../editor-backpack/surface-styles.js';
import {layoutFlags, WindowLayoutContext} from './index.jsx';
import styles from './layout.css';

const views = createTargetList(React, targetStyles);
const desktopPopout = createDesktopPanelHost('sprite-list', 'twPlusTargetPanelsPopout', 540, 420);

function useJapaneseLabels() {
    const {locale} = React.useContext(WindowLayoutContext);
    return /^ja(?:-|$)/i.test(locale);
}

function TargetLayout({render}) {
    return render(true);
}

function DockableTargetList({children}) {
    const japanese = useJapaneseLabels();
    return <BasicPanel id="sprite-list" title={japanese ? 'スプライト一覧' : 'Sprite list'}
        className={styles.targetListPanel} externalHost={desktopPopout} decorate={decorateSurface}
        renderInExternalDocument>
        <div className={styles.targetListContent}>{children}</div>
    </BasicPanel>;
}

function BackdropActions({buttons}) {
    const japanese = useJapaneseLabels();
    const unique = buttons.filter(({title}, index) => buttons.findIndex(button => button.title === title) === index);
    return <views.BackdropFooter buttons={unique} label={japanese ? '背景を追加' : 'Add a backdrop'} />;
}

export const TargetListLayout = layoutFlags.targetList ? TargetLayout : undefined;
export const TargetListPanel = layoutFlags.targetList ? DockableTargetList : undefined;
export const SpriteGrid = layoutFlags.targetList ? views.SpriteGrid : undefined;
export const BackdropTile = layoutFlags.targetList ? views.BackdropTile : undefined;
export const BackdropListActions = layoutFlags.targetList ? BackdropActions : undefined;
