import React from 'react';
import {createSurface} from '@kubohiroya/turbowarp-editor-surfaces';
import {DockablePanel, OpenWindowButton, useWindowHost} from '@kubohiroya/turbowarp-editor-windows';
import {desktopCodeEnabled, openDesktopCode} from '../editor-views/desktop-code.js';
import styles from '@kubohiroya/turbowarp-editor-layout/editor.css';
import {layoutFlags} from './index.jsx';
import {attachBackpackDrop} from '../editor-backpack/integration.js';
import {BackCodeWindows, SpriteCodeProvider, useCodeWindows} from '@kubohiroya/turbowarp-editor-views/sprite-code-windows';

const codeTab = 0;
const resizeCode = () => {
    const blocks = window.ScratchBlocks;
    const workspace = blocks?.getMainWorkspace();
    if (workspace?.getInjectionDiv()?.clientWidth) blocks.svgResize(workspace);
};

export function EditorTabLayout({vm, activeEditorTab, editorTargetIsStage, showUndock, locale, layout, render}) {
    const host = useWindowHost();
    const code = useCodeWindows({vm, host, locale, enabled: layoutFlags.spriteCodeWindows && !desktopCodeEnabled});
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

    const tabAction = showUndock && title && <div className={styles.tabAction} ref={action}>
        <OpenWindowButton label={openLabel} onOpen={open} disabled={Boolean(activeState && activeState.kind !== 'docked')} />
    </div>;
    const renderEditorTabRow = tabs => layout.renderEditorTabRow ? layout.renderEditorTabRow(tabs, tabAction) :
        <div className={styles.tabRow}>{tabs}{tabAction}</div>;

    const content = render({...layout,
        renderEditorTabRow,
        isEditorPanelOpen: index => Boolean(getMount(index)),
        renderEditorPanel: (index, children) => <DockablePanel
            dockLabel={dockLabel}
            mount={getMount(index)}
            onDock={() => index === codeTab && code?.front ? code.front.connection.close() : surfaces[index].dock()}
            onResize={index === codeTab ? resizeCode : undefined}
        >{children}</DockablePanel>
    });
    return <SpriteCodeProvider value={code?.context ?? null}>
        {content}
        {code && <BackCodeWindows vm={vm} windows={code.windows} front={code.front}
            previewClass={styles.codePreview} attachBackpackDrop={attachBackpackDrop} />}
    </SpriteCodeProvider>;
}
