import type {ProgrammaticExtensionField} from './programmatic-extension-field.ts';

type FieldEditor = {type: 'field_input' | 'turbowarp_plus_actions' | 'native_widget'} | {type: 'field_dropdown'; options: [string, string][]};
type NativeFactory = {fromJson(options: unknown): unknown};
export type CustomField = {name: string; editor: FieldEditor};

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

export function registerCustomFields(blocks, declarations: CustomField[], openCustomEditor?, getNative?: (name: string) => NativeFactory) {
    const registry = blocks.Field?.TYPE_MAP_;
    const registered = new Map();
    if (registry) {
        for (const {name, editor} of declarations) {
            if (Object.hasOwn(registry, name)) continue;
            const factory = {
                fromJson(options: unknown) {
                    const native = getNative?.(name);
                    if (native) return native.fromJson(options);
                    if (editor.type !== 'field_dropdown') {
                        const field = new blocks.FieldTextInput('');
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
