type BlockDefinition = {type: string; [key: string]: unknown};
type Category = {id: string; xml: string};
type DynamicShape = {mutation: string; json: BlockDefinition};
export type CodeExtensions = {definitions: BlockDefinition[]; categories: Category[]; dynamicDefaults: DynamicShape[]};

const safeImage = (source: unknown): source is string =>
    typeof source === 'string' && /^(?:data:image\/|media:\/\/)/i.test(source);

function menuOptions(options: unknown) {
    const valid = Array.isArray(options) ? options.filter(pair => Array.isArray(pair) && pair.length === 2 &&
        (typeof pair[0] === 'string' || safeImage(pair[0]?.src)) && typeof pair[1] === 'string') : [];
    return valid.length ? valid : [['', '']];
}

function projectDefinition(json, runtime, target): BlockDefinition {
    return JSON.parse(JSON.stringify(json, (key, value) => {
        if (key === 'src') return safeImage(value) ? value : '';
        if (key === 'options') {
            if (typeof value !== 'function') return menuOptions(value);
            // The VM's menu callbacks implicitly use the active editing target.
            if (runtime.getEditingTarget() === target) {
                try {
                    return menuOptions(value());
                } catch {
                    return menuOptions(null);
                }
            }
            return menuOptions(null);
        }
        return typeof value === 'function' ? undefined : value;
    }));
}

// Match the connection shapes supported by the docked GUI's dynamic block editor.
const dynamicTypes = new Set(['command', 'reporter', 'Boolean', 'hat', 'event']);
const supportsDynamicInfo = info => dynamicTypes.has(info?.blockType) &&
    typeof info.text === 'string' && !info.branchCount;

// getBlocksJSON omits menu shadows and does not distinguish dynamic shapes.
export function getCodeExtensions(runtime, target): CodeExtensions {
    const definitions: BlockDefinition[] = [];
    const dynamicDefaults: DynamicShape[] = [];
    for (const category of runtime._blockInfo ?? []) {
        for (const entry of [...(category.menus ?? []), ...(category.blocks ?? [])]) {
            const json = entry.json;
            if (!json?.type?.startsWith(`${category.id}_`)) continue;
            if (!entry.info?.isDynamic) definitions.push(projectDefinition(json, runtime, target));
            else if (supportsDynamicInfo(entry.info)) {
                dynamicDefaults.push({mutation: JSON.stringify(entry.info), json: projectDefinition(json, runtime, target)});
            }
        }
    }
    let categories: Category[] = [];
    try {
        categories = runtime.getBlocksXML?.(target) ?? [];
    } catch {
        // Invalid palette metadata must not prevent existing blocks from loading.
    }
    return {definitions, categories, dynamicDefaults};
}

export function getCodeDynamicShapes(runtime, target): DynamicShape[] {
    const dynamic = new Map();
    for (const category of runtime._blockInfo ?? []) {
        for (const entry of category.blocks ?? []) {
            if (entry.info?.isDynamic && entry.json?.type) dynamic.set(entry.json.type, {category, opcode: entry.info.opcode});
        }
    }
    if (!dynamic.size) return [];
    const shapes = new Map<string, DynamicShape>();
    for (const block of Object.values(target.blocks._blocks) as {opcode: string; mutation?: {blockInfo?: unknown}}[]) {
        const registration = dynamic.get(block.opcode);
        const info = block.mutation?.blockInfo;
        if (!registration || !supportsDynamicInfo(info)) continue;
        const mutation = JSON.stringify(info);
        const key = shapeKey(block.opcode, mutation);
        if (shapes.has(key)) continue;
        try {
            const metadata = {...(info as object), opcode: registration.opcode, isDynamic: true};
            const {json} = runtime._convertBlockForScratchBlocks(metadata, registration.category);
            shapes.set(key, {mutation, json: projectDefinition(json, runtime, target)});
        } catch {
            // An invalid or unsupported mutation remains in the parent VM.
        }
    }
    return [...shapes.values()];
}

const shapeKey = (type: string, mutation: string) => `${type}\n${mutation}`;
const paletteTags = new Set(['block', 'shadow', 'field', 'value', 'statement', 'next', 'mutation', 'sep']);
const blockArgs = (json: BlockDefinition) => Object.entries(json).filter(([key]) => /^args\d+$/.test(key))
    .flatMap(([, args]) => Array.isArray(args) ? args : []);

export function createCodeExtensionPalette(blocks) {
    const installed = new Set<string>();
    const dynamicTypes = new Set<string>();
    const defaults = new Map<string, BlockDefinition>();
    let shapes = new Map<string, BlockDefinition>();

    function canInstall(json: BlockDefinition) {
        const registry = blocks.Field?.TYPE_MAP_;
        const mixins = blocks.Extensions?.ALL_;
        const customFieldPrefix = `field_${json.type.split('_')[0]}_`;
        if (blockArgs(json).some(field => typeof field?.type !== 'string' || (field.type.startsWith('field_') &&
            (registry ? !Object.hasOwn(registry, field.type) : field.type.startsWith(customFieldPrefix))))) return false;
        const extensions = Array.isArray(json.extensions) ? json.extensions : [json.extensions].filter(Boolean);
        return !mixins || ![...extensions, json.mutator].filter(Boolean).some(name => !Object.hasOwn(mixins, name));
    }

    function shape(type: string, raw: string) {
        if (!raw) return;
        try {
            const key = shapeKey(type, JSON.stringify(JSON.parse(raw)));
            return shapes.get(key) ?? defaults.get(key);
        } catch {
            return;
        }
    }

    function supportsBlock(block: Element) {
        const type = block.getAttribute('type');
        if (!Object.hasOwn(blocks.Blocks, type)) return false;
        if (!dynamicTypes.has(type)) return true;
        const mutation = Array.from(block.children).find(child => child.localName === 'mutation');
        const json = shape(type, mutation?.getAttribute('blockInfo'));
        if (!json) return false;
        const inputs = new Map(blockArgs(json).map(arg => [arg.name, arg.type]));
        return Array.from(block.children).every(child => {
            if (child.localName === 'next') return Object.hasOwn(json, 'nextStatement');
            if (child.localName === 'value') return inputs.get(child.getAttribute('name')) === 'input_value';
            if (child.localName === 'statement') return inputs.get(child.getAttribute('name')) === 'input_statement';
            return true;
        });
    }

    function registerDynamic(type: string) {
        if (dynamicTypes.has(type) || Object.hasOwn(blocks.Blocks, type)) return;
        blocks.Blocks[type] = {
            init() {},
            domToMutation(mutation: Element) {
                const json = shape(type, mutation.getAttribute('blockInfo'));
                if (!json) throw new Error(`Unsupported dynamic block: ${type}`);
                this.jsonInit(json);
                this.plusExtensionMutation = mutation.cloneNode(true);
            },
            mutationToDom() {
                return this.plusExtensionMutation?.cloneNode(true) ?? null;
            }
        };
        installed.add(type);
        dynamicTypes.add(type);
    }

    return {
        update({definitions, categories, dynamicDefaults}: CodeExtensions) {
            for (const type of installed) delete blocks.Blocks[type];
            installed.clear();
            dynamicTypes.clear();
            defaults.clear();
            for (const json of definitions) {
                if (Object.hasOwn(blocks.Blocks, json.type) || !canInstall(json)) continue;
                blocks.defineBlocksWithJsonArray([json]);
                installed.add(json.type);
            }
            for (const {mutation, json} of dynamicDefaults) {
                if (!canInstall(json)) continue;
                defaults.set(shapeKey(json.type, mutation), json);
                registerDynamic(json.type);
            }
            return categories.map(({xml}) => {
                let category: Element;
                try {
                    category = blocks.Xml.textToDom(`<xml>${xml}</xml>`).firstElementChild;
                } catch {
                    return '';
                }
                if (category?.localName !== 'category') return '';
                if (!safeImage(category.getAttribute('iconURI'))) category.removeAttribute('iconURI');
                category.removeAttribute('showStatusButton');
                for (const child of Array.from(category.children)) {
                    if ([child, ...child.querySelectorAll('*')].some(node => !paletteTags.has(node.localName) ||
                        (node.matches('block, shadow') && !supportsBlock(node)))) child.remove();
                }
                return category.querySelector('block') ? category.outerHTML : '';
            }).join('');
        },
        setDynamicShapes(next: DynamicShape[]) {
            shapes = new Map();
            for (const {mutation, json} of next) {
                if (!canInstall(json)) continue;
                shapes.set(shapeKey(json.type, mutation), json);
                registerDynamic(json.type);
            }
        },
        supports(xml: Element) {
            return Array.from(xml.querySelectorAll('block, shadow')).every(supportsBlock);
        }
    };
}
