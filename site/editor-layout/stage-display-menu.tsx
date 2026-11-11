import React from 'react';
import {createPortal} from 'react-dom';
import {connect} from 'react-redux';
import type {IconMenuItem} from '@kubohiroya/turbowarp-plus-editor-ui';
import {IconMenuButton} from '@kubohiroya/turbowarp-plus-editor-ui';
import {panelLayoutIconPath} from '@kubohiroya/turbowarp-plus-editor-workbench';
import {stageDockActionLabel, stagePresentationItems, useStageDocumentFullscreen} from '@kubohiroya/turbowarp-plus-editor-workbench/stage-surface';
import workbenchStyles from '@kubohiroya/turbowarp-plus-editor-workbench/editor.css';
import fullscreenIcon from '@tw-plus/gui-stage-fullscreen-icon';
import exitFullscreenIcon from '@tw-plus/gui-stage-exit-fullscreen-icon';
import {setFullScreen} from '@tw-plus/gui-mode';
import {StageDisplayMenuContext, WindowLayoutContext} from './context.ts';
import {layoutFlags} from './index.tsx';
import styles from './stage-display-menu.css';

const stageLayoutIcon = (
    <svg viewBox="-4 -4 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={panelLayoutIconPath} />
    </svg>
);

function PresetIcon({icon}) {
    return <img className={styles.directional} src={typeof icon === 'function' ? icon() : icon} alt="" draggable={false} />;
}

const isJapanese = locale => /^ja(?:-|$)/i.test(locale);
const menuLabel = locale => isJapanese(locale) ? 'ステージの表示' : 'Stage display';

function fullscreenItem(locale: string, active: boolean, onSelect: () => void, disabled = false): IconMenuItem {
    const label = active ? (isJapanese(locale) ? '全画面表示を終了' : 'Exit full screen mode') :
        (isJapanese(locale) ? '全画面表示にする' : 'Enter full screen mode');
    return {id: 'fullscreen', label, icon: <PresetIcon icon={active ? exitFullscreenIcon : fullscreenIcon} />,
        onSelect, disabled};
}

function dockIcon(returning: boolean) {
    return <svg className={styles.directional} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 4H3v9h9v-3" />
        <path d={returning ? 'M12.5 3.5 7 9m0-4v4h4' : 'M8 3h5v5m0-5L7 9'} />
    </svg>;
}

function StageLayoutMenu({locale, items, className = ''}: {locale: string; items: IconMenuItem[]; className?: string}) {
    return <IconMenuButton label={menuLabel(locale)} icon={stageLayoutIcon} items={items}
        className={`${styles.stageDisplayMenu} ${workbenchStyles.stagePresentationMenu} ${className}`} />;
}

export const EditorStageFullscreenMenu = connect(null, dispatch => ({
    onExit: () => dispatch(setFullScreen(false))
}))(function EditorStageFullscreenMenu({header, locale, onExit}: {
    header: HTMLElement; locale: string; onExit(): void;
}) {
    // Use the GUI's existing fullscreen controls row, including its alignment and stacking.
    const mount = header.querySelector<HTMLElement>('[class*="stage-header_fullscreen-buttons-row_"]');
    return mount ? createPortal(
        <StageLayoutMenu locale={locale} className={styles.fullscreenLayoutMenu}
            items={[fullscreenItem(locale, true, onExit)]} />, mount
    ) : null;
});

function DisplayMenu({locale, presets, fullscreen}) {
    const {dockAction, stage, launcher, openDrawer, closeDrawer} = React.useContext(StageDisplayMenuContext) ?? {};
    const {plusLayout, stageDrawer, stageHidden, setStageVisible} = React.useContext(WindowLayoutContext);
    const japanese = isJapanese(locale);
    const canToggleVisibility = plusLayout && (!dockAction || dockAction.kind === 'docked');
    const visibilityLabel = stageHidden ? (japanese ? 'ステージを表示' : 'Show stage') :
        (japanese ? 'ステージを隠す' : 'Hide stage');
    const detached = dockAction?.kind === 'external';
    const popupDocument = detached ? dockAction.mount?.ownerDocument : undefined;
    const popupFullscreen = useStageDocumentFullscreen(popupDocument);
    if (popupDocument) {
        const toggleFullscreen = () => {
            const operation = popupFullscreen ? popupDocument.exitFullscreen() :
                popupDocument.documentElement.requestFullscreen();
            void operation.catch(() => {});
        };
        return <StageLayoutMenu locale={locale} items={[
            fullscreenItem(locale, popupFullscreen, toggleFullscreen, !popupFullscreen && !popupDocument.fullscreenEnabled),
            {id: 'dock', label: japanese ? 'エディターに戻る' : 'Return to the editor',
                icon: dockIcon(true), separatorBefore: true, onSelect: dockAction.dock}
        ]} />;
    }
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
    const enterFullscreen = fullscreenItem(locale, false, () => selectDisplay(fullscreen.handleClick));
    const openWindow = () => {
        if (stageHidden) setStageVisible(true);
        if (stage?.docked) stage.commands.close();
        dockAction.undock();
    };
    if (launcher && stageDrawer && !detached) {
        const inTab = Boolean(stage?.docked);
        const placement = stagePresentationItems(locale, inTab ? 'tab' : 'drawer', {
            window: dockAction?.external && dockAction.kind === 'docked' ? openWindow : undefined,
            tab: !inTab && stage?.commands ? stage.commands.open : undefined,
            drawer: inTab ? () => {
                stage.commands.close();
                // The drawer becomes available after the stage tab has been removed.
                requestAnimationFrame(() => openDrawer?.current?.());
            } : undefined
        });
        const close: IconMenuItem = {
            id: 'close-placement',
            label: inTab ? (japanese ? 'タブを閉じる' : 'Close the tab') :
                (japanese ? '引出しを閉じる' : 'Close the drawer'),
            icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"
                strokeLinecap="round" aria-hidden="true"><path d="m4.5 4.5 7 7m0-7-7 7" /></svg>,
            onSelect: inTab ? stage.commands.close : () => closeDrawer?.current?.()
        };
        return <StageLayoutMenu locale={locale} items={[
            ...placement, {...enterFullscreen, separatorBefore: true}, ...items, close
        ]} />;
    }
    items.push(japanese ? enterFullscreen : {...enterFullscreen, label: fullscreen.title});
    if (canToggleVisibility) items.push({
        id: 'visibility',
        label: visibilityLabel,
        onSelect: () => {
            if (!stageHidden && !stage?.docked && closeDrawer?.current) {
                closeDrawer.current();
                return;
            }
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
        icon: dockIcon(detached),
        onSelect: detached ? () => {
            if (stageHidden) setStageVisible(true);
            dockAction.dock();
        } : openWindow
    });
    return <StageLayoutMenu locale={locale} items={items} className={stageHidden ? styles.visibleWhenStageHidden : undefined} />;
}

export const StageDisplayMenu = layoutFlags.stageDisplayMenu ? DisplayMenu : undefined;
