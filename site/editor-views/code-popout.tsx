import React from 'react';
import ReactDOM from 'react-dom';
import {PopupLayout} from '../editor-layout/popup-layout.tsx';
import {attachWorkspaceNavigation} from '../workspace-minimap/index.ts';
import {installBlockContextMenuIcons} from '../context-menu-icons/index.ts';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';
import ScratchBlocks from 'scratch-blocks';
import {transferMime} from '@kubohiroya/turbowarp-editor-transfer';
import {installProcedureEditor} from '@kubohiroya/turbowarp-plus-editor-views/procedure-editor';
import {createCodeExtensionPalette, createFieldActionDialog} from '@kubohiroya/turbowarp-plus-editor-views/code-extensions';
import {encodeEdit} from '@kubohiroya/turbowarp-plus-editor-views';
import {installScopedVariableReferences} from '@kubohiroya/turbowarp-plus-editor-views/variable-references';
import {TargetCombobox} from '@kubohiroya/turbowarp-plus-editor-views/target-combobox';

const ticket = location.hash.slice(1);
const mount = document.getElementById('mount');
const workspaceArea = document.getElementById('workspace-area');
const dropZone = document.getElementById('drop-zone');
const picker = document.getElementById('target-picker');
const renameError = document.getElementById('rename-error');
const status = document.getElementById('status');
const undo = document.querySelector<HTMLButtonElement>('#undo');
const redo = document.querySelector<HTMLButtonElement>('#redo');
const popupLayout = document.getElementById('popup-layout');
const dock = document.querySelector<HTMLButtonElement>('#dock');
const motion = `<category name="Motion" colour="#4c97ff" secondaryColour="#3373cc">
    <block type="motion_movesteps"><value name="STEPS"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block>
    <block type="motion_turnright"><value name="DEGREES"><shadow type="math_number"><field name="NUM">15</field></shadow></value></block>
    </category>`;
const toolbox = (isStage, extensions = '') => `<xml>${isStage ? '' : motion}
    <category name="Looks" colour="#9966ff" secondaryColour="#774dcb">
        ${isStage ? '<block type="looks_nextbackdrop"></block><block type="looks_backdropnumbername"></block>' :
        '<block type="looks_show"></block><block type="looks_hide"></block>'}
    </category>
    <category name="My Blocks" colour="#ff6680" secondaryColour="#ff4d6a" custom="PROCEDURE"></category>${extensions}</xml>`;

const workspace = ScratchBlocks.inject(mount, {
    media: 'static/blocks-media/default/', toolbox: toolbox(false), scrollbars: true, comments: true, zoom: {controls: true}
});
let navigation;
const fieldDialog = createFieldActionDialog(document);
let fieldRequest = 0;
let pendingField: {request: number; blockId: string; name: string} | undefined;
const extensionPalette = createCodeExtensionPalette(ScratchBlocks, (field, name) => {
    const block = field.sourceBlock_;
    if (!editable || blockedSnapshot || !document.hasFocus() || !block || block.isInFlyout) return;
    drain();
    pendingField = {request: ++fieldRequest, blockId: block.id, name};
    const {left, bottom} = field.getSvgRoot().getBoundingClientRect();
    port.postMessage({type: 'field-editor', targetId, lease, ...pendingField, anchor: {left, bottom}});
});

function cancelFieldEditor() {
    pendingField = undefined;
    fieldDialog.close();
}
let stageToolbox = false;
let extensionCategories = '';
let extensionSignature = '';
let blockedSnapshot;
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
installScopedVariableReferences(ScratchBlocks, workspace, () => locale);
const procedureEditor = installProcedureEditor({
    blocks: ScratchBlocks, workspace, getLocale: () => locale, canEdit: () => editable && !blockedSnapshot && document.hasFocus(),
    commit(apply) {
        drain();
        apply();
        ScratchBlocks.Events.fireNow_();
        flush();
    }
});

function buttons() {
    undo.disabled = !editable || !history.canUndo;
    redo.disabled = !editable || !history.canRedo;
}

function setEditable(value) {
    editable = value;
    if (!value) cancelFieldEditor();
    updateWorkspaceAccess();
    buttons();
    renderTarget();
}

function updateWorkspaceAccess() {
    mount.inert = !editable || Boolean(blockedSnapshot);
    dropZone.hidden = editable || !backpackDrop || Boolean(blockedSnapshot);
    status.textContent = blockedSnapshot ?
        (/^ja(?:-|$)/i.test(locale) ? 'この別窓で表示できない拡張ブロックがあります' : 'This view cannot display some extension blocks') :
        (editable ? 'Editing' : 'Read only');
}

function updateExtensions(extensions) {
    const signature = JSON.stringify(extensions);
    if (signature === extensionSignature) return;
    extensionSignature = signature;
    extensionCategories = extensionPalette.update(extensions);
    const target = targets.find(candidate => candidate.id === targetId);
    stageToolbox = Boolean(target?.isStage);
    workspace.updateToolbox(toolbox(stageToolbox, extensionCategories));
}

function renderTarget() {
    const target = targets.find(candidate => candidate.id === targetId);
    const name = target?.name;
    if (target && target.isStage !== stageToolbox) {
        workspace.updateToolbox(toolbox(target.isStage, extensionCategories));
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

function renderLayout(canDuplicate) {
    ReactDOM.render(<PopupLayout window={window} locale={locale} onDock={() => dock.click()}
        onDuplicate={canDuplicate ? () => {
            drain();
            port.postMessage({type: 'duplicate-view'});
        } : undefined} />, popupLayout);
}

function snapshot(message) {
    history = message;
    if (message.extensions) updateExtensions(message.extensions);
    if (message.dynamicShapes) extensionPalette.setDynamicShapes(message.dynamicShapes);
    if (message.xml) {
        extensionPalette.setNativeFieldGraphics(message.nativeFieldGraphics ?? []);
        cancelFieldEditor();
        procedureEditor.cancel();
        ScratchBlocks.Events.disable();
        try {
            const xml = ScratchBlocks.Xml.textToDom(message.xml);
            blockedSnapshot = extensionPalette.supports(xml) ? undefined : message.xml;
            if (blockedSnapshot) workspace.clear();
            else ScratchBlocks.Xml.clearWorkspaceAndLoadFromXml(xml, workspace);
            workspace.clearUndo();
        } finally {
            ScratchBlocks.Events.enable();
        }
    }
    updateWorkspaceAccess();
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
    if (document.activeElement?.matches('.scratchCommentTextarea')) (document.activeElement as HTMLElement).blur();
    ScratchBlocks.Events.fireNow_();
    flush();
}

function release(token = lease) {
    if (token === undefined || token !== lease) return;
    procedureEditor.cancel();
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
            if (message.layoutMenu) {
                dock.hidden = true;
                popupLayout.hidden = false;
                navigation ??= attachWorkspaceNavigation(workspace, ScratchBlocks, {horizontalZoom: true, minimap: true});
                renderLayout(message.canDuplicate);
            }
            setEditable(false);
            if (document.hasFocus()) focus();
            break;
        case 'can-duplicate':
            renderLayout(message.available);
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
        case 'extensions':
            updateExtensions(message.extensions);
            extensionPalette.setDynamicShapes(message.dynamicShapes);
            if (blockedSnapshot) snapshot({...history, xml: blockedSnapshot, extensions: undefined, dynamicShapes: undefined});
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
        case 'field-panel':
            if (editable && document.hasFocus() && lease === message.lease && pendingField?.request === message.request) {
                const selection = pendingField;
                fieldDialog.show(message.panel, action => {
                    if (pendingField !== selection || !editable || !document.hasFocus()) return;
                    pendingField = undefined;
                    port.postMessage({type: 'field-action', targetId, lease, ...selection, action});
                }, locale);
            }
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
    return !blockedSnapshot && backpackDrop && event.dataTransfer?.types.includes(transferMime);
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
    navigation?.dispose();
    port?.postMessage('stage2/disconnect');
    workspace.dispose();
}, {once: true});
for (const name of ['keydown', 'keyup']) {
    window.addEventListener(name, event => {
        if (!editable) event.stopImmediatePropagation();
    }, true);
}

function connect(event) {
    const parent = window.opener;
    if (!parent || event.source !== parent || event.origin !== location.origin ||
        event.data?.type !== 'stage2/connect' || event.data.ticket !== ticket || event.ports.length !== 1) return;
    window.removeEventListener('message', connect);
    const {contextMenuIcons} = readWebStartupFeatureFlags(parent.location.search);
    installBlockContextMenuIcons(ScratchBlocks, contextMenuIcons);
    [port] = event.ports;
    port.addEventListener('message', receive);
    port.start();
    port.postMessage('stage2/connected');
}
window.addEventListener('message', connect);
window.opener?.postMessage({type: 'stage2/ready', ticket}, location.origin);
