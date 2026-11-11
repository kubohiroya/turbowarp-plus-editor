import React from 'react';
import {attachExternalMonitorDrag} from '@kubohiroya/turbowarp-plus-editor-workbench';
import {createStageSurface, StageResizeHandle} from '@kubohiroya/turbowarp-plus-editor-workbench/stage-surface';
import {BasicPanel} from './basic-panel.tsx';
import {StageDisplayMenuContext} from './context.ts';
import {EditorStageFullscreenMenu} from './stage-display-menu.tsx';
import {createDesktopPanelHost, createWebPanelHost} from './desktop-panel-host.ts';
import {decorateSurface} from '../editor-backpack/surface-styles.ts';
import {layoutFlags, layoutViews, stageCanUndock, stageDrawerEnabled, WindowLayoutContext} from './index.tsx';
import styles from '@kubohiroya/turbowarp-plus-editor-workbench/editor.css';

const desktopPopout = createDesktopPanelHost('stage', 'twPlusStagePopout', 680, 520);
const externalHost = desktopPopout ?? (layoutFlags.standardLayout ? createWebPanelHost('stage', 680, 520) : null);

const StageSurface = createStageSurface(React, {
    context: WindowLayoutContext, EdgeDrawer: layoutViews.EdgeDrawer, Panel: BasicPanel
});

function StageViewport({aspect, width, defaultWidth, floating, workspace, useNativeKeyboard, render, renderHeader,
    isFullScreen, inputDocument}) {
    const {stageDrawer, stageHidden, stageResize, locale} = React.useContext(WindowLayoutContext);
    const fit = floating || workspace;
    const resizable = !fit && !isFullScreen && stageResize;
    const resizeLabel = /^ja(?:-|$)/i.test(locale) ? 'ステージのサイズを変更' : 'Resize stage';
    const viewport = React.useRef(null);
    const header = React.useRef(null);
    const [fullscreenHeader, setFullscreenHeader] = React.useState<HTMLElement>();
    const [floatingWidth, setFloatingWidth] = React.useState(null);
    const [externalBounds, setExternalBounds] = React.useState(Boolean(inputDocument));
    React.useLayoutEffect(() => {
        setFullscreenHeader(isFullScreen && layoutFlags.stageDisplayMenu ? header.current ?? undefined : undefined);
    }, [isFullScreen]);
    React.useLayoutEffect(() => {
        if (inputDocument) {
            setExternalBounds(true);
            return;
        }
        if (!externalBounds) return;
        // Recalculate Stage bounds after the docking portal has moved back into the editor.
        const frame = requestAnimationFrame(() => setExternalBounds(false));
        return () => cancelAnimationFrame(frame);
    }, [inputDocument, externalBounds]);
    React.useLayoutEffect(() => {
        if (!fit) return;
        const node = viewport.current;
        const measure = () => {
            const height = node.clientHeight - (header.current?.offsetHeight ?? 0) - 8;
            if (node.clientWidth < 12 || height < 1) return;
            // A tab or separate window is the stage's own space, so the stage grows and shrinks with it.
            setFloatingWidth(Math.max(1, Math.floor(Math.min(node.clientWidth - 12, height * aspect))));
        };
        const observer = new (inputDocument?.defaultView.ResizeObserver ?? ResizeObserver)(measure);
        measure();
        observer.observe(node);
        if (header.current) observer.observe(header.current);
        return () => observer.disconnect();
    }, [aspect, fit, inputDocument]);

    const displayWidth = fit ? floatingWidth ?? Math.min(240, width ?? defaultWidth) : width;
    const canvas = render(displayWidth, Boolean(stageDrawer || fit || externalBounds || resizable), inputDocument);
    const resizeHandles = resizable && (stageDrawer ? ['left', 'right', 'top', 'bottom'] : ['left', 'bottom', 'corner'])
        .map(edge => <StageResizeHandle key={edge} {...{edge, aspect, width}} limits={stageResize} label={resizeLabel}
            className={styles.stageResizeHandle} drawer={Boolean(stageDrawer)} />);
    return <div className={styles.stageViewport} data-floating={fit} data-stage-hidden={stageHidden || undefined}
        data-resizable={resizable ? true : undefined} data-focusable={stageCanUndock || undefined} ref={viewport}
        tabIndex={stageCanUndock ? -1 : undefined}
        onClick={event => {
            const node = event.currentTarget;
            const target = event.target as HTMLElement;
            if (target.closest('[role="menu"]')) return;
            if (useNativeKeyboard && !inputDocument && target.matches('canvas')) {
                // The GUI routes project key presses from the document body.
                (node.ownerDocument.activeElement as HTMLElement)?.blur();
                return;
            }
            if (stageCanUndock && !node.contains(node.ownerDocument.activeElement)) node.focus({preventScroll: true});
        }}>
        {renderHeader ? <div className={styles.stageFrame} data-fullscreen={isFullScreen || undefined} data-plus-stage-frame="">
            <div className={styles.stageHeader} data-stage-drawer-handle="" ref={header}>
                {renderHeader(displayWidth)}
                {isFullScreen && fullscreenHeader && <EditorStageFullscreenMenu header={fullscreenHeader} locale={locale} />}
            </div>
            <div className={styles.stageCanvas}>{canvas}{!stageDrawer && resizeHandles}</div>
            {stageDrawer && resizeHandles}
        </div> : <div className={styles.stageCanvas}>{canvas}{resizeHandles}</div>}
    </div>;
}

function AppStagePanel({aspect, width, defaultWidth, render, renderHeader, isFullScreen}) {
    const {stageActionMount} = React.useContext(WindowLayoutContext);
    const menu = React.useContext(StageDisplayMenuContext);
    const stage = menu?.stage;
    const suspend = stage?.suspend;
    const surface = stage?.surface;
    const resizeStage = menu?.resizeStage;
    React.useLayoutEffect(() => {
        suspend?.(Boolean(isFullScreen));
    }, [suspend, isFullScreen]);
    React.useLayoutEffect(() => {
        if (!surface) return;
        // The native update can run while the drawer anchor is still hidden.
        const resize = () => resizeStage(surface);
        const observer = new ResizeObserver(resize);
        observer.observe(surface);
        const frame = requestAnimationFrame(resize);
        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
    }, [surface, resizeStage, stage?.docked, isFullScreen]);
    return <StageSurface placement={stage} externalHost={externalHost} decorate={decorateSurface}
        launcher={menu?.launcher} dockAction={menu?.dockAction} editorFullscreen={isFullScreen}
        openDrawerRef={menu?.openDrawer} closeDrawerRef={menu?.closeDrawer}
        actionMount={stageActionMount ?? null} onDockActionChange={layoutFlags.stageDisplayMenu ? menu?.setDockAction : undefined}
        dockHeight={Math.round((width ?? defaultWidth) / aspect) + (renderHeader ? 44 : 0)}
        render={(floating, mount) => <StageViewport {...{aspect, width, defaultWidth, floating, render, renderHeader, isFullScreen}}
            workspace={Boolean(stage?.docked && !isFullScreen)} useNativeKeyboard={Boolean(stage)}
            inputDocument={mount?.ownerDocument} />}
    />;
}

export const StagePanel = stageCanUndock ? AppStagePanel :
    (layoutFlags.standardLayout ? StageViewport : undefined);
export const attachStageMonitorDrag = (stageDrawerEnabled && externalHost) || (desktopPopout && layoutFlags.stagePanel) ?
    (element, onMove, isDraggable) => attachExternalMonitorDrag(element, onMove, isDraggable, document) : undefined;
