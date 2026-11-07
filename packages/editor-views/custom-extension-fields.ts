import {attachNativeFieldGraphic, type NativeFieldGraphic} from './native-field-svg.ts';
import type {ProgrammaticExtensionField} from './programmatic-extension-field.ts';

type FieldEditor = {type: 'field_input' | 'turbowarp_plus_actions' | 'native_widget'} | {type: 'field_dropdown'; options: [string, string][]};
type NativeFactory = {fromJson(options: unknown): unknown; parentDocument?: boolean; resources?: unknown;
    asyncCommit?: boolean; isolatedEditor?: boolean; attachedEditor?: boolean};
export type CustomField = {name: string; editor: FieldEditor};
const isolatedFactory = Symbol.for('turbowarp-plus-editor.isolated-native-field');
const reserveAttached = Symbol.for('turbowarp-plus-editor.reserve-attached-native-field');
const nativeEditor = Symbol.for('turbowarp-plus-editor.native-field-editor');
const nativeInstances = new WeakMap<object, 'docked' | 'isolated' | 'reserved'>();

function cloneOptions(options: unknown) {
    try {
        return structuredClone(options);
    } catch {
        // Preserve the docked factory for extensions whose options cannot be copied.
    }
}

export function createIsolatedNativeField(field, native: NativeFactory) {
    return field?.[isolatedFactory]?.(native);
}

export const usesAttachedNativeEditor = (native: NativeFactory) =>
    native.parentDocument === true && native.attachedEditor === true && native.isolatedEditor !== true;

export function reserveAttachedNativeField(field, native: NativeFactory) {
    return Boolean(field?.sourceBlock_) && field[reserveAttached]?.(native) === true;
}

export function getNativeFieldEditor(field) {
    const show = field?.[nativeEditor] ?? field?.showEditor_;
    return typeof show === 'function' ? show.bind(field) : undefined;
}

function readEditor(implementation): FieldEditor | undefined {
    if (implementation?.type === 'turbowarp_plus_actions' &&
        typeof implementation.getEditor === 'function' && typeof implementation.applyAction === 'function') {
        return {type: 'turbowarp_plus_actions'};
    }
    if (implementation?.type === 'field_input') return {type: 'field_input'};
    if (implementation?.type !== 'field_dropdown') {
        if (typeof implementation?.fromJson === 'function') return {type: 'native_widget'};
        return;
    }
    if (!Array.isArray(implementation.options) || !implementation.options.length) return;
    const options: [string, string][] = [];
    for (const option of implementation.options) {
        if (!Array.isArray(option) || option.length !== 2 ||
            typeof option[0] !== 'string' || typeof option[1] !== 'string') return;
        options.push([option[0], option[1]]);
    }
    return {type: 'field_dropdown', options};
}

export function getCustomFields(category) {
    const fields: {declaration: CustomField; definition: {type: string; [key: string]: unknown};
        programmatic?: ProgrammaticExtensionField; native?: NativeFactory}[] = [];
    for (const {extendedName, fieldImplementation, scratchBlocksDefinition} of Object.values(category.customFieldTypes ?? {}) as {
        extendedName: string; fieldImplementation: unknown; scratchBlocksDefinition?: {json: {type: string}}
    }[]) {
        if (!extendedName?.startsWith(`${category.id}_`) || scratchBlocksDefinition?.json?.type !== extendedName) continue;
        const editor = readEditor(fieldImplementation);
        if (editor) fields.push({
            declaration: {name: `field_${extendedName}`, editor}, definition: scratchBlocksDefinition.json,
            programmatic: editor.type === 'turbowarp_plus_actions' ? fieldImplementation as ProgrammaticExtensionField : undefined,
            native: editor.type === 'native_widget' ? fieldImplementation as NativeFactory : undefined
        });
    }
    return fields;
}

export function customField(runtime, opcode: string, name: string) {
    if (typeof opcode !== 'string' || name !== `field_${opcode}`) return;
    const category = runtime._blockInfo?.find(category => opcode.startsWith(`${category.id}_`));
    return category && getCustomFields(category).find(field => field.definition.type === opcode);
}

export const programmaticField = (runtime, opcode: string, name: string) => customField(runtime, opcode, name)?.programmatic;

export function registerCustomFields(blocks, declarations: CustomField[], openCustomEditor?, getNative?: (name: string) => NativeFactory,
    getGraphic?: (blockId: string, name: string, value: string) => NativeFieldGraphic | undefined,
    openDockedNative?: (field, name: string) => void) {
    const registry = blocks.Field?.TYPE_MAP_;
    const registered = new Map();
    if (registry) {
        for (const {name, editor} of declarations) {
            if (Object.hasOwn(registry, name)) continue;
            const factory = {
                fromJson(options: unknown) {
                    const native = getNative?.(name);
                    if (native) {
                        const snapshot = native.parentDocument === true && native.isolatedEditor === true ?
                            cloneOptions(options) : undefined;
                        const field = native.fromJson(options);
                        if (!field || typeof field !== 'object') return field;
                        const previous = nativeInstances.get(field);
                        if (previous && previous !== 'docked') return;
                        nativeInstances.set(field, 'docked');
                        if (usesAttachedNativeEditor(native) && Object.isExtensible(field)) {
                            Object.defineProperty(field, reserveAttached, {configurable: true, value: (current: NativeFactory) => {
                                if (!usesAttachedNativeEditor(current) || nativeInstances.get(field) !== 'docked') return false;
                                // An outstanding callback can keep this exact object after the editor closes.
                                nativeInstances.set(field, 'reserved');
                                return true;
                            }});
                            if (openDockedNative && 'showEditor_' in field && typeof field.showEditor_ === 'function') {
                                if (!Object.hasOwn(field, nativeEditor)) {
                                    Object.defineProperty(field, nativeEditor, {value: field.showEditor_});
                                }
                                field.showEditor_ = () => openDockedNative(field, name);
                            }
                        }
                        if (snapshot !== undefined && Object.isExtensible(field)) {
                            Object.defineProperty(field, isolatedFactory, {configurable: true, value: (current: NativeFactory) => {
                                if (current.parentDocument !== true || current.isolatedEditor !== true) return;
                                const editor = current.fromJson(structuredClone(snapshot)) as {
                                    sourceBlock_?: unknown; setValue(value: unknown): void;
                                    getValue(): unknown; showEditor_(): void;
                                };
                                if (!editor || typeof editor !== 'object' || editor.sourceBlock_ || nativeInstances.has(editor) ||
                                    typeof editor.showEditor_ !== 'function' || typeof editor.getValue !== 'function' ||
                                    typeof editor.setValue !== 'function') return;
                                nativeInstances.set(editor, 'isolated');
                                return editor;
                            }});
                        }
                        return field;
                    }
                    if (editor.type !== 'field_dropdown') {
                        const field = new blocks.FieldTextInput('');
                        if (editor.type === 'native_widget' && getGraphic) {
                            attachNativeFieldGraphic(field, (blockId, value) => getGraphic(blockId, name, value));
                        }
                        if (editor.type !== 'field_input') {
                            field.showEditor_ = () => openCustomEditor?.(field, name);
                        }
                        return field;
                    }
                    // The native dropdown preserves a saved value even if it leaves the option list.
                    return new blocks.FieldDropdown(editor.options.map(([label, value]) => [label, value]));
                }
            };
            blocks.Field.register(name, factory);
            registered.set(name, factory);
        }
    }
    return () => {
        for (const [name, factory] of registered) {
            if (registry[name] === factory) delete registry[name];
        }
    };
}
