import React from 'react';
import {createSurface} from '@kubohiroya/turbowarp-editor-surfaces';
import {DockablePanel, OpenWindowButton, useWindowHost} from '@kubohiroya/turbowarp-editor-windows';
import {desktopCodeEnabled, openDesktopCode} from '../editor-views/desktop-code.ts';
import styles from '@kubohiroya/turbowarp-plus-editor-layout/editor.css';
import {useSpriteTabs} from '@kubohiroya/turbowarp-plus-editor-layout/sprite-tabs';
import '@kubohiroya/turbowarp-plus-editor-layout/dockview-styles';
import {dockviewSpriteTabsEnabled, layoutFlags, WindowLayoutContext} from './index.tsx';
import {attachBackpackDrop} from '../editor-backpack/integration.ts';
import {BackCodeWindows, SpriteCodeProvider, useCodeWindows} from '@kubohiroya/turbowarp-plus-editor-views/sprite-code-windows';

const codeTab = 0;
const resizeCode = () => {
    const blocks = window.ScratchBlocks;
    const workspace = blocks?.getMainWorkspace();
    if (workspace?.getInjectionDiv()?.clientWidth) blocks.svgResize(workspace);
};

export function EditorTabLayout({vm, activeEditorTab, editorTargetIsStage, showUndock, locale, layout, render}) {
    const host = useWindowHost();
    const {plusLayout} = React.useContext(WindowLayoutContext);
    const spriteTabs = useSpriteTabs({
        available: dockviewSpriteTabsEnabled, enabled: plusLayout && dockviewSpriteTabsEnabled,
        vm, locale, className: styles.spriteTabs, activeSection: activeEditorTab,
        resize: () => requestAnimationFrame(resizeCode)
    });
    const code = useCodeWindows({vm, host, locale, enabled: (layoutFlags.spriteCodeWindows || layoutFlags.standardLayout) && !desktopCodeEnabled});
    const [states, setStates] = React.useState([]);
    const action = React.useRef(null);
    const previousActive = React.useRef(null);
    const surfaces = React.useMemo(() => [0, 1, 2].map(index => createSurface(host, state => {
        setStates(previous => {
            const next = [...previous];
            next[index] = state;
            return next;
        });
    })), [host]);
    React.useLayoutEffect(() => () => surfaces.forEach(surface => surface.dock()), [surfaces]);

    const japanese = /^ja(?:-|$)/i.test(locale);
    const openLabel = japanese ? '別画面で開く' : 'Open in another window';
    const dockLabel = japanese ? 'ここに戻す' : 'Return here';
    const titles = japanese ? ['コード', editorTargetIsStage ? '背景' : 'コスチューム', '音'] :
        ['Code', editorTargetIsStage ? 'Backdrops' : 'Costumes', 'Sounds'];
    const title = titles[activeEditorTab];
    const activeState = states[activeEditorTab];
    React.useLayoutEffect(() => {
        const previous = previousActive.current;
        previousActive.current = {index: activeEditorTab, kind: activeState?.kind};
        if (showUndock && previous?.index === activeEditorTab && previous.kind === 'external' &&
                activeState?.kind === 'docked') {
            action.current?.querySelector('button')?.focus();
        }
    }, [activeEditorTab, activeState, showUndock]);
    React.useLayoutEffect(() => {
        const tabs = action.current?.parentElement?.parentElement;
        if (!tabs) return;
        const enableCodeFocus = event => {
            // Blockly focuses its SVG on mouse down, so make it programmatically focusable first.
            const svg = event.target.closest('.blocklySvg');
            if (svg && !svg.hasAttribute('tabindex')) svg.setAttribute('tabindex', '-1');
        };
        const focusPanel = event => {
            const panel = event.target.closest('[role="tabpanel"]');
            if (!panel || panel.contains(panel.ownerDocument.activeElement)) return;
            if (!panel.hasAttribute('tabindex')) panel.tabIndex = -1;
            panel.focus({preventScroll: true});
        };
        tabs.addEventListener('pointerdown', enableCodeFocus, true);
        tabs.addEventListener('click', focusPanel);
        return () => {
            tabs.removeEventListener('pointerdown', enableCodeFocus, true);
            tabs.removeEventListener('click', focusPanel);
        };
    }, [showUndock, title]);
    const getMount = index => {
        if (index === codeTab && code?.front) return code.front.mount;
        return states[index]?.kind === 'external' ? states[index].target.mount : undefined;
    };

    function open() {
        if (activeEditorTab === codeTab && desktopCodeEnabled) {
            openDesktopCode();
            return;
        }
        if (code && activeEditorTab === codeTab && !editorTargetIsStage) {
            code.openCurrent();
            return;
        }
        surfaces[activeEditorTab].undock({id: `basic-editor-tab-${activeEditorTab}`, title, rememberPlacement: true});
    }

    const tabAction = showUndock && title && <div className={`${styles.tabAction} ${styles.openWindowAction}`} ref={action}>
        <OpenWindowButton label={openLabel} onOpen={open} disabled={Boolean(activeState && activeState.kind !== 'docked')} />
    </div>;
    const renderEditorTabRow = tabs => layout.renderEditorTabRow ? layout.renderEditorTabRow(tabs, tabAction) :
        <div className={styles.tabRow}>{tabs}{tabAction}</div>;

    const content = render({...layout,
        renderEditorTabRow: tabs => {
            const row = renderEditorTabRow(tabs);
            return spriteTabs.renderEditorTabRow ? spriteTabs.renderEditorTabRow(row) : row;
        },
        isEditorPanelOpen: index => Boolean(getMount(index)),
        renderEditorPanel: (index, children) => {
            const panel = <DockablePanel
                dockLabel={dockLabel}
                mount={getMount(index)}
                onDock={() => index === codeTab && code?.front ? code.front.connection.close() : surfaces[index].dock()}
                onResize={index === codeTab ? resizeCode : undefined}
            >{children}</DockablePanel>;
            return spriteTabs.renderEditorPanel ? spriteTabs.renderEditorPanel(index, panel) : panel;
        }
    });
    const selection = spriteTabs.context;
    const editorCommands = selection && code ? {...selection, open: code.context.open} : selection ?? code?.context ?? null;
    return <SpriteCodeProvider value={editorCommands}>
        {content}
        {code && <BackCodeWindows vm={vm} windows={code.windows} front={code.front}
            attachBackpackDrop={attachBackpackDrop} />}
    </SpriteCodeProvider>;
}
