import React from 'react';
import type {IconMenuItem} from '@kubohiroya/turbowarp-plus-editor-ui';
import {IconMenuButton} from '@kubohiroya/turbowarp-plus-editor-ui';
import {stageDockActionLabel} from '@kubohiroya/turbowarp-plus-editor-layout/stage-surface';
import fullscreenIcon from '@tw-plus/gui-stage-fullscreen-icon';
import {StageDisplayMenuContext, WindowLayoutContext} from './context.ts';
import {layoutFlags} from './index.tsx';
import styles from './stage-display-menu.css';

const stageLayoutIcon = (
    <svg className={styles.directional} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="1.75" y="4" width="20.5" height="16" rx="2" />
        <path d="M10.5 4v16M4.5 9H7.5M4.5 12H7.5M4.5 15H7.5" />
        <rect x="13.5" y="7" width="5.75" height="4.5" rx="0.5" fill="var(--looks-secondary)" />
        <path d="m14.25 15 2.125 2 2.125-2" />
    </svg>
);

function PresetIcon({icon}) {
    return <img className={styles.directional} src={typeof icon === 'function' ? icon() : icon} alt="" draggable={false} />;
}

function DisplayMenu({locale, presets, fullscreen}) {
    const {dockAction, stage} = React.useContext(StageDisplayMenuContext) ?? {};
    const {plusLayout, stageDrawer, stageHidden, setStageVisible} = React.useContext(WindowLayoutContext);
    const japanese = /^ja(?:-|$)/i.test(locale);
    const label = japanese ? 'ステージの表示' : 'Stage display';
    const canToggleVisibility = plusLayout && (!dockAction || dockAction.kind === 'docked');
    const visibilityLabel = stageHidden ? (japanese ? 'ステージを表示' : 'Show stage') :
        (japanese ? 'ステージを隠す' : 'Hide stage');
    const detached = dockAction?.kind === 'external';
    const dockLabel = stageDockActionLabel(locale, {drawer: stageDrawer, detached, external: dockAction?.external});

    const selectDisplay = action => {
        if (stageHidden) setStageVisible(true);
        if (detached) dockAction.dock();
        action();
    };
    // Scratch GUI passes small first and full last, with an optional fixed-width preset between them.
    const items: IconMenuItem[] = presets.slice(1, -1).map(({title, isSelected, handleClick, icon}) => ({
        id: title,
        label: title,
        checked: isSelected,
        icon: <PresetIcon icon={icon} />,
        onSelect: () => selectDisplay(handleClick)
    }));
    items.push({
        id: 'fullscreen',
        label: fullscreen.title,
        icon: <PresetIcon icon={fullscreenIcon} />,
        onSelect: () => selectDisplay(fullscreen.handleClick)
    });
    if (canToggleVisibility) items.push({
        id: 'visibility',
        label: visibilityLabel,
        onSelect: () => {
            if (stage?.docked) stage.commands.close();
            setStageVisible(stageHidden);
        }
    });
    if (stage?.commands && dockAction?.kind === 'docked') items.push({
        id: 'workspace',
        label: stage.docked ? stage.closeLabel : stage.openLabel,
        onSelect: () => {
            if (stage.docked) stage.commands.close();
            else {
                if (stageHidden) setStageVisible(true);
                stage.commands.open();
            }
        }
    });
    items.push({
        id: 'dock',
        label: dockLabel,
        disabled: !dockAction || dockAction.kind === 'opening',
        separatorBefore: true,
        icon: <svg className={styles.directional} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 4H3v9h9v-3" />
            {detached ? <path d="M12.5 3.5 7 9m0-4v4h4" /> : <path d="M8 3h5v5m0-5L7 9" />}
        </svg>,
        onSelect: () => {
            if (stageHidden) setStageVisible(true);
            if (detached) dockAction.dock();
            else {
                if (stage?.docked) stage.commands.close();
                dockAction.undock();
            }
        }
    });
    return <IconMenuButton label={label} icon={stageLayoutIcon} items={items}
        className={stageHidden ? styles.visibleWhenStageHidden : undefined} />;
}

export const StageDisplayMenu = layoutFlags.stageDisplayMenu ? DisplayMenu : undefined;
