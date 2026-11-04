import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {test} from 'node:test';
import {createCodeSession} from '../index.js';

function fixture(receiveBackpackDrop) {
    const document = {defaultView: new EventTarget(), hasFocus: () => focused === document};
    let focused = document;
    const node = {inert: false};
    const nativeUndo = () => {};
    const workspace = {
        getParentSvg: () => ({parentElement: node}),
        undo: nativeUndo,
        hasUndoStack: () => false,
        hasRedoStack: () => false,
        cancelCurrentGesture() {},
        addChangeListener() {},
        removeChangeListener() {}
    };
    const makeTarget = id => {
        const blocks = {
            _blocks: {block: {x: 0}},
            _scripts: ['block'],
            getScripts() {return this._scripts;},
            toXML() {return '';},
            blocklyListen(event) {this._blocks.block.x = event.newCoordinate.x;},
            resetCache() {},
            emitProjectChanged() {}
        };
        return {id, isOriginal: true, blocks, variables: {}, comments: {}, getName: () => id};
    };
    const target = makeTarget('first');
    const other = makeTarget('other');
    const vm = Object.assign(new EventEmitter(), {
        editingTarget: target,
        runtime: {
            targets: [target, other],
            getTargetForStage: () => ({variables: {}}),
            getTargetById: id => [target, other].find(sprite => sprite.id === id),
            getEditingTarget: () => vm.editingTarget
        },
        setEditingTarget(id) {
            this.editingTarget = this.runtime.getTargetById(id);
            this.emit('targetsUpdate');
            this.emit('workspaceUpdate');
        }
    });
    const session = createCodeSession({
        vm, workspace, document, canUse: () => true, receiveBackpackDrop,
        ScratchBlocks: {hideChaff() {}, Events: {disable() {}, enable() {}, fireNow_() {}}}
    });
    function connect(sprite) {
        const child = {hasFocus: () => focused === child};
        const messages = [];
        const port = Object.assign(new EventTarget(), {start() {}, postMessage: message => messages.push(message)});
        const send = data => port.dispatchEvent(new MessageEvent('message', {data}));
        const close = session.attach({target: sprite, mount: {ownerDocument: child}, port, close: () => close()});
        return {messages, send, close, focus() {focused = child; send({type: 'focus'});}};
    }
    return {session, connect, target, other, vm, node, workspace, nativeUndo, focusParent() {
        focused = document;
        document.defaultView.dispatchEvent(new Event('focus'));
    }};
}

test('a focused window gets a lease after release and stale edits do not enter the shared history', () => {
    const {session, connect, target, other, workspace, nativeUndo, node, focusParent} = fixture();
    const a = connect(target);
    const b = connect(target);
    const last = view => view.messages.at(-1);
    const edit = (view, lease, targetId, x) => view.send({type: 'edits', lease, targetId,
        events: [{type: 'move', blockId: 'block', newCoordinate: {x, y: 0}}]});
    const x = () => target.blocks._blocks.block.x;

    a.focus();
    const aLease = last(a).lease;
    assert.ok(aLease && node.inert);
    edit(b, aLease, target.id, 123);
    assert.equal(x(), 0);
    edit(a, aLease, target.id, 20);
    assert.equal(x(), 20);
    assert.equal(last(b).type, 'update');

    b.focus();
    assert.equal(last(a).type, 'revoke');
    assert.equal(last(b).type, 'update');
    a.send({type: 'release', lease: aLease});
    const bLease = last(b).lease;
    assert.ok(bLease > aLease);
    edit(a, aLease, target.id, 300);
    edit(b, bLease, other.id, 400);
    assert.equal(x(), 20);
    assert.equal(other.blocks._blocks.block.x, 0);
    b.send({type: 'step', lease: bLease, targetId: target.id, redo: false});
    assert.equal(x(), 0);
    b.send({type: 'step', lease: bLease, targetId: target.id, redo: true});
    assert.equal(x(), 20);

    focusParent();
    b.send({type: 'release', lease: bLease});
    assert.equal(node.inert, false);
    workspace.undo(false);
    assert.equal(x(), 0);
    a.close();
    b.close();
    session.dispose();
    assert.equal(workspace.undo, nativeUndo);
});

test('target changes follow only the last active view and drain edits into the old history', () => {
    const {session, connect, target, other, vm, focusParent} = fixture();
    const a = connect(target);
    const b = connect(target);
    const last = view => view.messages.at(-1);
    const select = (view, lease, from, to) =>
        view.send({type: 'select-target', lease, targetId: from.id, nextTargetId: to.id});
    const edit = (view, lease, sprite, x) => view.send({type: 'edits', lease, targetId: sprite.id,
        events: [{type: 'move', blockId: 'block', newCoordinate: {x, y: 0}}]});

    b.focus();
    const oldLease = last(b).lease;
    select(a, oldLease, target, other);
    assert.equal(vm.editingTarget, target);
    select(b, oldLease, target, other);
    assert.equal(last(b).type, 'revoke');
    edit(b, oldLease, target, 21);
    b.send({type: 'release', lease: oldLease});
    assert.equal(vm.editingTarget, other);
    assert.equal(last(a).type, 'update');
    assert.equal(last(b).type, 'grant');
    assert.equal(last(b).canUndo, false);
    assert.equal(other.blocks._blocks.block.x, 0);

    const otherLease = last(b).lease;
    focusParent();
    vm.setEditingTarget(target.id);
    b.send({type: 'edits', lease: otherLease, targetId: other.id,
        events: [{type: 'change', blockId: 'block', element: 'field', name: 'VARIABLE', newValue: 'stale'}]});
    edit(b, otherLease, other, 35);
    b.send({type: 'release', lease: otherLease});
    assert.equal(last(b).targetId, target.id);
    assert.equal(last(b).canUndo, true);
    assert.equal(target.blocks._blocks.block.x, 21);
    assert.equal(other.blocks._blocks.block.x, 35);
    vm.setEditingTarget(other.id);
    assert.equal(last(b).targetId, other.id);
    assert.equal(last(b).canUndo, true);
    assert.equal(a.messages.some(message => message.targetId === other.id), false);
    session.dispose();
});

test('a background drop keeps its target while foreground edits drain', async () => {
    let drop;
    const {session, connect, target, other, vm, node} = fixture(request => {
        drop = request.commit(async () => {
            assert.equal(request.canUse(), true);
            assert.equal(request.target, target);
            assert.equal(vm.editingTarget, other);
            target.blocks._blocks.copied = {x: 40};
            target.blocks._scripts.push('copied');
            return true;
        });
    });
    const a = connect(target);
    const b = connect(other);
    b.focus();
    const lease = b.messages.at(-1).lease;
    const message = {type: 'backpack-drop', raw: 'reference', position: {x: 40, y: 50}};
    a.send({...message, targetId: other.id});
    assert.equal(drop, undefined);
    a.send({...message, targetId: target.id});
    assert.equal(b.messages.at(-1).type, 'revoke');
    assert.equal(target.blocks._blocks.copied, undefined);
    assert.equal(node.inert, true);
    b.send({type: 'edits', lease, targetId: other.id,
        events: [{type: 'move', blockId: 'block', newCoordinate: {x: 20, y: 0}}]});
    b.send({type: 'release', lease});
    assert.equal(await drop, true);
    assert.equal(b.messages.at(-1).type, 'grant');
    assert.equal(vm.editingTarget, other);
    assert.equal(a.messages.at(-1).canUndo, true);

    a.focus();
    b.send({type: 'release', lease: b.messages.at(-1).lease});
    a.send({type: 'step', lease: a.messages.at(-1).lease, targetId: target.id, redo: false});
    assert.deepEqual(target.blocks.getScripts(), ['block']);
    assert.equal(other.blocks._blocks.block.x, 20);
    session.dispose();
});
