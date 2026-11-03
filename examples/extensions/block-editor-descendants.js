(function (Scratch) {
    'use strict';

    if (!Scratch.extensions.unsandboxed) throw new Error('Load this managed example unsandboxed.');
    const icon = 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
        '<path fill="white" d="M4 4h14v12H4zm18 20h14v12H22zM4 24h14v12H4z"/>' +
        '<path fill="none" stroke="white" stroke-width="3" d="M11 16v5h18v3m-18-3v3"/></svg>'
    );
    if (Scratch.gui && Scratch.gui.blockEditors) {
        Scratch.gui.blockEditors.register({
            apiVersion: 1, extensionId: 'blockeditortree', editorId: 'properties',
            opcodes: ['blockeditortree_group', 'blockeditortree_item'], argument: 'PROPERTIES',
            schema: {
                type: 'object', properties: {
                    label: {type: 'string', title: '名前 / Label', minLength: 1},
                    amount: {type: 'integer', title: '数量 / Amount', minimum: 1}
                }, required: ['label', 'amount'], additionalProperties: false
            }
        });
    }
    class BlockEditorTreeDemo {
        getInfo () {
            return {
                id: 'blockeditortree', name: 'Block editor tree',
                color1: '#087f8c', color2: '#066c77', color3: '#055a64', blockIconURI: icon,
                blocks: [{
                    opcode: 'group', blockType: Scratch.BlockType.CONDITIONAL, branchCount: 2,
                    text: 'group [PROPERTIES]',
                    arguments: {PROPERTIES: {type: Scratch.ArgumentType.STRING,
                        defaultValue: '{"label":"Group","amount":1}'}}
                }, {
                    opcode: 'item', blockType: Scratch.BlockType.COMMAND, text: 'item [PROPERTIES]',
                    arguments: {PROPERTIES: {type: Scratch.ArgumentType.STRING,
                        defaultValue: '{"label":"Item","amount":1}'}}
                }]
            };
        }
        group (args, util) {
            util.startBranch(1, false);
        }
        item () {}
    }
    Scratch.extensions.register(new BlockEditorTreeDemo());
})(Scratch);
