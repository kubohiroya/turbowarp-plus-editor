export function workspaceControlsCorner(workspace, ScratchBlocks, metrics) {
    const {toolboxPosition, flyoutWidth, flyoutHeight, viewWidth, viewHeight, absoluteLeft, absoluteTop} = metrics;
    const rightFlyout = toolboxPosition === ScratchBlocks.TOOLBOX_AT_RIGHT ? flyoutWidth : 0;
    const bottomFlyout = toolboxPosition === ScratchBlocks.TOOLBOX_AT_BOTTOM ? flyoutHeight : 0;
    const scrollbar = workspace.scrollbar ? ScratchBlocks.Scrollbar.scrollbarThickness : 0;
    return {right: absoluteLeft + viewWidth - rightFlyout - scrollbar - 12,
        bottom: absoluteTop + viewHeight - bottomFlyout - scrollbar - 12};
}

export function attachHorizontalWorkspaceZoom(workspace, ScratchBlocks) {
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

    group.setAttribute('data-plus-horizontal-zoom', '');
    buttons.forEach((button, index) => {
        button.setAttribute('x', index * (size + gap));
        button.setAttribute('y', 0);
        button.setAttribute('data-plus-zoom-action', actions[index]);
    });
    zoom.position = () => {
        const metrics = workspace.getMetrics();
        if (!metrics) return;
        const {right, bottom} = workspaceControlsCorner(workspace, ScratchBlocks, metrics);
        zoom.left_ = right - width;
        zoom.top_ = bottom - size;
        group.setAttribute('transform', `translate(${zoom.left_},${zoom.top_})`);
    };
    zoom.position();
    return {
        height: size,
        dispose() {
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
