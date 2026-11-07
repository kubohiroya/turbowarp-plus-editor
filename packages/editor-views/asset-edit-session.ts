interface AssetTarget {
    id: string;
    getCostumes(): object[];
    getSounds(): object[];
}

interface AssetVM {
    editingTarget?: AssetTarget | null;
    runtime: {getTargetById(id: string): AssetTarget | undefined};
}

// A pending conversion must yield to a newer edit. An already displayed
// bitmap can still finish encoding until another image is committed.
const pendingEdits = new WeakMap<object, object>();
const committedImages = new WeakMap<object, object>();

export function commitCostumeImage(costume: object) {
    pendingEdits.delete(costume);
    const revision = {};
    committedImages.set(costume, revision);
    return () => committedImages.get(costume) === revision;
}

export function prepareAssetHistoryMove<T>(from: T[], to: T[], getCurrent: () => T) {
    return {
        item: from[from.length - 1],
        commit() {
            to.push(getCurrent());
            from.pop();
        }
    };
}

export function createAssetEditSession(kind: 'costume' | 'sound') {
    const assets = (target: AssetTarget) => kind === 'costume' ? target.getCostumes() : target.getSounds();
    let selection: {vm: AssetVM; target: AssetTarget; index: number; asset: object} | undefined;

    return {
        select(vm: AssetVM, index: number) {
            const target = vm.editingTarget;
            const asset = target && assets(target)[index];
            if (!target || !asset) {
                selection = undefined;
            } else if (selection?.vm !== vm || selection.target !== target ||
                    selection.index !== index || selection.asset !== asset) {
                selection = {vm, target, index, asset};
            }
        },
        begin() {
            const started = selection;
            const revision = {};
            if (started) pendingEdits.set(started.asset, revision);
            return () => started !== undefined && selection === started &&
                pendingEdits.get(started.asset) === revision &&
                started.vm.editingTarget === started.target &&
                started.vm.runtime.getTargetById(started.target.id) === started.target &&
                assets(started.target)[started.index] === started.asset;
        },
        close() {
            selection = undefined;
        }
    };
}
