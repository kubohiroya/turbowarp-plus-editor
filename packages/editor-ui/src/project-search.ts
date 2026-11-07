type Field = {id?: string; value: unknown};
type Block = {
    id: string;
    opcode: string;
    next?: string;
    shadow?: boolean;
    fields?: Record<string, Field>;
    inputs?: Record<string, {block?: string}>;
    mutation?: {proccode?: string; blockInfo?: {text?: string}};
};
type Asset = {name: string};
type Target = {
    id: string;
    isStage: boolean;
    isOriginal: boolean;
    getName(): string;
    getCostumes(): Asset[];
    getSounds(): Asset[];
    variables: Record<string, {name: string}>;
    blocks: {getScripts(): string[]; getBlock(id: string): Block | undefined};
};
export type SearchProject = {
    targets: Target[];
    getLabelForOpcode?(opcode: string): {label?: string} | undefined;
};
type BlockKind = 'block' | 'variable' | 'list' | 'message';
type AssetKind = 'costume' | 'backdrop' | 'sound';
export type SearchKind = BlockKind | AssetKind;
export type ProjectSearchResult = {label: string; target: Target; detail?: string} & (
    {kind: BlockKind; block: Block} | {kind: AssetKind; asset: Asset}
);

const headings: Record<SearchKind, [string, string]> = {
    block: ['ブロック', 'Blocks'],
    variable: ['変数の使用箇所', 'Variable uses'],
    list: ['リストの使用箇所', 'List uses'],
    message: ['メッセージの送受信', 'Broadcasts'],
    costume: ['コスチューム', 'Costumes'],
    backdrop: ['背景', 'Backdrops'],
    sound: ['音', 'Sounds']
};

export function searchProject(project: SearchProject, messages: Record<string, string>, query: string, japanese: boolean) {
    const groups = new Map(Object.entries(headings).map(([kind, titles]) => [
        kind as SearchKind, {kind: kind as SearchKind, title: titles[japanese ? 0 : 1], results: [] as ProjectSearchResult[]}
    ]));
    const search = query.trim().toLocaleLowerCase();
    if (!search) return [];

    const stage = project.targets.find(target => target.isStage);
    const templates = new Map<string, string>();
    const matches = (value: string) => value.toLocaleLowerCase().includes(search);
    const getTemplate = (opcode: string) => {
        if (!templates.has(opcode)) {
            const key = opcode.toUpperCase();
            const alternate = key.replace(/^OPERATOR_/, 'OPERATORS_').replace(/_AS_CLONE$/, 'ASCLONE');
            templates.set(opcode, messages[key] ?? messages[alternate] ?? project.getLabelForOpcode?.(opcode)?.label ??
                opcode.replaceAll('_', ' '));
        }
        return templates.get(opcode);
    };
    const fieldText = (target: Target, key: string, field: Field) => {
        const variable = field.id && (key === 'VARIABLE' || key === 'LIST') ?
            target.variables[field.id] ?? stage?.variables[field.id] : undefined;
        return String(variable?.name ?? field.value ?? '');
    };
    const describe = (target: Target, block: Block, inputs: [string, Block][]) => {
        const procedure = block.mutation?.proccode ?? inputs.find(([key]) => key === 'custom_block')?.[1].mutation?.proccode;
        if (procedure) return procedure.replace(/%[sbn]/g, '…');
        const values = [
            ...Object.entries(block.fields ?? {}).map(([key, field]) => fieldText(target, key, field)),
            ...inputs.filter(([key]) => !key.startsWith('SUBSTACK')).map(([, child]) =>
                child.shadow ? Object.values(child.fields ?? {}).map(field => String(field.value ?? '')).join(' ') :
                    Object.entries(child.fields ?? {}).map(([key, field]) => fieldText(target, key, field)).join(' ') || '…')
        ];
        if (block.opcode === 'event_whenflagclicked') values.unshift(japanese ? '緑の旗' : 'green flag');
        const customLabel = block.mutation?.blockInfo?.text;
        const template = typeof customLabel === 'string' ? customLabel : getTemplate(block.opcode);
        if (/%\d+/.test(template)) return template.replace(/%(\d+)/g, (_, index) => values[Number(index) - 1] ?? '…').trim();
        return [template, ...values].filter(Boolean).join(' ');
    };

    for (const target of project.targets) {
        if (!target.isOriginal) continue;
        const pending = target.blocks.getScripts().slice().reverse();
        const seen = new Set<string>();
        while (pending.length) {
            const id = pending.pop();
            if (seen.has(id)) continue;
            seen.add(id);
            const block = target.blocks.getBlock(id);
            if (!block || block.shadow) continue;
            const inputs: [string, Block][] = [];
            for (const [key, input] of Object.entries(block.inputs ?? {})) {
                const child = input.block && target.blocks.getBlock(input.block);
                if (child) inputs.push([key, child]);
            }
            if (block.next) pending.push(block.next);
            for (let i = inputs.length - 1; i >= 0; i--) {
                if (!inputs[i][1].shadow) pending.push(inputs[i][1].id);
            }

            const variable = block.fields?.VARIABLE;
            const list = block.fields?.LIST;
            const broadcast = block.fields?.BROADCAST_OPTION ??
                inputs.find(([key]) => key === 'BROADCAST_INPUT')?.[1].fields?.BROADCAST_OPTION;
            const isBroadcast = block.opcode === 'event_whenbroadcastreceived' ||
                block.opcode === 'event_broadcast' || block.opcode === 'event_broadcastandwait';
            const kind = variable ? 'variable' : list ? 'list' : isBroadcast ? 'message' : 'block';
            const reference = variable ?? list ?? (isBroadcast ? broadcast : undefined);
            const name = reference && fieldText(target, variable ? 'VARIABLE' : list ? 'LIST' : 'BROADCAST_OPTION', reference);
            const label = describe(target, block, inputs);
            if (!matches(label) && !matches(block.opcode) && !(name && matches(name))) continue;
            const owner = (variable || list) && reference?.id &&
                (target.variables[reference.id] ? target : stage?.variables[reference.id] ? stage : undefined);
            const scope = owner && (owner.isStage ? (japanese ? '全体' : 'Global') : (japanese ? 'このスプライト' : 'Local'));
            groups.get(kind).results.push({kind, label: name && !label.includes(name) ? `${name} — ${label}` : label,
                target, block, detail: scope || undefined});
        }

        const assets: [AssetKind, Asset[]][] = [
            [target.isStage ? 'backdrop' : 'costume', target.getCostumes()],
            ['sound', target.getSounds()]
        ];
        for (const [kind, items] of assets) {
            for (const asset of items) {
                if (matches(asset.name)) groups.get(kind).results.push({kind, asset, label: asset.name, target});
            }
        }
    }
    return [...groups.values()].filter(group => group.results.length);
}
