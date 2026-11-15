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

/**
 * Whether a script editor shows only the hat of a script. The flag is kept in the hat's mutation, so it is
 * saved in the project and travels with the script. ScratchBlocks ignores the attribute on hats that read
 * no mutation, such as a function definition's.
 */
export const foldedDefinitionAttribute = 'tw-plus-folded';

type MutableBlock = {mutation?: Record<string, unknown> & {tagName?: string; children?: unknown[]}} | undefined;

export function isFoldedDefinition(block: MutableBlock) {
    return block?.mutation?.[foldedDefinitionAttribute] === 'true';
}

export function setFoldedDefinition(block: NonNullable<MutableBlock>, folded: boolean) {
    if (folded) {
        block.mutation = {tagName: 'mutation', children: [], ...block.mutation, [foldedDefinitionAttribute]: 'true'};
        return;
    }
    if (!block.mutation) return;
    const {[foldedDefinitionAttribute]: _, ...rest} = block.mutation;
    // Drop the mutation this flag made, so an unfolded hat saves as it did before.
    const empty = Object.keys(rest).every(key => key === 'tagName' || key === 'children') && !rest.children?.length;
    if (empty) delete block.mutation;
    else block.mutation = rest;
}
