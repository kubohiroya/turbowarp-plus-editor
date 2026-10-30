/** Select the target that owns this document using live references, never persisted block IDs. */
export function focusDocumentReference({ vm, registry, readReference, reference }) {
    if (typeof vm?.setEditingTarget !== 'function' || !Array.isArray(vm.runtime?.targets))
        return null;
    const known = new Set(registry.getHatOpcodes());
    const targets = vm.runtime.targets.filter((target) => target?.isOriginal !== false);
    targets.sort(
        (a, b) => Number(b.id === vm.editingTarget?.id) - Number(a.id === vm.editingTarget?.id)
    );
    for (const target of targets) {
        if (
            typeof target.blocks?.getScripts !== 'function' ||
            typeof target.blocks.getBlock !== 'function'
        )
            continue;
        for (const rootId of target.blocks.getScripts()) {
            const block = target.blocks.getBlock(rootId);
            if (!block || !known.has(block.opcode)) continue;
            let actual;
            try {
                actual = readReference(block, target);
            } catch {
                continue;
            }
            if (
                actual.providerId !== reference.providerId ||
                actual.documentId !== reference.documentId
            )
                continue;
            try {
                vm.setEditingTarget(target.id);
            } catch {
                return null;
            }
            // Centering a connected large stack can hide its root. Preserve the GUI's saved viewport.
            return { targetId: target.id, rootId };
        }
    }
    return null;
}
