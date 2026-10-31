import {bindBlockEditorIcon} from '@kubohiroya/turbowarp-extension-data-editor/turbowarp';
import {registerEmbeddedYamlRootHatShape} from '@kubohiroya/turbowarp-document-source';
import {attachDocumentWorkspacePatch} from './workspace-patch.js';

export function attachEmbeddedYamlHat({vm, registry, readReference, window: win, getScratch, label, canOpen, onOpen, onError = console.error}) {
    let disposed = false, blocks = null, workspace = null, resolving = false, queued = null, poll = null;
    const decorations = new Map();
    let detachWorkspacePatch = null;
    const removeDecorations = () => {
        for (const decoration of decorations.values()) decoration.cleanup();
        decorations.clear();
    };
    const validBlock = block => {
        if (!workspace || workspace.isFlyout || workspace.options?.readOnly || block.isInFlyout ||
            block.isShadow?.() || block.isEditable?.() === false || !registry.getHatOpcodes().includes(block.type)) return false;
        const target = vm.editingTarget;
        return Boolean(target && workspace.getBlockById(block.id) === block && target.blocks?.getBlock(block.id)?.opcode === block.type);
    };
    function refreshDecorations() {
        if (disposed || !workspace) return;
        const seen = new Set();
        for (const block of workspace.getAllBlocks(false)) {
            if (!validBlock(block)) continue;
            const field = block.inputList?.[0]?.fieldRow?.[0];
            if (!(field instanceof blocks.FieldImage) || !field.fieldGroup_) continue;
            seen.add(block.id);
            const previous = decorations.get(block.id);
            const target = vm.editingTarget;
            if (previous && previous.field === field && previous.target === target) {
                field.fieldGroup_.setAttribute('aria-disabled', String(!canOpen()));
                continue;
            }
            previous?.cleanup();
            const element = field.fieldGroup_;
            const priorDisabled = element.getAttribute('aria-disabled');
            const tooltip = field.imageElement_?.tooltip;
            field.setTooltip?.(label);
            const unbind = bindBlockEditorIcon({element, label,
                canOpen: () => !disposed && validBlock(block) && vm.editingTarget === target &&
                    !workspace.isDragging?.() && canOpen(),
                onOpen: () => {
                    const anchor = {element, blockId: block.id, targetId: target.id};
                    try { onOpen({...anchor, reference: readReference(block, target)}); }
                    catch (error) { onOpen({...anchor, error}); }
                }});
            element.setAttribute('data-twpe-yaml-hat-icon', '');
            element.setAttribute('aria-disabled', String(!canOpen()));
            decorations.set(block.id, {field, target, cleanup() {
                unbind(); element.removeAttribute('data-twpe-yaml-hat-icon');
                if (priorDisabled === null) element.removeAttribute('aria-disabled');
                else element.setAttribute('aria-disabled', priorDisabled);
                if (field.imageElement_) field.imageElement_.tooltip = tooltip;
            }});
        }
        for (const [id, decoration] of decorations) if (!seen.has(id)) { decoration.cleanup(); decorations.delete(id); }
    }
    function switchWorkspace(next) {
        if (next === workspace) return;
        workspace?.removeChangeListener?.(schedule);
        removeDecorations(); workspace = next;
        workspace?.addChangeListener?.(schedule);
    }
    async function refresh(scan = false) {
        if (disposed) return;
        const scratch = getScratch();
        if (scratch?.vm !== vm || typeof scratch.gui?.getBlockly !== 'function') { switchWorkspace(null); return; }
        if (!blocks && !resolving) {
            resolving = true;
            try {
                const resolved = await scratch.gui.getBlockly();
                if (!disposed) {
                    registerEmbeddedYamlRootHatShape(resolved);
                    detachWorkspacePatch ||= attachDocumentWorkspacePatch(vm, resolved);
                    blocks = resolved;
                }
            }
            catch (error) { if (!disposed) onError(error); }
            finally { resolving = false; }
        }
        if (disposed || !blocks) return;
        const next = blocks.getMainWorkspace?.() || blocks.mainWorkspace || null;
        const candidate = next && typeof next.getAllBlocks === 'function' ? next : null;
        const changed = candidate !== workspace;
        switchWorkspace(candidate);
        if (scan || changed) refreshDecorations();
    }
    function schedule() {
        if (disposed || queued !== null) return;
        queued = win.setTimeout(() => { queued = null; void refresh(true); }, 0);
    }
    // Poll only for workspace replacement; actual block changes use workspace/VM events.
    function discover() {
        if (disposed) return;
        void refresh(); poll = win.setTimeout(discover, 500);
    }
    const vmEvents = ['workspaceUpdate', 'targetsUpdate', 'EXTENSION_ADDED'];
    const runtimeEvents = ['PROJECT_LOADED', 'RUNTIME_DISPOSED', 'EXTENSION_ADDED'];
    for (const name of vmEvents) vm.on?.(name, schedule);
    for (const name of runtimeEvents) vm.runtime?.on?.(name, schedule);
    const unsubscribe = registry.subscribe(schedule);
    discover();
    return {refresh: schedule, dispose() {
        if (disposed) return;
        disposed = true; win.clearTimeout(poll); win.clearTimeout(queued);
        for (const name of vmEvents) vm.off?.(name, schedule);
        for (const name of runtimeEvents) vm.runtime?.off?.(name, schedule);
        unsubscribe();
        detachWorkspacePatch?.();
        switchWorkspace(null);
    }};
}
