import type {ProgrammaticExtensionField} from '../../../packages/editor-views/index.ts';

declare const TW_TEST_PROGRAMMATIC_PROMISE: boolean;

declare const Scratch: {
    BlockType: {REPORTER: string};
    extensions: {register(extension: {getInfo(): object; display(args: {NOTE: string; MODE: string}): string}): void};
};

const editor: ProgrammaticExtensionField = {
    type: 'turbowarp_plus_actions',
    getEditor(value) {
        const action = value === 'original' ? {id: 'revise', label: 'Revise caption'} : {id: 'restore', label: 'Restore caption'};
        return {title: `Caption: ${value}`, actions: [action]};
    },
    applyAction(value, actionId) {
        if (typeof TW_TEST_PROGRAMMATIC_PROMISE !== 'undefined' && TW_TEST_PROGRAMMATIC_PROMISE) {
            if (!window.vm) throw new Error('Expected the parent VM');
            return new Promise<string | undefined>((resolve, reject) => {
                (window['testProgrammaticJobs'] ??= []).push({resolve, reject, value, actionId});
            });
        }
        if (value === 'original' && actionId === 'revise') return '改訂 <&> note';
        if (value !== 'original' && actionId === 'restore') return 'original';
    }
};

Scratch.extensions.register({
    getInfo() {
        return {
            id: 'windowfields', name: 'Window fields',
            customFieldTypes: {
                caption: {output: 'String', outputShape: 2, implementation: editor},
                setting: {output: 'String', outputShape: 2, implementation: {
                    type: 'field_dropdown', options: [['First label', 'first-id'], ['Second label', 'second-id']]
                }}
            },
            blocks: [{opcode: 'display', blockType: Scratch.BlockType.REPORTER, text: 'fixture [NOTE] [MODE]',
                arguments: {NOTE: {type: 'caption', defaultValue: 'original'}, MODE: {type: 'setting', defaultValue: 'first-id'}}}]
        };
    },
    display(args) {return args.NOTE + ':' + args.MODE;}
});
