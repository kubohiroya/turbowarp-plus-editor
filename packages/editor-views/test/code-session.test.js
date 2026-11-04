import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {test} from 'node:test';
import {createCodeSession} from '../index.js';

function fixture() {
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
        return {id, blocks, variables: {}, comments: {}, getName: () => id};
    };
    const target = makeTarget('first');
    const other = makeTarget('other');
    const vm = Object.assign(new EventEmitter(), {
        editingTarget: target,
        runtime: {
            getTargetForStage: () => ({variables: {}}),
            getTargetById: id => [target, other].find(sprite => sprite.id === id),
            getEditingTarget: () => vm.editingTarget
        },
        setEditingTarget(id) {
            this.editingTarget = this.runtime.getTargetById(id);
            this.emit('targetsUpdate');
        }
    });
    const session = createCodeSession({
        vm, workspace, document, canUse: () => true,
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
