import styles from './minimap.css';

const SVG = 'http://www.w3.org/2000/svg';

export function attachWorkspaceMinimap (workspace, ScratchBlocks) {
    const container = workspace.getInjectionDiv();
    const canvas = workspace.getCanvas();
    const workspaceSvg = workspace.getParentSvg();
    const document = container.ownerDocument;
    const window = document.defaultView;
    const createSvg = name => document.createElementNS(SVG, name);
    const minimap = createSvg('svg');
    minimap.classList.add(styles.minimap);
    minimap.dataset.workspaceMinimap = '';
    minimap.setAttribute('aria-hidden', 'true');
    minimap.style.display = 'none';
    const blocks = createSvg('g');
    const viewport = createSvg('rect');
    viewport.classList.add(styles.viewport);
    minimap.append(blocks, viewport);

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
        const scale = workspace.scale;
        const x = metrics.viewLeft / scale;
        const y = metrics.viewTop / scale;
        const width = metrics.viewWidth / scale;
        const height = metrics.viewHeight / scale;
        const left = Math.min(x, metrics.contentLeft / scale);
        const top = Math.min(y, metrics.contentTop / scale);
        const right = Math.max(x + width, (metrics.contentLeft + metrics.contentWidth) / scale);
        const bottom = Math.max(y + height, (metrics.contentTop + metrics.contentHeight) / scale);
        const padding = Math.max(right - left, bottom - top) * 0.035;

        if (blocksChanged) drawBlocks();
        minimap.setAttribute('viewBox', `${left - padding} ${top - padding} ${right - left + 2 * padding} ${bottom - top + 2 * padding}`);
        viewport.setAttribute('x', x);
        viewport.setAttribute('y', y);
        viewport.setAttribute('width', width);
        viewport.setAttribute('height', height);

        const bottomToolbox = metrics.toolboxPosition === ScratchBlocks.TOOLBOX_AT_BOTTOM ? metrics.toolboxHeight : 0;
        minimap.style.left = `${metrics.absoluteLeft + 12}px`;
        minimap.style.bottom = `${bottomToolbox + 16}px`;
        minimap.style.width = `${Math.min(164, metrics.viewWidth * 0.4)}px`;
        minimap.style.height = `${Math.min(104, metrics.viewHeight * 0.35)}px`;
        minimap.style.display = '';
    };

    const schedule = () => {
        if (frame === null) frame = window.requestAnimationFrame(render);
    };
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
            changes.disconnect();
            resize.disconnect();
            if (frame !== null) window.cancelAnimationFrame(frame);
            minimap.remove();
        }
    };
}
