// The judgement for broadcast blocks lives in the layout package, so the section and this search agree.
import {messageReference} from '@kubohiroya/turbowarp-plus-editor-layout/project-messages';

type Field = {id?: string; value: unknown};
type Block = {
    id: string;
    opcode: string;
    next?: string;
    shadow?: boolean;
    fields?: Record<string, Field>;
    inputs?: Record<string, {block?: string; shadow?: string}>;
    mutation?: {proccode?: string; blockInfo?: {text?: string}};
};
type Asset = {name: string};
type Comment = {text: string; blockId?: string | null};
type Variable = {name: string; type?: string; isCloud?: boolean; value?: unknown};
type Target = {
    id: string;
    isStage: boolean;
    isOriginal: boolean;
    getName(): string;
    getCostumes(): Asset[];
    getSounds(): Asset[];
    variables: Record<string, Variable>;
    comments?: Record<string, Comment>;
    blocks: {getScripts(): string[]; getBlock(id: string): Block | undefined};
};
export type SearchProject = {
    targets: Target[];
    getLabelForOpcode?(opcode: string): {category?: string; label?: string} | undefined;
    resetAllCaches?(): void;
    emitProjectChanged?(): void;
};
type BlockKind = 'block' | 'variable' | 'list' | 'message' | 'argument' | 'extension';
type AssetKind = 'costume' | 'backdrop' | 'sound';
export type SearchKind = BlockKind | AssetKind | 'comment' | 'yaml';
export type SearchEdit =
    | {type: 'field'; id: string; field: string; value: string}
    | {type: 'name'; id: string; owner: Target; name: string; variableType: string}
    | {type: 'procedure'; name: string}
    | {type: 'comment'; text: string};
export type ProjectSearchResult = {label: string; target: Target; detail?: string; edit?: SearchEdit} & (
    {kind: BlockKind; block: Block} | {kind: AssetKind; asset: Asset} |
    {kind: 'comment'; comment: Comment; commentId: string}
);
export type YamlSearchDocument = {reference: {providerId: string; documentId: string}; filename: string; source: string};
export type YamlSearchResult = {
    kind: 'yaml'; document: YamlSearchDocument; label: string; detail: string;
    range: {start: number; end: number; expectedText: string};
};
export type SearchResult = ProjectSearchResult | YamlSearchResult;
export const literalSearchPattern = (query: string, flags: string) =>
    new RegExp(query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);

const headings: Record<Exclude<SearchKind, 'yaml'>, [string, string]> = {
    block: ['ブロック', 'Blocks'],
    variable: ['変数の使用箇所', 'Variable uses'],
    list: ['リストの使用箇所', 'List uses'],
    message: ['メッセージの送受信', 'Broadcasts'],
    argument: ['ブロックの引数値', 'Block argument values'],
    extension: ['機能拡張の使用箇所', 'Extension uses'],
    comment: ['コメント', 'Comments'],
    costume: ['コスチューム', 'Costumes'],
    backdrop: ['背景', 'Backdrops'],
    sound: ['音', 'Sounds']
};

export function searchProject(project: SearchProject, messages: Record<string, string>, query: string, japanese: boolean,
    kinds: ReadonlySet<SearchKind> = new Set(Object.keys(headings) as SearchKind[])) {
    const groups = new Map(Object.entries(headings).map(([kind, titles]) => [
        kind as SearchKind, {kind: kind as SearchKind, title: titles[japanese ? 0 : 1], results: [] as ProjectSearchResult[]}
    ]));
    const search = query.trim().toLocaleLowerCase();
    if (!search) return [];

    const stage = project.targets.find(target => target.isStage);
    const searchBlocks = (['block', 'variable', 'list', 'message', 'argument', 'extension'] as const)
        .some(kind => kinds.has(kind));
    const templates = new Map<string, {text: string; extension?: string}>();
    const matches = (value: string) => value.toLocaleLowerCase().includes(search);
    const describeOpcode = (opcode: string) => {
        const cached = templates.get(opcode);
        if (cached) return cached;
        const key = opcode.toUpperCase();
        const alternate = key.replace(/^OPERATOR_/, 'OPERATORS_').replace(/_AS_CLONE$/, 'ASCLONE');
        const vmLabel = project.getLabelForOpcode?.(opcode);
        const separator = vmLabel?.category === 'extension' ? vmLabel.label?.indexOf(': ') ?? -1 : -1;
        const template = {
            text: messages[key] ?? messages[alternate] ??
                (separator > 0 ? vmLabel.label.slice(separator + 2) : vmLabel?.label) ?? opcode.replaceAll('_', ' '),
            extension: separator > 0 ? vmLabel.label.slice(0, separator) : undefined
        };
        templates.set(opcode, template);
        return template;
    };
    const fieldText = (target: Target, key: string, field: Field) => {
        const variable = field.id && (key === 'VARIABLE' || key === 'LIST') ?
            target.variables[field.id] ?? stage?.variables[field.id] : undefined;
        return String(variable?.name ?? field.value ?? '');
    };
    const describe = (target: Target, block: Block, inputs: [string, Block][], template: string) => {
        const values = [
            ...Object.entries(block.fields ?? {}).map(([key, field]) => fieldText(target, key, field)),
            ...inputs.filter(([key]) => !key.startsWith('SUBSTACK')).map(([, child]) =>
                child.shadow ? Object.values(child.fields ?? {}).map(field => String(field.value ?? '')).join(' ') :
                    Object.entries(child.fields ?? {}).map(([key, field]) => fieldText(target, key, field)).join(' ') || '…')
        ];
        if (block.opcode === 'event_whenflagclicked') values.unshift(japanese ? '緑の旗' : 'green flag');
        if (/%\d+/.test(template)) return template.replace(/%(\d+)/g, (_, index) => values[Number(index) - 1] ?? '…').trim();
        return [template, ...values].filter(Boolean).join(' ');
    };

    for (const target of project.targets) {
        if (!target.isOriginal) continue;
        const pending = searchBlocks ? target.blocks.getScripts().slice().reverse() : [];
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
            const message = messageReference(target, block, stage);
            const kind = variable ? 'variable' : list ? 'list' : 'message';
            const reference = variable ?? list ?? (message && {id: message.id, value: message.fieldValue});
            const name = variable || list ? fieldText(target, variable ? 'VARIABLE' : 'LIST', reference) : message?.name;
            const opcode = describeOpcode(block.opcode);
            const procedure = block.mutation?.proccode ??
                inputs.find(([key]) => key === 'custom_block')?.[1].mutation?.proccode;
            const customLabel = block.mutation?.blockInfo?.text;
            const template = procedure ? procedure.replace(/%[sbn]/g, '…') :
                typeof customLabel === 'string' ? customLabel : opcode.text;
            const label = procedure ? template : describe(target, block, inputs, template);
            const add = (kind: BlockKind, label: string, detail?: string, edit?: SearchEdit) =>
                groups.get(kind).results.push({kind, target, block, label, detail, edit});
            if (kinds.has('block') && (matches(template) || matches(block.opcode) ||
                (block.opcode === 'event_whenflagclicked' && matches(japanese ? '緑の旗' : 'green flag')))) {
                add('block', label, undefined, procedure ? {type: 'procedure', name: procedure} : undefined);
            }
            if (kinds.has(kind) && name && matches(name)) {
                const owner = reference?.id &&
                    (target.variables[reference.id] ? target : stage?.variables[reference.id] ? stage : undefined);
                const scope = (variable || list) && owner &&
                    (owner.isStage ? (japanese ? '全体' : 'Global') : (japanese ? 'このスプライト' : 'Local'));
                const model = owner && owner.variables[reference.id];
                const edit = model && !model.isCloud ? {
                    type: 'name' as const, id: reference.id, owner, name: model.name,
                    variableType: model.type ?? (list ? 'list' : message ? 'broadcast_msg' : '')
                } : undefined;
                add(kind, name, scope || label, edit);
            }
            if (kinds.has('extension') && opcode.extension && matches(opcode.extension)) add('extension', opcode.extension, label);
            if (kinds.has('argument')) {
                const addArguments = (owner: Block) => {
                    for (const [key, field] of Object.entries(owner.fields ?? {})) {
                        if (field === reference || (message && key === 'BROADCAST_OPTION')) continue;
                        const value = String(field.value ?? '');
                        if (value && matches(value)) add('argument', value, label,
                            {type: 'field', id: owner.id, field: key, value});
                    }
                };
                addArguments(block);
                for (const [, child] of inputs) {
                    if (child.shadow) addArguments(child);
                }
            }
        }

        if (kinds.has('comment')) {
            for (const [commentId, comment] of Object.entries(target.comments ?? {})) {
                if (matches(comment.text)) groups.get('comment').results.push({
                    kind: 'comment', target, comment, commentId, label: comment.text, edit: {type: 'comment', text: comment.text}
                });
            }
        }

        const assets: [AssetKind, Asset[]][] = [
            [target.isStage ? 'backdrop' : 'costume', target.getCostumes()],
            ['sound', target.getSounds()]
        ];
        for (const [kind, items] of assets) {
            if (!kinds.has(kind)) continue;
            for (const asset of items) {
                if (matches(asset.name)) groups.get(kind).results.push({kind, asset, label: asset.name, target});
            }
        }
    }
    return [...groups.values()].filter(group => group.results.length);
}

export function searchYamlDocuments(documents: readonly YamlSearchDocument[], query: string, japanese: boolean) {
    const results: YamlSearchResult[] = [];
    const search = query.trim();
    if (!search) return results;
    const pattern = literalSearchPattern(search, 'giu');
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const {filename} of documents) {
        if (seen.has(filename)) duplicates.add(filename);
        seen.add(filename);
    }
    for (const document of documents) {
        let line = 1;
        let lineStart = 0;
        let newline = document.source.indexOf('\n');
        for (const match of document.source.matchAll(pattern)) {
            const start = match.index;
            const end = start + match[0].length;
            while (newline >= 0 && newline < start) {
                line++;
                lineStart = newline + 1;
                newline = document.source.indexOf('\n', lineStart);
            }
            const column = start - lineStart + 1;
            const nextNewline = document.source.indexOf('\n', end);
            const before = Math.max(lineStart, start - 48);
            const lineEnd = nextNewline < 0 ? document.source.length : nextNewline;
            const after = Math.min(lineEnd, end + 48);
            const position = japanese ? `${line} 行 ${column} 列` : `Line ${line}, column ${column}`;
            const identity = duplicates.has(document.filename) ?
                `${document.reference.providerId}/${document.reference.documentId}` : '';
            results.push({
                kind: 'yaml', document, label: `${before > lineStart ? '…' : ''}${document.source.slice(before, after)}${after < lineEnd ? '…' : ''}`,
                detail: [position, identity].filter(Boolean).join(' · '),
                range: {start, end, expectedText: match[0]}
            });
        }
    }
    return results;
}
