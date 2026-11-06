type BlockDefinition = {type: string; [key: string]: unknown};
type Category = {id: string; xml: string};
export type CodeExtensions = {definitions: BlockDefinition[]; categories: Category[]};

const safeImage = (source: unknown): source is string =>
    typeof source === 'string' && /^(?:data:image\/|media:\/\/)/i.test(source);

function menuOptions(options: unknown) {
    const valid = Array.isArray(options) ? options.filter(pair => Array.isArray(pair) && pair.length === 2 &&
        (typeof pair[0] === 'string' || safeImage(pair[0]?.src)) && typeof pair[1] === 'string') : [];
    return valid.length ? valid : [['', '']];
}

// getBlocksJSON omits menu shadows and does not distinguish dynamic shapes.
export function getCodeExtensions(runtime, target): CodeExtensions {
    const definitions: BlockDefinition[] = [];
    for (const category of runtime._blockInfo ?? []) {
        for (const entry of [...(category.menus ?? []), ...(category.blocks ?? [])]) {
            const json = entry.json;
            if (!json?.type?.startsWith(`${category.id}_`) || entry.info?.isDynamic) continue;
            definitions.push(JSON.parse(JSON.stringify(json, (key, value) => {
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
            })));
        }
    }
    let categories: Category[] = [];
    try {
        categories = runtime.getBlocksXML?.(target) ?? [];
    } catch {
        // Invalid palette metadata must not prevent existing blocks from loading.
    }
    return {definitions, categories};
}

const paletteTags = new Set(['block', 'shadow', 'field', 'value', 'statement', 'next', 'mutation', 'sep']);

export function createCodeExtensionPalette(blocks) {
    const installed = new Set<string>();
    return {
        update({definitions, categories}: CodeExtensions) {
            for (const type of installed) delete blocks.Blocks[type];
            installed.clear();
            for (const json of definitions) {
                if (Object.hasOwn(blocks.Blocks, json.type)) continue;
                const customFieldPrefix = `field_${json.type.split('_')[0]}_`;
                const registry = blocks.Field?.TYPE_MAP_;
                const mixins = blocks.Extensions?.ALL_;
                const fields = Object.entries(json).filter(([key]) => /^args\d+$/.test(key))
                    .flatMap(([, args]) => Array.isArray(args) ? args : []);
                if (fields.some(field => typeof field?.type !== 'string' || (field.type.startsWith('field_') &&
                    (registry ? !Object.hasOwn(registry, field.type) : field.type.startsWith(customFieldPrefix))))) continue;
                const extensions = Array.isArray(json.extensions) ? json.extensions : [json.extensions].filter(Boolean);
                if (mixins && [...extensions, json.mutator].filter(Boolean).some(name => !Object.hasOwn(mixins, name))) continue;
                blocks.defineBlocksWithJsonArray([json]);
                installed.add(json.type);
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
                        (node.matches('block, shadow') && !Object.hasOwn(blocks.Blocks, node.getAttribute('type'))))) child.remove();
                }
                return category.querySelector('block') ? category.outerHTML : '';
            }).join('');
        },
        supports(xml: Element) {
            return Array.from(xml.querySelectorAll('block, shadow')).every(block =>
                Object.hasOwn(blocks.Blocks, block.getAttribute('type')));
        }
    };
}
