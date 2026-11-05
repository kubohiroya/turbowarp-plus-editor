interface WorkspaceMetrics {
    toolboxPosition: number;
    flyoutWidth: number;
    flyoutHeight: number;
    viewWidth: number;
    viewHeight: number;
    absoluteLeft: number;
    absoluteTop: number;
}
interface ZoomWorkspace {
    scrollbar?: object | null;
    getInjectionDiv(): HTMLElement;
    getMetrics(): WorkspaceMetrics | null;
    zoomControls_?: {
        svgGroup_?: SVGElement | null;
        left_: number;
        top_: number;
        position(): void;
    };
}
interface LayoutBlocks {
    TOOLBOX_AT_RIGHT: number;
    TOOLBOX_AT_BOTTOM: number;
    Scrollbar: {scrollbarThickness: number};
}

export function workspaceControlsCorner(workspace: ZoomWorkspace, ScratchBlocks: LayoutBlocks, metrics: WorkspaceMetrics) {
    const {toolboxPosition, flyoutWidth, flyoutHeight, viewWidth, viewHeight, absoluteLeft, absoluteTop} = metrics;
    const rightFlyout = toolboxPosition === ScratchBlocks.TOOLBOX_AT_RIGHT ? flyoutWidth : 0;
    const bottomFlyout = toolboxPosition === ScratchBlocks.TOOLBOX_AT_BOTTOM ? flyoutHeight : 0;
    const scrollbar = workspace.scrollbar ? ScratchBlocks.Scrollbar.scrollbarThickness : 0;
    const container = workspace.getInjectionDiv();
    const {left, top} = container.getBoundingClientRect();
    const view = container.ownerDocument.documentElement;
    return {
        right: Math.min(absoluteLeft + viewWidth - rightFlyout - scrollbar, view.clientWidth - left - container.clientLeft) - 12,
        bottom: Math.min(absoluteTop + viewHeight - bottomFlyout - scrollbar, view.clientHeight - top - container.clientTop) - 12
    };
}

export function attachHorizontalWorkspaceZoom(workspace: ZoomWorkspace, ScratchBlocks: LayoutBlocks,
    getCorner = (metrics: WorkspaceMetrics) => workspaceControlsCorner(workspace, ScratchBlocks, metrics)) {
    const zoom = workspace.zoomControls_;
    const group = zoom?.svgGroup_;
    if (!group) return null;
    const actions = ['out', 'in', 'reset'];
    const buttons = actions.map(action => Array.from(group.children).find(node =>
        node.getAttributeNS('http://www.w3.org/1999/xlink', 'href')?.endsWith(`/zoom-${action}.svg`)));
    if (buttons.some(button => !button)) return null;
    const originals = buttons.map(button => ({x: button.getAttribute('x'), y: button.getAttribute('y')}));
    const size = Number(buttons[0].getAttribute('width'));
    const gap = 8;
    const width = 3 * size + 2 * gap;
    const position = zoom.position;
    const window = group.ownerDocument.defaultView;

    group.setAttribute('data-plus-horizontal-zoom', '');
    buttons.forEach((button, index) => {
        button.setAttribute('x', String(index * (size + gap)));
        button.setAttribute('y', '0');
        button.setAttribute('data-plus-zoom-action', actions[index]);
    });
    zoom.position = () => {
        const metrics = workspace.getMetrics();
        if (!metrics) return;
        const {right, bottom} = getCorner(metrics);
        zoom.left_ = right - width;
        zoom.top_ = bottom - size;
        group.setAttribute('transform', `translate(${zoom.left_},${zoom.top_})`);
    };
    zoom.position();
    const reposition = zoom.position;
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, {passive: true});
    return {
        height: size,
        dispose() {
            window.removeEventListener('resize', reposition);
            window.removeEventListener('scroll', reposition);
            zoom.position = position;
            group.removeAttribute('data-plus-horizontal-zoom');
            buttons.forEach((button, index) => {
                button.removeAttribute('data-plus-zoom-action');
                for (const [axis, value] of Object.entries(originals[index])) {
                    if (value === null) button.removeAttribute(axis);
                    else button.setAttribute(axis, value);
                }
            });
            if (zoom.svgGroup_) zoom.position();
        }
    };
}
