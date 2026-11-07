import {attachHorizontalWorkspaceZoom, workspaceControlsCorner} from '@kubohiroya/turbowarp-plus-editor-layout';
import styles from './minimap.css';

const SVG = 'http://www.w3.org/2000/svg';
const SIZE_FACTOR = 0.8;
const DRAG_THRESHOLD = 3;
const MAX_WATERMARK_SIZE = 64;
const MAX_MAP_WIDTH = 164;
const MAX_MAP_HEIGHT = 104;
const CONTROLS_GAP = 8;
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

export function attachWorkspaceNavigation(workspace, ScratchBlocks, {horizontalZoom, minimap}) {
    const container = workspace.getInjectionDiv();
    const getCorner = metrics => {
        const corner = workspaceControlsCorner(workspace, ScratchBlocks, metrics);
        const stage = container.closest('[class*="editor_standard-body_"]')?.querySelector('[data-plus-stage-frame]');
        if (!stage || stage.closest('[data-stage-hidden="true"]')) return corner;

        const workspaceRect = container.getBoundingClientRect();
        const stageRect = stage.getBoundingClientRect();
        const right = workspaceRect.left + container.clientLeft + corner.right;
        const bottom = workspaceRect.top + container.clientTop + corner.bottom;
        const stackHeight = 36 + Math.min(MAX_MAP_HEIGHT, metrics.viewHeight * 0.35) * SIZE_FACTOR +
            MAX_WATERMARK_SIZE + 2 * CONTROLS_GAP;
        const stageLeft = stageRect.left - workspaceRect.left - container.clientLeft;
        const mapWidth = MAX_MAP_WIDTH * SIZE_FACTOR;
        if (stageLeft >= mapWidth + 24 && right > stageRect.left && right - mapWidth < stageRect.right &&
                bottom > stageRect.top && bottom - stackHeight < stageRect.bottom) {
            return {...corner, right: stageLeft - 12};
        }
        return corner;
    };
    const zoom = horizontalZoom ? attachHorizontalWorkspaceZoom(workspace, ScratchBlocks, getCorner) : null;
    const map = minimap ? attachWorkspaceMinimap(workspace, ScratchBlocks, zoom, zoom ? getCorner : undefined) : null;
    return {dispose() {
        map?.dispose();
        zoom?.dispose();
    }};
}

export function attachCodePreviewMinimap(workspace, ScratchBlocks, watermark: HTMLElement) {
    return attachWorkspaceMinimap(workspace, ScratchBlocks, null,
        metrics => workspaceControlsCorner(workspace, ScratchBlocks, metrics), watermark);
}

function attachWorkspaceMinimap (workspace, ScratchBlocks, zoom, getCorner, previewWatermark?: HTMLElement) {
    const container = workspace.getInjectionDiv();
    const canvas = workspace.getCanvas();
    const workspaceSvg = workspace.getParentSvg();
    let watermark = previewWatermark;
    const document = container.ownerDocument;
    const window = document.defaultView;
    const createSvg = name => document.createElementNS(SVG, name);
    const minimap = createSvg('svg');
    minimap.classList.add(styles.minimap);
    minimap.dataset.workspaceMinimap = '';
    minimap.setAttribute('aria-hidden', 'true');
    minimap.style.display = 'none';
    const blocks = createSvg('g');
    const viewportLayer = createSvg('svg');
    viewportLayer.setAttribute('overflow', 'hidden');
    const viewport = createSvg('rect');
    viewport.classList.add(styles.viewport);
    viewportLayer.append(viewport);
    minimap.append(blocks, viewportLayer);

    let frame = null;
    let blocksChanged = true;
    const drawBlocks = () => {
        const paths = document.createDocumentFragment();
        for (const block of workspace.getAllBlocks(false)) {
            const root = block.getSvgRoot();
            if (!root || !canvas.contains(root)) continue;
            const source = root.querySelector(':scope > .blocklyPath');
            const shape = source?.getAttribute('d');
            if (!shape) continue;
            const {x, y} = block.getRelativeToSurfaceXY();
            const path = createSvg('path');
            const flip = block.RTL ? ' scale(-1 1)' : '';
            path.setAttribute('transform', `translate(${x} ${y})${flip}`);
            path.setAttribute('d', shape);
            path.setAttribute('fill', source.getAttribute('fill') || block.getColour());
            paths.appendChild(path);
        }
        blocks.replaceChildren(paths);
        blocksChanged = false;
    };

    const render = () => {
        frame = null;
        const metrics = workspace.isVisible() && workspace.getMetrics();
        if (!metrics || metrics.viewWidth <= 32 || metrics.viewHeight <= 32) {
            minimap.style.display = 'none';
            return;
        }
        // Blockly attaches before React has mounted the adjacent costume watermark.
        if ((!watermark || !watermark.isConnected) && zoom) {
            const wrapper: Element | null = container.closest('[class*="gui_blocks-wrapper_"]');
            const host = wrapper?.parentElement;
            const thumbnail = host?.querySelector<HTMLElement>(':scope > [data-dockview-costume-thumbnail]');
            watermark = thumbnail ?? host?.querySelector<HTMLElement>(':scope > [class*="gui_watermark_"]');
            if (watermark && !thumbnail) {
                watermark.classList.add(styles.workspaceWatermark);
                watermark.dataset.plusWorkspaceWatermark = '';
            }
        }
        const corner = getCorner?.(metrics);
        const scale = workspace.scale;
        const x = metrics.viewLeft / scale;
        const y = metrics.viewTop / scale;
        const width = metrics.viewWidth / scale;
        const height = metrics.viewHeight / scale;
        minimap.style.display = '';
        if (blocksChanged) drawBlocks();
        // Use the scrollable area so the viewport outline stays visible even with few blocks.
        let area = workspace.scrollbar && metrics.contentWidth > 0 && metrics.contentHeight > 0 ? {
            x: metrics.contentLeft / scale,
            y: metrics.contentTop / scale,
            width: metrics.contentWidth / scale,
            height: metrics.contentHeight / scale
        } : {x, y, width, height};
        // Preview workspaces have no scrollbars, so include blocks outside the viewport explicitly.
        if (previewWatermark && metrics.contentWidth > 0 && metrics.contentHeight > 0) {
            const left = Math.min(x, metrics.contentLeft / scale);
            const top = Math.min(y, metrics.contentTop / scale);
            area = {
                x: left, y: top,
                width: Math.max(x + width, (metrics.contentLeft + metrics.contentWidth) / scale) - left,
                height: Math.max(y + height, (metrics.contentTop + metrics.contentHeight) / scale) - top
            };
        }
        const viewBox = `${area.x} ${area.y} ${area.width} ${area.height}`;
        minimap.setAttribute('viewBox', viewBox);
        // Clip the viewport frame to the map even where the SVG is letterboxed.
        viewportLayer.setAttribute('viewBox', viewBox);
        viewportLayer.setAttribute('x', area.x);
        viewportLayer.setAttribute('y', area.y);
        viewportLayer.setAttribute('width', area.width);
        viewportLayer.setAttribute('height', area.height);
        viewport.setAttribute('x', x);
        viewport.setAttribute('y', y);
        viewport.setAttribute('width', width);
        viewport.setAttribute('height', height);

        const bottomToolbox = metrics.toolboxPosition === ScratchBlocks.TOOLBOX_AT_BOTTOM ? metrics.toolboxHeight : 0;
        let mapHeight = Math.min(MAX_MAP_HEIGHT, metrics.viewHeight * 0.35) * SIZE_FACTOR;
        if (corner) {
            const {right, bottom} = corner;
            const zoomSpace = zoom ? zoom.height + CONTROLS_GAP : 0;
            const availableHeight = Math.max(0, bottom - zoomSpace - CONTROLS_GAP);
            if (watermark) mapHeight = Math.min(mapHeight, availableHeight * 0.6);
            const rightInset = container.clientWidth - right;
            const bottomInset = container.clientHeight - bottom + zoomSpace;
            if (watermark) {
                // The watermark is outside Blockly's border while the minimap is inside it.
                const rightBorder = container.offsetWidth - container.clientWidth - container.clientLeft;
                const bottomBorder = container.offsetHeight - container.clientHeight - container.clientTop;
                watermark.style.setProperty('--plus-watermark-right', `${rightInset + rightBorder}px`);
                watermark.style.setProperty('--plus-watermark-bottom', `${bottomInset + bottomBorder + mapHeight + CONTROLS_GAP}px`);
                watermark.style.setProperty('--plus-watermark-size', `${Math.min(MAX_WATERMARK_SIZE, availableHeight - mapHeight)}px`);
            }
            minimap.style.right = `${rightInset}px`;
            minimap.style.bottom = `${bottomInset}px`;
        } else {
            minimap.style.left = `${metrics.absoluteLeft + 12}px`;
            minimap.style.bottom = `${bottomToolbox + 16}px`;
        }
        minimap.style.width = `${Math.min(MAX_MAP_WIDTH, metrics.viewWidth * 0.4) * SIZE_FACTOR}px`;
        minimap.style.height = `${mapHeight}px`;
    };

    const schedule = () => {
        if (frame === null) frame = window.requestAnimationFrame(render);
    };
    const toMap = (event, inverse) => new window.DOMPoint(event.clientX, event.clientY).matrixTransform(inverse);
    const scrollTo = (metrics, x, y) => {
        // Scrollbar offsets are in pixels from the content origin.
        const left = x * workspace.scale - metrics.contentLeft;
        const top = y * workspace.scale - metrics.contentTop;
        workspace.scrollbar.set(
            clamp(left, 0, metrics.contentWidth - metrics.viewWidth),
            clamp(top, 0, metrics.contentHeight - metrics.viewHeight)
        );
    };

    let pointer = null;
    const startPointer = event => {
        if (!event.isPrimary || event.button !== 0 || pointer || !workspace.scrollbar) return;
        const metrics = workspace.getMetrics();
        const screen = minimap.getScreenCTM();
        if (!metrics || !screen) return;
        const inverse = screen.inverse();
        pointer = {
            id: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY,
            start: toMap(event, inverse),
            inverse,
            left: metrics.viewLeft / workspace.scale,
            top: metrics.viewTop / workspace.scale,
            onViewport: event.target === viewport,
            moved: false
        };
        minimap.setPointerCapture(event.pointerId);
    };
    const movePointer = event => {
        if (pointer?.id !== event.pointerId) return;
        if (!pointer.moved) {
            if (Math.hypot(event.clientX - pointer.clientX, event.clientY - pointer.clientY) < DRAG_THRESHOLD) return;
            pointer.moved = true;
            if (pointer.onViewport) {
                minimap.dataset.dragging = '';
                ScratchBlocks.hideChaff(true);
            }
        }
        if (!pointer.onViewport) return;
        const point = toMap(event, pointer.inverse);
        scrollTo(workspace.getMetrics(), pointer.left + point.x - pointer.start.x, pointer.top + point.y - pointer.start.y);
    };
    const endPointer = event => {
        if (pointer?.id !== event.pointerId) return;
        if (event.type === 'pointerup') {
            movePointer(event);
            if (!pointer.moved) {
                const metrics = workspace.getMetrics();
                const {x, y} = toMap(event, pointer.inverse);
                ScratchBlocks.hideChaff(true);
                scrollTo(metrics, x - metrics.viewWidth / (2 * workspace.scale),
                    y - metrics.viewHeight / (2 * workspace.scale));
            }
        }
        pointer = null;
        delete minimap.dataset.dragging;
    };

    const events = new window.AbortController();
    const options = {signal: events.signal};
    minimap.addEventListener('pointerdown', startPointer, options);
    minimap.addEventListener('pointermove', movePointer, options);
    minimap.addEventListener('pointerup', endPointer, options);
    minimap.addEventListener('pointercancel', endPointer, options);
    minimap.addEventListener('lostpointercapture', endPointer, options);
    if (zoom) {
        window.addEventListener('resize', schedule, options);
        window.addEventListener('scroll', schedule, {signal: events.signal, passive: true});
    }

    // Sprite changes can rebuild the workspace with Blockly events disabled.
    // Watch the rendered blocks as well as the canvas transform used for pan and zoom.
    const changes = new window.MutationObserver(records => {
        blocksChanged ||= records.some(({target, type}) =>
            type === 'childList' || (target !== canvas && target !== workspaceSvg));
        schedule();
    });
    changes.observe(canvas, {childList: true, subtree: true, attributeFilter: ['transform', 'd', 'fill', 'style']});
    changes.observe(workspaceSvg, {attributeFilter: ['style']});
    const resize = new window.ResizeObserver(schedule);
    resize.observe(container);
    container.appendChild(minimap);
    schedule();

    return {
        dispose () {
            events.abort();
            changes.disconnect();
            resize.disconnect();
            if (frame !== null) window.cancelAnimationFrame(frame);
            minimap.remove();
            if (watermark) {
                watermark.classList.remove(styles.workspaceWatermark);
                delete watermark.dataset.plusWorkspaceWatermark;
                watermark.style.removeProperty('--plus-watermark-right');
                watermark.style.removeProperty('--plus-watermark-bottom');
                watermark.style.removeProperty('--plus-watermark-size');
            }
        }
    };
}
