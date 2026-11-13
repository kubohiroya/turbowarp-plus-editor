import type {NativeFieldGraphic} from './native-field-svg.ts';
import {customField, getCustomFields, programmaticField, registerCustomFields, reserveAttachedNativeField, type CustomField} from './custom-extension-fields.ts';
import {openNativeField} from './native-extension-field.ts';

import {createFieldActionDialog, readFieldActionPanel, runFieldAction} from './programmatic-extension-field.ts';
export {createFieldActionDialog} from './programmatic-extension-field.ts';

type BlockDefinition = {type: string; [key: string]: unknown};
type Category = {id: string; xml: string};
type DynamicShape = {mutation: string; json: BlockDefinition};
export type CodeExtensions = {definitions: BlockDefinition[]; categories: Category[]; dynamicDefaults: DynamicShape[]; customFields: CustomField[]};

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

const dynamicTypes = new Set(['command', 'reporter', 'Boolean', 'hat', 'event']);
const isBranched = info => (info?.blockType === 'conditional' || info?.blockType === 'loop') &&
    [undefined, 0, 1, 2].includes(info.branchCount) && (typeof info.text === 'string' ||
        Array.isArray(info.text) && info.text.length > 0 && info.text.every(line => typeof line === 'string'));
const supportsDynamicInfo = info => isBranched(info) || (dynamicTypes.has(info?.blockType) &&
    typeof info.text === 'string' && !info.branchCount);

function convertDynamicShape(runtime, category, opcode: string, info) {
    return runtime._convertBlockForScratchBlocks({...info, opcode, isDynamic: true}, category).json;
}

export function attachDockedCodeExtensions({vm, ScratchBlocks, document, locale, onError: onFieldError = (_error: unknown) => {}}) {
    const {runtime} = vm;
    const definitions = ScratchBlocks.Blocks;
    const installed = new Map();
    const fieldRegistrations = new Map<string, () => void>();
    let disposed = false;
    const dialog = document && createFieldActionDialog(document);
    let fieldRequest = 0;
    let closeNativeEditor: (() => void) | undefined;
    const invalidateFieldAction = () => {
        fieldRequest++;
        const close = closeNativeEditor;
        closeNativeEditor = undefined;
        close?.();
    };

    function openDockedNative(field, name: string) {
        const block = field.sourceBlock_;
        if (!document || disposed || !block || block.isInFlyout) return;
        invalidateFieldAction();
        const request = fieldRequest;
        const target = runtime.getEditingTarget();
        const workspace = block.workspace;
        const vmBlock = target?.blocks.getBlock(block.id);
        const value = vmBlock?.fields?.[name]?.value;
        const native = customField(runtime, block.type, name)?.native;
        if (!native || typeof value !== 'string' || field.getValue() !== value) return;
        const sameTarget = () => vm.editingTarget === target && runtime.getEditingTarget() === target &&
            runtime.getTargetById(target.id) === target;
        const stillInstalled = () => sameTarget() && field.sourceBlock_ === block &&
            workspace.getBlockById(block.id)?.getField(name) === field;
        const current = () => !disposed && request === fieldRequest && stillInstalled() && document.hasFocus() &&
            !workspace.getParentSvg().parentElement.inert && target.blocks.getBlock(block.id) === vmBlock &&
            vmBlock.fields[name]?.value === value && customField(runtime, block.type, name)?.native === native;
        if (!current() || !reserveAttachedNativeField(field, native)) return;
        const setValue = field.setValue.bind(field);
        closeNativeEditor = openNativeField({
            blocks: ScratchBlocks, field, document, parentDocument: true, asyncCommit: native.asyncCommit === true,
            valid: current,
            commit(next) {
                // Deliver the normal Blockly change before replacing the retired field.
                setValue(next);
                ScratchBlocks.Events.fireNow_();
            },
            onAttachedClose() {
                queueMicrotask(() => {
                    if (!stillInstalled()) return;
                    ScratchBlocks.Events.fireNow_();
                    if (!stillInstalled()) return;
                    // The GUI clears the workspace history on refresh, even for the same target.
                    const undo = workspace.undoStack_.slice();
                    const redo = workspace.redoStack_.slice();
                    ScratchBlocks.Events.disable();
                    try {
                        vm.refreshWorkspace();
                    } finally {
                        if (sameTarget()) {
                            workspace.undoStack_ = undo;
                            workspace.redoStack_ = redo;
                        }
                        ScratchBlocks.Events.enable();
                    }
                });
            },
            onError: onFieldError
        });
    }

    function openProgrammatic(field, name: string) {
        const block = field.sourceBlock_;
        if (!dialog || disposed || !block || block.isInFlyout) return;
        const editor = programmaticField(runtime, block.type, name);
        if (!editor) return;
        const request = ++fieldRequest;
        const target = runtime.getEditingTarget();
        try {
            const value = field.getValue();
            const panel = readFieldActionPanel(editor, value);
            const current = () => !disposed && request === fieldRequest && field.sourceBlock_ === block &&
                field.getValue() === value && runtime.getEditingTarget() === target && document.hasFocus() &&
                !block.workspace?.getParentSvg?.()?.parentElement?.inert &&
                programmaticField(runtime, block.type, name) === editor;
            if (panel) dialog.show(panel, action => {
                if (!current()) return;
                runFieldAction(editor, value, action, next => {
                    if (current() && typeof next === 'string') field.setValue(next);
                }, error => {
                    if (current()) onFieldError(error);
                });
            }, locale);
        } catch (error) {
            onFieldError(error);
        }
    }

    function install(category) {
        fieldRegistrations.get(category.id)?.();
        const fields = getCustomFields(category);
        if (fields.length) {
            fieldRegistrations.set(category.id, registerCustomFields(ScratchBlocks, fields.map(({declaration}) => declaration), openProgrammatic,
                name => fields.find(field => field.declaration.name === name)?.native, undefined, openDockedNative));
        } else fieldRegistrations.delete(category.id);

        for (const entry of category.blocks ?? []) {
            if (!entry.info?.isDynamic) continue;
            const type = entry.json?.type;
            const native = definitions[type];
            if (!native?.domToMutation || installed.get(type)?.replacement === native) continue;
            const mutations = new WeakMap();
            const replacement = {...native,
                domToMutation(mutation: Element) {
                    let info;
                    let json;
                    try {
                        info = JSON.parse(mutation.getAttribute('blockInfo'));
                        if (isBranched(info)) {
                            json = convertDynamicShape(runtime, category, entry.info.opcode, info);
                        }
                    } catch {
                        // Leave invalid metadata to the native definition.
                    }
                    if (!json) return native.domToMutation.call(this, mutation);
                    // Native init supplies the docked theme. Apply the VM's layout and connections.
                    const {colour, colourSecondary, colourTertiary, extensions, ...layout} = json;
                    this.jsonInit(layout);
                    if (info.color1 || info.color2 || info.color3) this.setColour(info.color1, info.color2, info.color3);
                    mutations.set(this, mutation.cloneNode(true));
                },
                mutationToDom() {
                    return mutations.get(this)?.cloneNode(true) ?? native.mutationToDom.call(this);
                }
            };
            definitions[type] = replacement;
            installed.set(type, {native, replacement});
        }
    }

    // The docked GUI registers its factory first and also replays existing categories on mount.
    vm.on('EXTENSION_ADDED', install);
    vm.on('BLOCKSINFO_UPDATE', install);
    vm.on('workspaceUpdate', invalidateFieldAction);
    document?.defaultView?.addEventListener('blur', invalidateFieldAction);
    queueMicrotask(() => {
        if (!disposed) for (const category of runtime._blockInfo ?? []) install(category);
    });

    return {dispose() {
        disposed = true;
        invalidateFieldAction();
        dialog?.close();
        vm.removeListener('EXTENSION_ADDED', install);
        vm.removeListener('BLOCKSINFO_UPDATE', install);
        vm.removeListener('workspaceUpdate', invalidateFieldAction);
        document?.defaultView?.removeEventListener('blur', invalidateFieldAction);
        for (const unregister of fieldRegistrations.values()) unregister();
        for (const [type, {native, replacement}] of installed) {
            if (definitions[type] === replacement) definitions[type] = native;
        }
    }};
}

// getBlocksJSON omits menu shadows and does not distinguish dynamic shapes.
export function getCodeExtensions(runtime, target): CodeExtensions {
    const definitions: BlockDefinition[] = [];
    const dynamicDefaults: DynamicShape[] = [];
    const customFields: CustomField[] = [];
    for (const category of runtime._blockInfo ?? []) {
        for (const {declaration, definition} of getCustomFields(category)) {
            customFields.push(declaration);
            definitions.push(projectDefinition(definition, runtime, target));
        }
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
        // Add-ons can attach methods to the palette array. Send only data across the message port.
        categories = Array.from(runtime.getBlocksXML?.(target) ?? [], ({id, xml}: Category) => ({id, xml}));
    } catch {
        // Invalid palette metadata must not prevent existing blocks from loading.
    }
    return {definitions, categories, dynamicDefaults, customFields};
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
            const json = convertDynamicShape(runtime, registration.category, registration.opcode, info);
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

export function createCodeExtensionPalette(blocks, openProgrammatic?) {
    const installed = new Set<string>();
    const dynamicTypes = new Set<string>();
    const defaults = new Map<string, BlockDefinition>();
    let shapes = new Map<string, BlockDefinition>();
    let unregisterFields: (() => void) | undefined;
    let nativeGraphics = new Map<string, Map<string, NativeFieldGraphic>>();

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
            const inputType = inputs.get(child.getAttribute('name'));
            // VM workspace XML uses <value> for statement inputs as well.
            if (child.localName === 'value') return inputType === 'input_value' || inputType === 'input_statement';
            if (child.localName === 'statement') return inputType === 'input_statement';
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
        update({definitions, categories, dynamicDefaults, customFields}: CodeExtensions) {
            unregisterFields?.();
            unregisterFields = registerCustomFields(blocks, customFields, openProgrammatic, undefined, (blockId, name, value) => {
                const graphic = nativeGraphics.get(blockId)?.get(name);
                return graphic?.value === value ? graphic : undefined;
            });
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
        setNativeFieldGraphics(graphics: NativeFieldGraphic[]) {
            nativeGraphics = new Map();
            for (const graphic of graphics) {
                if (!nativeGraphics.has(graphic.blockId)) nativeGraphics.set(graphic.blockId, new Map());
                nativeGraphics.get(graphic.blockId).set(graphic.name, graphic);
            }
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
