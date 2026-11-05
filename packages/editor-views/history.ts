interface CommentData {
    id: string;
    blockId: string | null;
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    minimized: boolean;
}
export interface CodeTarget {
    isStage: boolean;
    blocks: {
        _blocks: Record<string, unknown>;
        _scripts: string[];
        getScripts(): string[];
        resetCache(): void;
        emitProjectChanged(): void;
        toXML(comments: Record<string, CommentData>): string;
    };
    comments: Record<string, CommentData & {toXML(): string}>;
    variables: Record<string, {toXML(local?: boolean): string}>;
    createComment(id: string, blockId: string | null, text: string, x: number, y: number,
        width: number, height: number, minimized: boolean): void;
}

const historyLimit = 100;

export const capture = (target: CodeTarget) => structuredClone({
    blocks: target.blocks._blocks,
    scripts: target.blocks.getScripts(),
    comments: target.comments
});

export function restore(target: CodeTarget, snapshot: ReturnType<typeof capture>) {
    const {blocks, scripts, comments} = structuredClone(snapshot);
    // Keep the live Blocks container, which also belongs to any clones of the sprite.
    target.blocks._blocks = Object.assign(Object.create(null), blocks);
    target.blocks._scripts = scripts;
    // Recreate VM Comment instances so projections and SB3 retain attached and workspace comments.
    target.comments = Object.create(null);
    for (const {id, blockId, text, x, y, width, height, minimized} of Object.values(comments)) {
        target.createComment(id, blockId, text, x, y, width, height, minimized);
    }
    target.blocks.resetCache();
    target.blocks.emitProjectChanged();
}

export function createHistory(target: CodeTarget) {
    const past: ReturnType<typeof capture>[] = [];
    const future: ReturnType<typeof capture>[] = [];
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
        renameSpriteReferences(oldName: string, newName: string) {
            // Use the pinned VM's field rules for snapshots without touching the live block cache.
            const blocks = Object.create(target.blocks);
            blocks.resetCache = () => {};
            for (const snapshot of [...past, present, ...future]) {
                blocks._blocks = snapshot.blocks;
                blocks.updateAssetName(oldName, newName, 'sprite');
            }
        },
        step(redo: boolean) {
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

export function workspaceXML(vm: {runtime: {getTargetForStage(): CodeTarget}}, target: CodeTarget) {
    const stage = vm.runtime.getTargetForStage();
    const globals = Object.values(stage.variables).map(variable => variable.toXML());
    const locals = target.isStage ? [] : Object.values(target.variables).map(variable => variable.toXML(true));
    const comments = Object.values(target.comments).filter(comment => comment.blockId === null)
        .map(comment => comment.toXML());
    return `<xml xmlns="http://www.w3.org/1999/xhtml"><variables>${globals.join('')}${locals.join('')}</variables>` +
        `${comments.join('')}${target.blocks.toXML(target.comments)}</xml>`;
}
