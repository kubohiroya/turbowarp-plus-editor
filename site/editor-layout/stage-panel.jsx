import React from 'react';
import {attachExternalMonitorDrag} from '@kubohiroya/turbowarp-editor-layout';
import {BasicPanel} from './basic-panel.jsx';
import {StageDisplayMenuContext} from './context.js';
import {createDesktopPanelHost} from './desktop-panel-host.js';
import {decorateSurface} from '../editor-backpack/surface-styles.js';
import {layoutFlags, stageCanUndock, WindowLayoutContext} from './index.jsx';
import styles from '@kubohiroya/turbowarp-editor-layout/editor.css';

const desktopPopout = createDesktopPanelHost('stage', 'twPlusStagePopout', 680, 520);

function StageResizeHandle({edge, aspect, width, limits, label}) {
    const drag = React.useRef(null);
    const corner = edge === 'corner';
    const resize = next => limits.resize(Math.round(Math.max(limits.minimum, Math.min(limits.maximum, next))));
    return <div
        className={styles.stageResizeHandle}
        data-stage-resize={edge}
        role={corner ? undefined : 'separator'}
        aria-orientation={corner ? undefined : (edge === 'left' ? 'vertical' : 'horizontal')}
        aria-label={corner ? undefined : label}
        aria-valuemin={corner ? undefined : limits.minimum}
        aria-valuemax={corner ? undefined : limits.maximum}
        aria-valuenow={corner ? undefined : width}
        tabIndex={corner ? undefined : 0}
        title={label}
        onPointerDown={event => {
            if (event.button !== 0 || drag.current) return;
            drag.current = {id: event.pointerId, x: event.clientX, y: event.clientY, width};
            event.currentTarget.setPointerCapture(event.pointerId);
            event.preventDefault();
        }}
        onPointerMove={event => {
            const start = drag.current;
            if (start?.id !== event.pointerId) return;
            const dx = start.x - event.clientX;
            const dy = (event.clientY - start.y) * aspect;
            const delta = corner ? (Math.abs(dx) >= Math.abs(dy) ? dx : dy) : (edge === 'left' ? dx : dy);
            resize(start.width + delta);
        }}
        onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={event => {
            const grow = edge === 'left' ? 'ArrowLeft' : 'ArrowDown';
            const shrink = edge === 'left' ? 'ArrowRight' : 'ArrowUp';
            if (event.key === grow) resize(width + 16);
            else if (event.key === shrink) resize(width - 16);
            else if (event.key === 'Home') resize(limits.minimum);
            else if (event.key === 'End') resize(limits.maximum);
            else return;
            event.preventDefault();
            event.stopPropagation();
        }}
    />;
}

function StageViewport({aspect, width, defaultWidth, floating, render, renderHeader, isFullScreen, inputDocument}) {
    const {stageHidden, stageResize, locale} = React.useContext(WindowLayoutContext);
    const resizable = !floating && stageResize;
    const resizeLabel = /^ja(?:-|$)/i.test(locale) ? 'ステージのサイズを変更' : 'Resize stage';
    const viewport = React.useRef(null);
    const header = React.useRef(null);
    const [floatingWidth, setFloatingWidth] = React.useState(null);
    const [externalBounds, setExternalBounds] = React.useState(Boolean(inputDocument));
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
        if (!floating) return;
        const node = viewport.current;
        const measure = () => {
            const height = node.clientHeight - (header.current?.offsetHeight ?? 0) - 8;
            if (node.clientWidth < 12 || height < 1) return;
            setFloatingWidth(Math.max(1, Math.floor(Math.min(node.clientWidth - 12, height * aspect))));
        };
        const observer = new (inputDocument?.defaultView.ResizeObserver ?? ResizeObserver)(measure);
        measure();
        observer.observe(node);
        return () => observer.disconnect();
    }, [aspect, floating, inputDocument]);

    const displayWidth = floating ? floatingWidth ?? Math.min(240, width ?? defaultWidth) : width;
    const canvas = <>
        {render(displayWidth, Boolean(floating || externalBounds || resizable), inputDocument)}
        {resizable && ['left', 'bottom', 'corner'].map(edge => <StageResizeHandle key={edge}
            {...{edge, aspect, width}} limits={stageResize} label={resizeLabel} />)}
    </>;
    return <div className={styles.stageViewport} data-floating={floating} data-stage-hidden={stageHidden || undefined}
        data-resizable={resizable ? true : undefined} data-focusable={stageCanUndock || undefined} ref={viewport}
        tabIndex={stageCanUndock ? -1 : undefined}
        onClick={event => {
            const node = event.currentTarget;
            if (stageCanUndock && !node.contains(node.ownerDocument.activeElement)) node.focus({preventScroll: true});
        }}>
        {renderHeader ? <div className={styles.stageFrame} data-fullscreen={isFullScreen || undefined} data-plus-stage-frame="">
            <div className={styles.stageHeader} ref={header}>{renderHeader(displayWidth)}</div>
            <div className={styles.stageCanvas}>{canvas}</div>
        </div> : <div className={styles.stageCanvas}>{canvas}</div>}
    </div>;
}

function AppStagePanel({aspect, width, defaultWidth, render, renderHeader, isFullScreen}) {
    const {locale, stageActionMount} = React.useContext(WindowLayoutContext);
    const menu = React.useContext(StageDisplayMenuContext);
    const title = /^ja(?:-|$)/i.test(locale) ? 'ステージ' : 'Stage';
    return <BasicPanel id="stage" title={title} externalHost={desktopPopout} decorate={decorateSurface}
        actionMount={stageActionMount ?? null} onDockActionChange={layoutFlags.stageDisplayMenu ? menu?.setDockAction : undefined}
        dockHeight={Math.round((width ?? defaultWidth) / aspect) + (renderHeader ? 44 : 0)}
        render={(floating, mount) => <StageViewport {...{aspect, width, defaultWidth, floating, render, renderHeader, isFullScreen}}
            inputDocument={desktopPopout ? mount?.ownerDocument : undefined} />}
    />;
}

export const StagePanel = stageCanUndock ? AppStagePanel :
    (layoutFlags.standardLayout ? StageViewport : undefined);
export const attachStageMonitorDrag = desktopPopout && layoutFlags.stagePanel ?
    (element, onMove, isDraggable) => attachExternalMonitorDrag(element, onMove, isDraggable, document) : undefined;
