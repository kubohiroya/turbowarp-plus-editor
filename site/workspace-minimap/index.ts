import {attachHorizontalWorkspaceZoom, workspaceControlsCorner} from '@kubohiroya/turbowarp-plus-editor-workbench';
import {attachWorkspaceOverview} from '@kubohiroya/turbowarp-plus-editor-code-views/sprite-code-windows';

const SIZE_FACTOR = 0.8;
const MAX_WATERMARK_SIZE = 64;
const MAX_MAP_WIDTH = 164;
const MAX_MAP_HEIGHT = 104;
const CONTROLS_GAP = 8;
const CONTROLS_OFFSET = 8;

function navigationCorner(workspace, ScratchBlocks, metrics) {
    const {right, bottom} = workspaceControlsCorner(workspace, ScratchBlocks, metrics);
    return {right: right + CONTROLS_OFFSET, bottom: bottom + CONTROLS_OFFSET};
}

export function attachWorkspaceNavigation(workspace, ScratchBlocks, {horizontalZoom, minimap}) {
    const container = workspace.getInjectionDiv();
    const getCorner = metrics => {
        const corner = navigationCorner(workspace, ScratchBlocks, metrics);
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
            return {...corner, right: stageLeft - 12 + CONTROLS_OFFSET};
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

/** Arranges a Git review preview like the code area: costume thumbnail, minimap, then the zoom buttons. */
export function attachReviewNavigation(workspace, ScratchBlocks, watermark: HTMLElement | undefined, {horizontalZoom, minimap}) {
    const container = workspace.getInjectionDiv();
    const frame = container.parentElement?.parentElement ?? container;
    frame.toggleAttribute('data-code-hover-surface', true);
    watermark?.toggleAttribute('data-code-hover-thumbnail', true);
    const getCorner = () => {
        // The scrollable comparison frame owns these controls, even when its bottom is off-screen.
        const scrollbar = workspace.scrollbar ? ScratchBlocks.Scrollbar.scrollbarThickness : 0;
        return {
            right: container.clientWidth - scrollbar - 12 + CONTROLS_OFFSET,
            bottom: container.clientHeight - scrollbar - 12 + CONTROLS_OFFSET
        };
    };
    const zoom = horizontalZoom ? attachHorizontalWorkspaceZoom(workspace, ScratchBlocks, getCorner) : null;
    const map = minimap ? attachWorkspaceMinimap(workspace, ScratchBlocks, zoom, getCorner, watermark) : null;
    return {dispose() {
        frame.removeAttribute('data-code-hover-surface');
        watermark?.removeAttribute('data-code-hover-thumbnail');
        map?.dispose();
        zoom?.dispose();
    }};
}

export function attachCodePreviewMinimap(workspace, ScratchBlocks, watermark: HTMLElement) {
    return attachWorkspaceMinimap(workspace, ScratchBlocks, null,
        metrics => navigationCorner(workspace, ScratchBlocks, metrics), watermark);
}

function attachWorkspaceMinimap(workspace, ScratchBlocks, zoom, getCorner, previewWatermark?: HTMLElement) {
    return attachWorkspaceOverview({workspace, ScratchBlocks, zoomHeight: zoom?.height, getCorner,
        watermark: previewWatermark,
        getWatermark: zoom ? () => {
            const container = workspace.getInjectionDiv();
            const host = container.closest('[class*="gui_blocks-wrapper_"]')?.parentElement;
            return host?.querySelector<HTMLElement>(':scope > [data-dockview-costume-thumbnail]') ??
                host?.querySelector<HTMLElement>(':scope > [class*="gui_watermark_"]');
        } : undefined});
}
