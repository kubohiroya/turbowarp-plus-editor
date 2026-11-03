/**
 * The fixtures these tests share.
 *
 * Moved from the fork's `test/unit/block-editor/helpers.mjs`. The package under test is this
 * repository's; the VM, the DOM and the ScratchBlocks artifacts come from the pinned GUI, because
 * those are the ones the editor actually runs against.
 */

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {EditorRegistry} from '@kubohiroya/turbowarp-extension-data-editor';
import {createTurboWarpBlockEditorHost as createBlockEditorHost} from '@kubohiroya/turbowarp-extension-data-editor/turbowarp';

import {guiRequire, guiRoot} from '../extension-host/pinned-host.mjs';

import {JSDOM} from 'jsdom';

export const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/', runScripts: 'outside-only'
});
for (const name of ['window', 'document', 'DOMParser', 'XMLSerializer', 'Element', 'Node', 'navigator']) {
    Object.defineProperty(globalThis, name, {value: dom.window[name], configurable: true});
}
const require = guiRequire;
const root = pathToFileURL(path.join(guiRoot, 'node_modules/scratch-blocks/'));
// Load the exact browser artifacts consumed by scratch-gui's webpack shim.
const code = [
    'blockly_compressed_vertical.js', 'blocks_compressed.js', 'blocks_compressed_vertical.js',
    'msg/messages.js', 'msg/scratch_msgs.js'
].map(name => fs.readFileSync(new URL(name, root), 'utf8')).join('\n');
export const ScratchBlocks = new dom.window.Function(`${code}\nreturn Blockly;`).call(dom.window);
ScratchBlocks.ScratchMsgs.setLocale('en');
const VM = require('scratch-vm');
const Sprite = require('scratch-vm/src/sprites/sprite');

export const makeDefinition = (overrides = {}) => ({
    apiVersion: 1, extensionId: 'story', editorId: 'properties', opcodes: ['story_scene'],
    editableArguments: ['PROPERTIES', 'NAME'],
    read: snapshot => ({properties: snapshot.arguments.PROPERTIES.value, name: snapshot.arguments.NAME.value}),
    validate: () => [],
    createPatch: draft => [
        {argument: 'PROPERTIES', value: draft.properties}, {argument: 'NAME', value: draft.name}
    ],
    mount: () => () => {},
    ...overrides
});

ScratchBlocks.Blocks.story_scene = {
    init() {
        this.jsonInit({
            message0: '%1 scene %2 name %3',
            args0: [
                {type: 'field_image', src: 'data:image/svg+xml,<svg/>', width: 40, height: 40},
                {type: 'input_value', name: 'PROPERTIES'}, {type: 'input_value', name: 'NAME'}
            ],
            inputsInline: true,
            previousStatement: null, nextStatement: null, colour: '#087f8c'
        });
    }
};

export function fixture(t, {definition = makeDefinition(), registry = new EditorRegistry(), xmlText,
    enableDescendants = false} = {}) {
    const unregisterDefinition = definition.saveContract === 'prepared-source-v1'
        ? registry.registerPrepared(definition) : registry.register(definition);
    const workspace = new ScratchBlocks.Workspace();
    // Headless workspaces have no procedure-return renderer to update.
    workspace.procedureReturnsWillChange = () => {};
    const vm = new VM();
    const target = new Sprite(null, vm.runtime).createClone();
    target.isStage = true;
    vm.runtime.targets.push(target);
    vm.setEditingTarget(target.id);
    workspace.addChangeListener(vm.blockListener);
    const xml = ScratchBlocks.Xml.textToDom(xmlText || '<xml><block type="story_scene" id="scene">' +
        '<value name="PROPERTIES"><shadow type="text" id="props"><field name="TEXT">{}</field></shadow></value>' +
        '<value name="NAME"><shadow type="text" id="name"><field name="TEXT">opening</field></shadow></value>' +
        '</block></xml>');
    ScratchBlocks.Xml.domToWorkspace(xml, workspace);
    ScratchBlocks.Events.fireNow_();
    workspace.clearUndo();
    let dirty = 0;
    vm.on('PROJECT_CHANGED', () => { dirty++; });
    const host = createBlockEditorHost({ScratchBlocks, workspace, vm, registry, enableDescendants});
    const reference = {targetId: target.id, blockId: 'scene'};
    const block = workspace.getBlockById('scene');
    t.after(() => {
        host.dispose();
        workspace.removeChangeListener(vm.blockListener);
        workspace.dispose();
        ScratchBlocks.Events.fireNow_();
        vm.quit();
    });
    return {
        host, reference, registry, workspace, vm, target, block, unregisterDefinition,
        open: () => registry.open(reference, host),
        dirty: () => dirty,
        field: id => workspace.getBlockById(id).getField('TEXT'),
        vmValue: id => target.blocks.getBlock(id).fields.TEXT.value
    };
}
