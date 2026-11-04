const historyLimit = 100;

export const capture = target => structuredClone({
    blocks: target.blocks._blocks,
    scripts: target.blocks.getScripts()
});

export function restore(target, snapshot) {
    const {blocks, scripts} = structuredClone(snapshot);
    // Keep the live Blocks container, which also belongs to any clones of the sprite.
    target.blocks._blocks = Object.assign(Object.create(null), blocks);
    target.blocks._scripts = scripts;
    target.blocks.resetCache();
    target.blocks.emitProjectChanged();
}

export function createHistory(target) {
    const past = [];
    const future = [];
    let present = capture(target);
    let revision = 0;
    return {
        get state() {return {revision, canUndo: past.length > 0, canRedo: future.length > 0};},
        commit() {
            const next = capture(target);
            if (JSON.stringify(next) === JSON.stringify(present)) return false;
            past.push(present);
            if (past.length > historyLimit) past.shift();
            present = next;
            future.length = 0;
            revision++;
            return true;
        },
        step(redo) {
            const next = (redo ? future : past).pop();
            if (!next) return false;
            (redo ? past : future).push(present);
            present = next;
            restore(target, present);
            revision++;
            return true;
        }
    };
}

export function workspaceXML(vm, target) {
    const stage = vm.runtime.getTargetForStage();
    const globals = Object.values(stage.variables).map(variable => variable.toXML());
    const locals = target.isStage ? [] : Object.values(target.variables).map(variable => variable.toXML(true));
    const comments = Object.values(target.comments).filter(comment => comment.blockId === null)
        .map(comment => comment.toXML());
    return `<xml xmlns="http://www.w3.org/1999/xhtml"><variables>${globals.join('')}${locals.join('')}</variables>` +
        `${comments.join('')}${target.blocks.toXML(target.comments)}</xml>`;
}
