import React from 'react';
import ReactDOM from 'react-dom';
import ScratchBlocks from 'scratch-blocks';
import {transferMime} from '@kubohiroya/turbowarp-editor-transfer';
import {encodeEdit} from '@kubohiroya/turbowarp-editor-views';
import {TargetCombobox} from '@kubohiroya/turbowarp-editor-views/target-combobox';

const ticket = location.hash.slice(1);
const mount = document.getElementById('mount');
const workspaceArea = document.getElementById('workspace-area');
const dropZone = document.getElementById('drop-zone');
const picker = document.getElementById('target-picker');
const renameError = document.getElementById('rename-error');
const status = document.getElementById('status');
const undo = document.getElementById('undo');
const redo = document.getElementById('redo');
const dock = document.getElementById('dock');
const motion = `<category name="Motion" colour="#4c97ff" secondaryColour="#3373cc">
    <block type="motion_movesteps"><value name="STEPS"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block>
    <block type="motion_turnright"><value name="DEGREES"><shadow type="math_number"><field name="NUM">15</field></shadow></value></block>
    </category>`;
const toolbox = isStage => `<xml>${isStage ? '' : motion}
    <category name="Looks" colour="#9966ff" secondaryColour="#774dcb">
        ${isStage ? '<block type="looks_nextbackdrop"></block><block type="looks_backdropnumbername"></block>' :
        '<block type="looks_show"></block><block type="looks_hide"></block>'}
    </category></xml>`;

const workspace = ScratchBlocks.inject(mount, {
    media: 'static/blocks-media/default/', toolbox: toolbox(false), scrollbars: true, comments: true
});
let stageToolbox = false;
let port;
let targetId;
let targets = [];
let locale;
let backpackDrop = false;
let lease;
let editable = false;
let history = {canUndo: false, canRedo: false};
let group;
let edits = [];

function buttons() {
    undo.disabled = !editable || !history.canUndo;
    redo.disabled = !editable || !history.canRedo;
}

function setEditable(value) {
    editable = value;
    mount.inert = !value;
    dropZone.hidden = value || !backpackDrop;
    status.textContent = value ? 'Editing' : 'Read only';
    buttons();
    renderTarget();
}

function renderTarget() {
    const target = targets.find(candidate => candidate.id === targetId);
    const name = target?.name;
    if (target && target.isStage !== stageToolbox) {
        workspace.updateToolbox(toolbox(target.isStage));
        stageToolbox = target.isStage;
    }
    const code = /^ja(?:-|$)/i.test(locale) ? 'コード' : 'Code';
    document.title = name ? `${code} · ${name}` : code;
    ReactDOM.render(<TargetCombobox id="code-target" value={targetId} targets={targets} locale={locale}
        disabled={!editable} onSelect={nextTargetId => {
            if (!editable || nextTargetId === targetId) return;
            renameError.hidden = true;
            drain();
            port.postMessage({type: 'select-target', targetId, lease, nextTargetId});
        }} onRename={name => {
            if (!editable) return;
            renameError.hidden = true;
            drain();
            setEditable(false);
            port.postMessage({type: 'rename-target', targetId, lease, name});
        }} />, picker);
}

function snapshot(message) {
    history = message;
    if (message.xml) {
        ScratchBlocks.Events.disable();
        try {
            ScratchBlocks.Xml.clearWorkspaceAndLoadFromXml(ScratchBlocks.Xml.textToDom(message.xml), workspace);
            workspace.clearUndo();
        } finally {
            ScratchBlocks.Events.enable();
        }
    }
    buttons();
}

function flush() {
    if (lease === undefined || !edits.length || workspace.isDragging()) return;
    port.postMessage({type: 'edits', targetId, lease, events: edits});
    edits = [];
}

function drain() {
    workspace.cancelCurrentGesture();
    ScratchBlocks.hideChaff();
    if (document.activeElement?.matches('.scratchCommentTextarea')) document.activeElement.blur();
    ScratchBlocks.Events.fireNow_();
    flush();
}

function release(token = lease) {
    if (token === undefined || token !== lease) return;
    drain();
    setEditable(false);
    port.postMessage({type: 'release', lease});
    lease = undefined;
    edits = [];
}

function focus() {
    if (targetId) port.postMessage({type: 'focus'});
}

function step(forward) {
    if (!editable || !(forward ? history.canRedo : history.canUndo)) return;
    drain();
    setEditable(false);
    port.postMessage({type: 'step', targetId, lease, redo: forward});
}

function receive({data: message}) {
    try {
        switch (message.type) {
        case 'snapshot':
            targetId = message.targetId;
            targets = message.targets;
            locale = message.locale;
            backpackDrop = message.backpackDrop;
            snapshot(message);
            dock.disabled = false;
            setEditable(false);
            if (document.hasFocus()) focus();
            break;
        case 'target':
            targetId = message.targetId;
            renameError.hidden = true;
            snapshot(message);
            renderTarget();
            break;
        case 'rename-result':
            if (lease === message.lease) {
                renameError.textContent = /^ja(?:-|$)/i.test(locale) ?
                    'この名前は使用できません' : 'This name is unavailable';
                renameError.hidden = message.accepted;
                if (document.hasFocus()) setEditable(true);
                else release();
            }
            break;
        case 'targets':
            targets = message.targets;
            renderTarget();
            break;
        case 'grant':
            if (!document.hasFocus()) {
                port.postMessage({type: 'release', lease: message.lease});
                break;
            }
            snapshot(message);
            lease = message.lease;
            setEditable(true);
            break;
        case 'revoke':
            release(message.lease);
            break;
        case 'history':
        case 'update':
            snapshot(message);
            break;
        case 'step-result':
            if (lease === message.lease) {
                snapshot(message);
                if (document.hasFocus()) setEditable(true);
                else release();
            }
            break;
        }
    } catch (error) {
        setEditable(false);
        port.postMessage({type: 'failed'});
        throw error;
    }
}

workspace.addChangeListener(event => {
    if (lease === undefined) return;
    if (event.type === 'endDrag') {
        queueMicrotask(flush);
        return;
    }
    const edit = encodeEdit(event);
    if (!edit) return;
    if (edits.length && group !== event.group) flush();
    group = event.group;
    edits.push(edit);
    queueMicrotask(flush);
});
workspace.undo = step;
workspace.hasUndoStack = () => editable && history.canUndo;
workspace.hasRedoStack = () => editable && history.canRedo;
undo.addEventListener('click', () => step(false));
redo.addEventListener('click', () => step(true));
dock.addEventListener('click', () => {
    release();
    port.postMessage({type: 'dock'});
});

function acceptsBackpack(event) {
    return backpackDrop && event.dataTransfer?.types.includes(transferMime);
}

workspaceArea.addEventListener('dragover', event => {
    if (!acceptsBackpack(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
});
workspaceArea.addEventListener('drop', event => {
    if (!acceptsBackpack(event)) return;
    event.preventDefault();
    const matrix = workspace.getCanvas().getScreenCTM();
    if (!matrix) return;
    const point = workspace.getParentSvg().createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const {x, y} = point.matrixTransform(matrix.inverse());
    port.postMessage({type: 'backpack-drop', targetId, position: {x, y},
        raw: event.dataTransfer.getData(transferMime)});
});
window.addEventListener('focus', focus);
window.addEventListener('blur', () => release());
window.addEventListener('resize', () => ScratchBlocks.svgResize(workspace));
window.addEventListener('pagehide', () => {
    release();
    port?.postMessage('stage2/disconnect');
    workspace.dispose();
}, {once: true});
for (const name of ['keydown', 'keyup']) {
    window.addEventListener(name, event => {
        if (!editable) event.stopImmediatePropagation();
    }, true);
}

function connect(event) {
    if (event.source !== window.opener || event.origin !== location.origin ||
        event.data?.type !== 'stage2/connect' || event.data.ticket !== ticket || event.ports.length !== 1) return;
    window.removeEventListener('message', connect);
    [port] = event.ports;
    port.addEventListener('message', receive);
    port.start();
    port.postMessage('stage2/connected');
}
window.addEventListener('message', connect);
window.opener?.postMessage({type: 'stage2/ready', ticket}, location.origin);
