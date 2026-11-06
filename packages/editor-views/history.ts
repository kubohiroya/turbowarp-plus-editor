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
    variables: Record<string, {name?: string; type?: string; toXML(local?: boolean): string}>;
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

type BroadcastStage = Pick<CodeTarget, 'variables'> & {
    createVariable(id: string, name: string, type: 'broadcast_msg', isCloud: false): void;
};

export function createHistory(target: CodeTarget, stage: BroadcastStage) {
    const captureRevision = () => {
        const snapshot = capture(target);
        const messages = new Map<string, string>();
        for (const block of Object.values(snapshot.blocks)) {
            const id = (block as {fields?: {BROADCAST_OPTION?: {id?: string}}}).fields?.BROADCAST_OPTION?.id;
            const message = id && stage.variables[id];
            if (message?.type === 'broadcast_msg' && typeof message.name === 'string') messages.set(id, message.name);
        }
        return {...snapshot, messages: [...messages]};
    };
    const past: ReturnType<typeof captureRevision>[] = [];
    const future: ReturnType<typeof captureRevision>[] = [];
    let present = captureRevision();
    let revision = 0;
    return {
        get state() {return {revision, canUndo: past.length > 0, canRedo: future.length > 0};},
        commit() {
            const next = captureRevision();
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
            // The VM prunes unused broadcast IDs on workspace refresh.
            // Restore messages that were still registered in this revision.
            for (const [id, name] of present.messages) {
                if (!Object.hasOwn(stage.variables, id)) stage.createVariable(id, name, 'broadcast_msg', false);
            }
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
