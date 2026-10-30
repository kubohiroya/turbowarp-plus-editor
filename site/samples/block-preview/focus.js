/** Recognize only this site's dedicated sample launch, including existing shared links. */
export function isPreviewSampleLaunch(location, moduleURL = import.meta.url) {
    try {
        const page = new URL(location);
        const editor = new URL('../../editor.html', moduleURL);
        const sample = new URL('./block-preview-rc77.sb3', moduleURL);
        const source = page.searchParams.get('project_url');
        if (!source || page.origin !== editor.origin || page.pathname !== editor.pathname) return false;
        const project = new URL(source, page);
        return project.origin === sample.origin && project.pathname === sample.pathname;
    } catch {
        return false;
    }
}

function firstScene(stage) {
    const blocks = stage?.blocks;
    if (!blocks?.getScripts || !blocks.getBlock) return null;
    const root = blocks.getScripts().map(id => blocks.getBlock(id))
        .find(block => block?.opcode.endsWith('_embeddedYaml'));
    const pending = [root?.next], visited = new Set();
    while (pending.length) {
        const id = pending.pop();
        if (!id || visited.has(id)) continue;
        visited.add(id);
        const block = blocks.getBlock(id);
        if (!block) continue;
        if (block.opcode.endsWith('_scene')) return id;
        pending.push(block.next);
        for (const input of Object.values(block.inputs || {}).reverse()) pending.push(input.block);
    }
    return null;
}

/** Apply the sample's initial view once, after security approval and project deserialization. */
export function initializePreviewSampleFocus({window: win = globalThis.window, moduleURL = import.meta.url} = {}) {
    if (!win || !isPreviewSampleLaunch(win.location.href, moduleURL)) return () => {};
    let timer, frame, selected, disposed = false;
    const dispose = () => {
        disposed = true;
        win.clearTimeout(timer);
        win.cancelAnimationFrame(frame);
        win.removeEventListener('pagehide', dispose);
    };
    const tick = () => {
        if (disposed) return;
        const vm = win.vm, store = win.ReduxStore;
        const state = store?.getState()?.scratchGui;
        if (state?.projectState?.loadingState === 'ERROR') return dispose();
        if (['SHOWING_WITH_ID', 'SHOWING_WITHOUT_ID'].includes(state?.projectState?.loadingState)) {
            if (!selected) {
                const stage = vm?.runtime?.targets?.find(target => target.isStage);
                const sceneId = firstScene(stage);
                if (sceneId && typeof vm.setEditingTarget === 'function') {
                    selected = {vm, targetId: stage.id, sceneId, deadline: Date.now() + 30000};
                    vm.setEditingTarget(stage.id);
                    store.dispatch({type: 'scratch-gui/navigation/ACTIVATE_TAB', activeTabIndex: 0});
                }
            }
            if (selected) {
                // Stop if the user changes target/tab while the workspace is mounting.
                if (vm !== selected.vm || vm.editingTarget?.id !== selected.targetId ||
                    store.getState().scratchGui.editorTab.activeTabIndex !== 0 || Date.now() > selected.deadline)
                    return dispose();
                const blocks = win.ScratchBlocks, workspace = blocks?.getMainWorkspace?.();
                const scene = workspace?.getBlockById(selected.sceneId);
                const metrics = workspace?.getMetrics?.();
                if (scene?.rendered && metrics?.viewWidth > 0 && metrics.viewHeight > 0 && workspace.scrollbar) {
                    frame = win.requestAnimationFrame(() => {
                        if (disposed) return;
                        if (vm.editingTarget?.id !== selected.targetId ||
                            store.getState().scratchGui.editorTab.activeTabIndex !== 0 ||
                            blocks.getMainWorkspace() !== workspace) return dispose();
                        blocks.svgResize(workspace);
                        const point = scene.getRelativeToSurfaceXY(), view = workspace.getMetrics();
                        // Centering a C block uses its entire stack height and can hide its header.
                        const margin = (view.flyoutWidth || 0) + 48;
                        const insetX = workspace.RTL ? view.viewWidth - margin : margin;
                        workspace.scrollbar.set(point.x * workspace.scale - view.contentLeft - insetX,
                            point.y * workspace.scale - view.contentTop - 64);
                        dispose();
                    });
                    return;
                }
            }
        }
        timer = win.setTimeout(tick, 50);
    };
    win.addEventListener('pagehide', dispose, {once: true});
    tick();
    return dispose;
}

initializePreviewSampleFocus();
