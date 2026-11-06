// ScratchBlocks disconnects removed arguments before emitting the mutation.
// The VM keeps the old input slots and ignores delete events for their shadows.
export function removeObsoleteProcedureInputs(blocks, blockIds: Set<string>) {
    for (const id of blockIds) {
        const block = blocks.getBlock(id);
        if (block?.opcode !== 'procedures_call' && block?.opcode !== 'procedures_prototype') continue;
        const argumentIds = new Set<string>(JSON.parse(block.mutation.argumentids));
        for (const name of Object.keys(block.inputs)) {
            if (argumentIds.has(name)) continue;
            const {block: childId, shadow: shadowId} = block.inputs[name];
            if (childId && childId !== shadowId && blocks.getBlock(childId)?.parent === id) {
                throw new Error('Procedure edit left a removed argument connected');
            }
            delete block.inputs[name];
            const shadow = shadowId && blocks.getBlock(shadowId);
            if (shadow?.shadow && (shadow.parent === id || shadow.parent == null)) blocks.deleteBlock(shadowId);
        }
        blocks.resetCache();
    }
}
