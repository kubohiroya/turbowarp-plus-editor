declare const TW_TEST_NATIVE_SVG: boolean;

declare const Scratch: {
    BlockType: {REPORTER: string};
    extensions: {register(extension: {getInfo(): object; display(args: {NOTE: string; MODE: string}): string}): void};
};

const parent = window as Window & {
    vm?: unknown;
    ScratchBlocks?: {
        FieldTextInput: new (value: string) => {
            getValue(): string;
            setValue(value: string): void;
            getSvgRoot(): SVGGElement;
            render_(): void;
            showEditor_(): void;
        };
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
                        if (options.name !== 'field_windowfields_caption' || !parent.vm || !parent.ScratchBlocks) {
                            throw new Error('Wrong field context');
                        }
                        const {FieldTextInput, WidgetDiv} = parent.ScratchBlocks;
                        const field = new FieldTextInput('');
                        if (TW_TEST_NATIVE_SVG) {
                            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                            marker.setAttribute('cx', '5');
                            marker.setAttribute('cy', '8');
                            marker.setAttribute('r', '3');
                            const render = field.render_;
                            field.render_ = () => {
                                render.call(field);
                                const root = field.getSvgRoot();
                                if (!root) return;
                                const value = field.getValue();
                                const color = value === 'original' ? '#15803d' :
                                    value === 'edited after dock' ? '#1d4ed8' : '#c2410c';
                                marker.setAttribute('fill', color);
                                if (marker.parentNode !== root) root.append(marker);
                            };
                        }
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
