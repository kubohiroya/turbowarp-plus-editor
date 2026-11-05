import assert from 'node:assert/strict';
import {test} from 'node:test';
import {bindBlockEditorIcon} from '@kubohiroya/turbowarp-extension-data-editor/turbowarp';

import {plusBlockEditor} from '../../site/block-editor/editor.ts';

import {guiRequire} from '../extension-host/pinned-host.ts';

import {JSDOM} from 'jsdom';

const {default: getBlockEditorService} = await import('../../site/gui-integration/lib/tw-block-editor-service.ts');

// The GUI keeps one service per VM and the strings for it; the service itself is this
// distribution's, so it is handed in the way the integration hands it in a real editor.
const integration = {blockEditor: plusBlockEditor};



test('pointer and keyboard activation use only the icon and release all listeners', () => {
    const dom = new JSDOM('<!doctype html><body><div id="block"><svg><g id="icon"></g></svg></div></body>');
    const element = dom.window.document.getElementById('icon');
    const block = dom.window.document.getElementById('block');
    let opens = 0;
    let blockStarts = 0;
    let allowed = true;
    block.addEventListener('mousedown', () => { blockStarts++; });
    const cleanup = bindBlockEditorIcon({element, label: 'Edit block', canOpen: () => allowed,
        onOpen: () => { opens++; }});
    const pointer = (type, x = 0, y = 0) => {
        const event = new dom.window.MouseEvent(type, {bubbles: true, cancelable: true, clientX: x, clientY: y});
        Object.defineProperty(event, 'pointerId', {value: 1});
        element.dispatchEvent(event);
    };
    pointer('pointerdown');
    element.dispatchEvent(new dom.window.MouseEvent('mousedown', {bubbles: true, cancelable: true}));
    pointer('pointerup');
    assert.equal(opens, 1);
    assert.equal(blockStarts, 0);
    pointer('pointerdown');
    pointer('pointermove', 20);
    pointer('pointerup');
    assert.equal(opens, 1);
    for (const key of ['Enter', ' ']) {
        element.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key, bubbles: true, cancelable: true}));
    }
    assert.equal(opens, 3);
    allowed = false;
    pointer('pointerdown'); pointer('pointerup');
    assert.equal(opens, 3);
    cleanup();
    assert.equal(element.hasAttribute('role'), false);
    assert.equal(element.hasAttribute('tabindex'), false);
    element.dispatchEvent(new dom.window.MouseEvent('mousedown', {bubbles: true}));
    assert.equal(blockStarts, 1);
});

test('one managed editor service is shared per VM, with registration and disposal notifications', () => {
    const vm = {};
    const service = getBlockEditorService(vm, undefined, integration);
    assert.equal(service, getBlockEditorService(vm, undefined, integration));
    assert.notEqual(service, getBlockEditorService({}, undefined, integration));
    let updates = 0;
    const stop = service.subscribe(() => { updates++; });
    const remove = service.api.register({
        apiVersion: 1, extensionId: 'demo', editorId: 'properties', opcodes: ['demo_scene'],
        editableArguments: ['PROPERTIES'], read: () => ({}), validate: () => [], createPatch: () => [],
        mount: () => () => {}
    });
    assert.ok(service.registry.resolve('demo_scene'));
    remove(); remove();
    assert.equal(service.registry.resolve('demo_scene'), undefined);
    assert.equal(updates, 2);
    stop();
});

test('schema-only registration supplies serialization and authoritative validation', async () => {
    const service = getBlockEditorService({}, undefined, integration);
    const remove = service.api.register({
        apiVersion: 1, extensionId: 'demo', editorId: 'schema', opcodes: ['demo_scene'],
        argument: 'PROPERTIES',
        schema: {type: 'object', properties: {duration: {type: 'number', minimum: 1}},
            required: ['duration'], additionalProperties: false}
    });
    let block = {targetId: 'sprite', blockId: 'scene', opcode: 'demo_scene', revision: '1',
        arguments: {PROPERTIES: {kind: 'literal', value: '{"duration":2}'}}};
    let commits = 0;
    const session = service.registry.open(block, {readBlock: () => block, commit: request => {
        commits++;
        block = {...block, arguments: {PROPERTIES: {kind: 'literal', value: request.changes[0].value}}};
    }});
    session.setDraft({data: {duration: 0}});
    assert.equal((await session.save()).status, 'invalid');
    assert.equal(commits, 0);
    session.setDraft({data: {duration: 4}});
    assert.equal((await session.save()).status, 'saved');
    assert.equal(commits, 1);
    assert.equal(block.arguments.PROPERTIES.value, '{"duration":4}');
    remove();
});
