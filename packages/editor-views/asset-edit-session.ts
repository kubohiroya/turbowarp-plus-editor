interface AssetTarget {
    id: string;
    getCostumes(): object[];
    getSounds(): object[];
}

interface AssetVM {
    editingTarget?: AssetTarget | null;
    runtime: {getTargetById(id: string): AssetTarget | undefined};
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
            return () => started !== undefined && selection === started &&
                started.vm.editingTarget === started.target &&
                started.vm.runtime.getTargetById(started.target.id) === started.target &&
                assets(started.target)[started.index] === started.asset;
        },
        close() {
            selection = undefined;
        }
    };
}
