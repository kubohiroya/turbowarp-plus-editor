declare const Scratch: {
    BlockType: {REPORTER: string};
    extensions: {register(extension: {getInfo(): object; display(args: {NOTE: string; MODE: string}): string}): void};
};

const parent = window as Window & {
    vm: unknown;
    ScratchBlocks: {
        FieldTextInput: new (value: string) => {getValue(): string; setValue(value: string): void; showEditor_(): void};
        WidgetDiv: {DIV: HTMLDivElement; show(owner: unknown, rtl: boolean): void; hide(): void};
    };
};

Scratch.extensions.register({
    getInfo() {
        return {
            id: 'windowfields', name: 'Window fields',
            customFieldTypes: {
                caption: {output: 'String', outputShape: 2, implementation: {
                    fromJson(options: {name: string}) {
                        if (options.name !== 'field_windowfields_caption' || !parent.vm) throw new Error('Wrong field context');
                        const {FieldTextInput, WidgetDiv} = parent.ScratchBlocks;
                        const field = new FieldTextInput('');
                        field.showEditor_ = () => {
                            WidgetDiv.show(field, false);
                            const group = document.createElement('fieldset');
                            const heading = document.createElement('legend');
                            heading.textContent = 'Native caption editor';
                            const input = document.createElement('textarea');
                            input.setAttribute('aria-label', 'Caption');
                            input.value = field.getValue();
                            const apply = document.createElement('button');
                            apply.textContent = 'Apply caption';
                            apply.addEventListener('click', () => {
                                if (!parent.vm) throw new Error('Missing parent VM');
                                field.setValue(input.value);
                                WidgetDiv.hide();
                            });
                            group.append(heading, input, apply);
                            WidgetDiv.DIV.append(group);
                        };
                        return field;
                    }
                }},
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
