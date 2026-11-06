declare const TW_TEST_NATIVE_SVG: boolean;
declare const TW_TEST_PARENT_DOCUMENT: boolean;
declare const TW_TEST_NATIVE_CSS: boolean;
declare const TW_TEST_PSEUDO_CSS: boolean;

declare const Scratch: {
    BlockType: {REPORTER: string};
    extensions: {register(extension: {getInfo(): object; display(args: {NOTE: string; MODE: string}): string}): void};
};

const parentWindow = window as Window & {
    vm?: unknown;
    ScratchBlocks?: {
        FieldTextInput: new (value: string) => {
            getValue(): string;
            setValue(value: string): void;
            getSvgRoot(): SVGGElement;
            render_(): void;
            showEditor_(): void;
        };
        WidgetDiv: {DIV: HTMLDivElement; show(owner: unknown, rtl: boolean, dispose?: () => void): void; hide(): void};
    };
};

if (TW_TEST_NATIVE_CSS && !document.getElementById('tw-test-native-field-css')) {
    const sheet = document.createElement('style');
    sheet.id = 'tw-test-native-field-css';
    sheet.textContent = `
        .tw-test-caption-widget {
            background-color: #edf6ff;
            padding: 9px;
        }
        .tw-test-caption-input {
            color: #13304b;
            background-color: #fff8e1;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/%3E");
            border: 3px solid #166534;
            padding-left: 11px;
            font-size: 15px;
        }
        .tw-test-caption-apply {
            color: #fff;
            background-color: #7c2d12;
        }
        .tw-test-caption-original { fill: #15803d; }
        .tw-test-caption-edited { fill: #c2410c; }
        .tw-test-caption-docked { fill: #1d4ed8; }
    `;
    if (TW_TEST_PSEUDO_CSS) sheet.textContent += `
        .tw-test-caption-widget::before {
            content: "Caption hint";
            color: #1e40af;
            font-weight: 700;
        }
        .tw-test-caption-input:focus {
            border-color: #9333ea;
        }
        .tw-test-caption-input:focus-visible {
            background-color: #dcfce7;
        }
        .tw-test-caption-apply::after {
            content: " ready";
            color: #fef3c7;
        }
        .tw-test-caption-apply:hover {
            background-color: #9a3412;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E");
        }
        .tw-test-caption-apply:hover::after {
            content: " now";
            color: #ffffff;
        }
        .tw-test-caption-apply::before {
            content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E");
        }
    `;
    document.head.append(sheet);
}

Scratch.extensions.register({
    getInfo() {
        return {
            id: 'windowfields', name: 'Window fields',
            customFieldTypes: {
                caption: {output: 'String', outputShape: 2, implementation: {
                    parentDocument: TW_TEST_PARENT_DOCUMENT,
                    fromJson(options: {name: string}) {
                        if (options.name !== 'field_windowfields_caption' || !parentWindow.vm || !parentWindow.ScratchBlocks) {
                            throw new Error('Wrong field context');
                        }
                        const {FieldTextInput, WidgetDiv} = parentWindow.ScratchBlocks;
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
                                if (TW_TEST_NATIVE_CSS) {
                                    const state = value === 'original' ? 'original' : value === 'edited after dock' ? 'docked' : 'edited';
                                    marker.setAttribute('class', `tw-test-caption-${state}`);
                                } else {
                                    const color = value === 'original' ? '#15803d' :
                                        value === 'edited after dock' ? '#1d4ed8' : '#c2410c';
                                    marker.setAttribute('fill', color);
                                }
                                if (marker.parentNode !== root) root.append(marker);
                            };
                        }
                        field.showEditor_ = () => {
                            const group = document.createElement('fieldset');
                            const heading = document.createElement('legend');
                            heading.textContent = 'Native caption editor';
                            const input = document.createElement('textarea');
                            input.setAttribute('aria-label', 'Caption');
                            input.value = field.getValue();
                            const apply = document.createElement('button');
                            apply.type = 'button';
                            apply.textContent = 'Apply caption';
                            if (TW_TEST_NATIVE_CSS) {
                                group.className = 'tw-test-caption-widget';
                                input.className = 'tw-test-caption-input';
                                apply.className = 'tw-test-caption-apply';
                            }
                            const commit = (value: string) => {
                                if (!parentWindow.vm) throw new Error('Missing parent VM');
                                field.setValue(value);
                                WidgetDiv.hide();
                            };
                            if (TW_TEST_PARENT_DOCUMENT) {
                                if (WidgetDiv.DIV.ownerDocument !== document) throw new Error('The widget left its parent document');
                                group.dataset.twParentDocumentCaption = '';
                                let pendingValue = input.value;
                                const onInput = (event: Event) => {
                                    if (event.target !== input) return;
                                    if (input.ownerDocument !== document) throw new Error('The input left its parent document');
                                    pendingValue = input.value;
                                    group.dataset.parentInput = pendingValue;
                                };
                                const onClick = (event: Event) => {
                                    if (event.target !== apply) return;
                                    if (apply.ownerDocument !== document) throw new Error('The button left its parent document');
                                    commit(pendingValue);
                                };
                                WidgetDiv.show(field, false, () => {
                                    document.removeEventListener('input', onInput);
                                    document.removeEventListener('click', onClick);
                                });
                                document.addEventListener('input', onInput);
                                document.addEventListener('click', onClick);
                            } else {
                                WidgetDiv.show(field, false);
                                apply.addEventListener('click', () => commit(input.value));
                            }
                            group.append(heading, input, apply);
                            if (TW_TEST_PARENT_DOCUMENT) {
                                const link = document.createElement('a');
                                link.href = '#parent-only';
                                link.textContent = 'Parent-only link';
                                group.append(link);
                            }
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
