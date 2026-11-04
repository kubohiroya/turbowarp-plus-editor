import React from 'react';
import {createTargetList} from '@kubohiroya/turbowarp-editor-layout';
import targetStyles from '@kubohiroya/turbowarp-editor-layout/targets.css';
import {BasicPanel} from './basic-panel.jsx';
import {layoutFlags, WindowLayoutContext} from './index.jsx';
import styles from './layout.css';

const views = createTargetList(React, targetStyles);

function useTargetList() {
    const {enabled, locale} = React.useContext(WindowLayoutContext);
    return {enabled, japanese: /^ja(?:-|$)/i.test(locale)};
}

function TargetLayout({render}) {
    return render(useTargetList().enabled);
}

function DockableTargetList({children}) {
    const {enabled, japanese} = useTargetList();
    return <BasicPanel id="sprite-list" title={japanese ? 'スプライト一覧' : 'Sprite list'}
        className={enabled ? styles.targetListPanel : styles.inactiveTargetList}>
        <div className={enabled ? styles.targetListContent : styles.inactiveTargetList}>{children}</div>
    </BasicPanel>;
}

function BackdropActions({buttons, children}) {
    const {enabled, japanese} = useTargetList();
    if (!enabled) return children;
    const unique = buttons.filter(({title}, index) => buttons.findIndex(button => button.title === title) === index);
    return <views.BackdropFooter buttons={unique} label={japanese ? '背景を追加' : 'Add a backdrop'} />;
}

export const TargetListLayout = layoutFlags.targetList ? TargetLayout : undefined;
export const TargetListPanel = layoutFlags.targetList ? DockableTargetList : undefined;
export const SpriteGrid = layoutFlags.targetList ? views.SpriteGrid : undefined;
export const BackdropTile = layoutFlags.targetList ? views.BackdropTile : undefined;
export const BackdropListActions = layoutFlags.targetList ? BackdropActions : undefined;
