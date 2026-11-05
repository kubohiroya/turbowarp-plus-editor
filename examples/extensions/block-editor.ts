(function (Scratch) {
    'use strict';

    if (!Scratch.extensions.unsandboxed) throw new Error('Load this managed example unsandboxed.');
    const icon = 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
        '<path fill="white" d="M8 8h24v24H8z"/><path fill="#087f8c" d="M13 13h14v3H13zm0 6h14v3H13zm0 6h9v3h-9z"/>' +
        '</svg>'
    );

    // Schema declarations use the standard RJSF editor; no mount/read/patch callbacks are needed.
    if (Scratch.gui && Scratch.gui.blockEditors) {
        Scratch.gui.blockEditors.register({
            apiVersion: 1,
            extensionId: 'blockeditordemo',
            editorId: 'properties',
            opcodes: ['blockeditordemo_scene'],
            argument: 'PROPERTIES',
            schema: {
                type: 'object',
                properties: {
                    label: {type: 'string', title: 'Scene label', minLength: 1},
                    duration: {type: 'number', title: 'Duration (seconds)', minimum: 1, maximum: 60}
                },
                required: ['label', 'duration'],
                additionalProperties: false
            },
            uiSchema: {'ui:order': ['label', 'duration']}
        });
    }

    class BlockEditorDemo {
        getInfo () {
            return {
                id: 'blockeditordemo', name: 'Block editor demo', color1: '#087f8c', blockIconURI: icon,
                blocks: [{
                    opcode: 'scene', blockType: Scratch.BlockType.COMMAND,
                    text: 'scene properties [PROPERTIES]',
                    arguments: {PROPERTIES: {
                        type: Scratch.ArgumentType.STRING,
                        defaultValue: '{"label":"Opening","duration":2}'
                    }}
                }]
            };
        }
        scene () {}
    }
    Scratch.extensions.register(new BlockEditorDemo());
})(Scratch);
