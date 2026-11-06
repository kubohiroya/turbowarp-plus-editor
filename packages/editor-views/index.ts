import {getCodeDynamicShapes, getCodeExtensions} from './code-extensions.ts';
import {customField} from './custom-extension-fields.ts';
import {openNativeField} from './native-extension-field.ts';
import {readFieldActionPanel, type FieldActionPanel, type ProgrammaticExtensionField} from './programmatic-extension-field.ts';
import {capture, createHistory, restore, workspaceXML} from './history.ts';
import {removeObsoleteProcedureInputs} from './procedure-edits.ts';
import {decodeEdit, isCodeEdit, isCommentEdit} from './protocol.ts';

export {attachDockedCodeExtensions} from './code-extensions.ts';
export type {FieldActionPanel, ProgrammaticExtensionField} from './programmatic-extension-field.ts';
export {encodeEdit} from './protocol.ts';

// A drop must stay within one target's block and comment history.
const supportsSharedHistory = script => !script.variables.length && !script.extensionIDs?.length &&
    !Object.keys(script.extensionURLs).length;
const referenceTypes = {VARIABLE: '', LIST: 'list', BROADCAST_OPTION: 'broadcast_msg'} as const;
type ReferenceName = keyof typeof referenceTypes;
type ReferenceField = {id?: string; value?: string};

const referenceNames = Object.keys(referenceTypes) as ReferenceName[];
const isReferenceName = (name: unknown): name is ReferenceName =>
    typeof name === 'string' && Object.hasOwn(referenceTypes, name);
const needsEditingTarget = event => isCommentEdit(event) ||
    event.type === 'change' && event.element === 'field' && isReferenceName(event.name);

function referenceField(block: unknown, name: ReferenceName): ReferenceField | undefined {
    const {opcode, fields} = (block ?? {}) as {opcode?: string; fields?: Partial<Record<ReferenceName, ReferenceField>>};
    const supported = name === 'BROADCAST_OPTION' ?
        opcode === 'event_whenbroadcastreceived' || opcode === 'event_broadcast_menu' : opcode?.startsWith('data_');
    return supported ? fields?.[name] : undefined;
}

function scopedReference(target, stage, id: unknown, name: ReferenceName) {
    if (typeof id !== 'string') return undefined;
    const variable = target.lookupVariableById(id);
    if (variable?.type !== referenceTypes[name]) return undefined;
    // Broadcast IDs belong to the stage even when the block is on a sprite.
    if (name === 'BROADCAST_OPTION' && stage?.variables[id] !== variable) return undefined;
    return variable;
}

export function createCodeSession({vm, workspace, ScratchBlocks, document, locale, canUse, onError, receiveBackpackDrop}) {
    const parent = document.defaultView;
    const container = workspace.getParentSvg().parentElement;
    const originalInert = container.inert;
    const nativeUndo = workspace.undo;
    const nativeHasUndo = workspace.hasUndoStack;
    const nativeHasRedo = workspace.hasRedoStack;
    const histories = new Map();
    type CodeView = {
        target: typeof selectedTarget;
        port: MessagePort;
        document: Document;
        close(): void;
        duplicate?: () => void;
        closeNativeField?: () => void;
        fieldAction?: {request: number; blockId: string; name: string; value: string;
            editor: ProgrammaticExtensionField; panel: FieldActionPanel};
    };
    const views = new Set<CodeView>();
    const dirty = new Set();
    const thumbnails = new WeakMap();
    let catalog = [];
    let activeView;
    let selectedTarget = vm.editingTarget;
    let switchingWorkspace = false;
    let owner;
    let pending;
    let dropJob;
    let lease = 0;
    let projecting = false;
    let disposed = false;
    let canDuplicate = false;

    const exists = target => vm.runtime.getTargetById(target.id) === target;
    const selectable = target => Boolean(target?.isOriginal || target?.isStage);
    const parentFocused = () => document.hasFocus();
    const viewFocused = view => view.document.hasFocus();
    const updateInput = () => {
        container.inert = originalInert || Boolean(owner || pending || dropJob);
    };
    const dynamicShapesFor = target => getCodeDynamicShapes(vm.runtime, target);
    const projection = target => ({
        ...histories.get(target).state, xml: workspaceXML(vm, target), dynamicShapes: dynamicShapesFor(target)
    });
    const extensionsFor = target => getCodeExtensions(vm.runtime, target);
    const send = (view, message) => view.port.postMessage(message);

    function updateCatalog() {
        const targets = vm.runtime.targets.filter(selectable).map(target => {
            const asset = target.getCostumes?.()[target.currentCostume]?.asset;
            if (asset && !thumbnails.has(asset)) thumbnails.set(asset, asset.encodeDataURI());
            return {id: target.id, name: target.getName(), isStage: Boolean(target.isStage),
                thumbnailUrl: asset && thumbnails.get(asset)};
        });
        if (targets.length === catalog.length && targets.every(({id, name, isStage, thumbnailUrl}, index) =>
            id === catalog[index].id && name === catalog[index].name && isStage === catalog[index].isStage &&
            thumbnailUrl === catalog[index].thumbnailUrl)) return;
        catalog = targets;
        for (const view of views) send(view, {type: 'targets', targets});
    }

    function closeNativeEditor(view: CodeView) {
        const close = view.closeNativeField;
        view.closeNativeField = undefined;
        close?.();
    }

    function publish(target, source, refreshParent) {
        for (const view of views) if (view.target === target) closeNativeEditor(view);
        const data = projection(target);
        if (refreshParent && vm.editingTarget === target) {
            projecting = true;
            ScratchBlocks.Events.disable();
            try {
                vm.emit('workspaceUpdate', {xml: data.xml});
            } finally {
                ScratchBlocks.Events.enable();
                projecting = false;
            }
        }
        for (const view of views) {
            if (view.target !== target) continue;
            send(view, view === source ? {type: 'history', ...histories.get(target).state} : {type: 'update', ...data});
        }
    }

    function flushParent() {
        for (const target of dirty) {
            if (exists(target) && histories.get(target)?.commit()) publish(target, null, false);
        }
        dirty.clear();
    }

    function observeParent(event) {
        if (projecting || switchingWorkspace || disposed || dropJob?.running) return;
        const target = vm.editingTarget;
        if (isCodeEdit(event) && histories.has(target)) {
            dirty.add(target);
            queueMicrotask(flushParent);
        } else if (/^var_/.test(event.type) && histories.size) {
            // These operations can affect blocks on multiple targets and need a wider history model.
            queueMicrotask(() => {
                if (disposed) return;
                for (const tracked of histories.keys()) {
                    if (!exists(tracked)) continue;
                    histories.set(tracked, createHistory(tracked, vm.runtime.getTargetForStage()));
                    publish(tracked, null, false);
                }
                dirty.clear();
            });
        }
    }

    function flushWorkspaceProjection() {
        if (!switchingWorkspace && !owner) return;
        // Selection changes and refreshes of the inert parent workspace only queue
        // projection events. Do not let those events reset shared history.
        switchingWorkspace = true;
        try {
            ScratchBlocks.Events.fireNow_();
        } finally {
            switchingWorkspace = false;
        }
    }

    function retarget(view, target) {
        if (owner === view) {
            view.nextTarget = target;
            revoke();
            return;
        }
        if (target === view.target || !exists(target)) return;
        view.target = target;
        if (!histories.has(target)) histories.set(target, createHistory(target, vm.runtime.getTargetForStage()));
        send(view, {type: 'target', targetId: target.id, extensions: extensionsFor(target), ...projection(target)});
    }

    function grant() {
        if (disposed || owner) return;
        if (dropJob) {
            if (!dropJob.running) void runDrop(dropJob);
            return;
        }
        const view = pending;
        pending = undefined;
        if (!view || !views.has(view) || !viewFocused(view) || !exists(view.target)) {
            updateInput();
            return;
        }
        workspace.cancelCurrentGesture();
        ScratchBlocks.hideChaff();
        if (document.activeElement?.matches('.scratchCommentTextarea')) document.activeElement.blur();
        ScratchBlocks.Events.fireNow_();
        flushParent();
        if (vm.editingTarget !== view.target) vm.setEditingTarget(view.target.id);
        owner = view;
        view.lease = ++lease;
        view.draining = false;
        updateInput();
        send(view, {type: 'grant', lease: view.lease, extensions: extensionsFor(view.target), ...projection(view.target)});
    }

    function revoke() {
        if (!owner || owner.draining) return;
        owner.draining = true;
        owner.fieldAction = undefined;
        closeNativeEditor(owner);
        send(owner, {type: 'revoke', lease: owner.lease});
    }

    function parentFocus() {
        pending = undefined;
        revoke();
        updateInput();
    }

    function owns(view, message) {
        return owner === view && view.lease === message.lease && view.target.id === message.targetId &&
            exists(view.target);
    }

    function renameTarget(view, value) {
        const target = view.target;
        const name = typeof value === 'string' ? value.trim() : '';
        const oldName = target.getName();
        if (!name || !target.isOriginal || target.isStage || vm.editingTarget !== target ||
            vm.runtime.targets.some(other => other !== target && selectable(other) && !other.isStage &&
                other.getName() === name)) return false;
        if (name === oldName) return true;
        ScratchBlocks.Events.fireNow_();
        flushParent();
        // Passing an unused name keeps the VM's sprite name and all its block references identical.
        vm.renameSprite(target.id, name);
        const actual = target.getName();
        if (actual === oldName) return false;
        for (const [tracked, history] of histories) {
            history.renameSpriteReferences(oldName, actual);
            publish(tracked, null, true);
        }
        return true;
    }

    async function runDrop(job) {
        try {
            workspace.cancelCurrentGesture();
            ScratchBlocks.hideChaff();
            ScratchBlocks.Events.fireNow_();
            flushParent();
            job.running = true;
            const applied = await job.apply();
            // The importer refreshes the docked workspace. Drain its queued projection events
            // while the drop still owns the transaction so they cannot reset shared history.
            ScratchBlocks.Events.fireNow_();
            if (applied && !disposed && exists(job.target) && histories.get(job.target)?.commit()) {
                publish(job.target, null, true);
            }
            job.resolve(applied);
        } catch (error) {
            job.reject(error);
        } finally {
            dropJob = undefined;
            grant();
        }
    }

    function queueDrop(target, apply) {
        if (disposed || dropJob) return false;
        return new Promise((resolve, reject) => {
            dropJob = {target, apply, resolve, reject, running: false};
            updateInput();
            if (owner) {
                if (!pending && viewFocused(owner)) pending = owner;
                revoke();
            } else {
                grant();
            }
        });
    }

    function handleFieldAction(view, message) {
        if (view.draining || !viewFocused(view) || vm.editingTarget !== view.target) return;
        const target = view.target;
        const pending = view.fieldAction;
        view.fieldAction = undefined;
        const {request, blockId, name, action} = message;
        if (!Number.isSafeInteger(request) || typeof blockId !== 'string' || typeof name !== 'string') return;
        const block = target.blocks.getBlock(blockId);
        const value = block?.fields?.[name]?.value;
        if (typeof value !== 'string') return;
        const definition = customField(vm.runtime, block.opcode, name);
        const commit = (next: string) => {
            target.blocks.blocklyListen({type: 'change', blockId, element: 'field', name, newValue: next});
            if (histories.get(target).commit()) publish(target, null, true);
        };
        const lease = view.lease;
        if (definition?.native && message.type === 'field-editor') {
            const {anchor} = message;
            if (!Number.isFinite(anchor?.left) || !Number.isFinite(anchor?.bottom)) return;
            closeNativeEditor(view);
            const field = workspace.getBlockById(blockId)?.getField(name);
            view.closeNativeField = openNativeField({
                blocks: ScratchBlocks, field, document: view.document, anchor,
                valid: () => owns(view, {targetId: target.id, lease}) && !view.draining && viewFocused(view) &&
                    vm.editingTarget === target && workspace.getBlockById(blockId)?.getField(name) === field &&
                    target.blocks.getBlock(blockId)?.fields?.[name]?.value === value,
                commit, onError
            });
            return;
        }
        const editor = definition?.programmatic;
        if (!editor) return;
        try {
            if (message.type === 'field-editor') {
                const panel = readFieldActionPanel(editor, value);
                if (!panel) return;
                view.fieldAction = {request, blockId, name, value, editor, panel};
                send(view, {type: 'field-panel', lease: view.lease, request, panel});
            } else if (pending?.request === request && pending.blockId === blockId && pending.name === name &&
                pending.editor === editor && pending.value === value && pending.panel.actions.some(item => item.id === action)) {
                const next = editor.applyAction(value, action);
                if (typeof next === 'string' && next !== value) commit(next);
            }
        } catch (error) {
            onError?.(error);
        }
    }

    function receive(view, message) {
        if (!views.has(view) || !message || typeof message !== 'object') return;
        if (message.type === 'focus') {
            if (owner === view && !view.draining || !viewFocused(view)) return;
            activeView = view;
            pending = view;
            if (owner) revoke();
            else grant();
            return;
        }
        if (message.type === 'release') {
            if (owner === view && view.lease === message.lease) {
                closeNativeEditor(view);
                owner = undefined;
                const target = view.nextTarget;
                view.nextTarget = undefined;
                if (target) retarget(view, target);
                grant();
            }
            return;
        }
        if (message.type === 'duplicate-view' && canDuplicate && view.duplicate && exists(view.target) && viewFocused(view)) {
            view.duplicate(view.target);
            return;
        }
        if (message.type === 'dock' || message.type === 'failed') {
            view.close();
            return;
        }
        if (message.type === 'backpack-drop' && receiveBackpackDrop) {
            const {targetId, raw, position} = message;
            const {target} = view;
            const valid = () => !disposed && views.has(view) && exists(target);
            if (targetId !== target.id || typeof raw !== 'string' || !valid() ||
                !Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return;
            void receiveBackpackDrop({vm, target, raw, position, canUse: valid, onError,
                accept: supportsSharedHistory, commit: apply => queueDrop(target, apply)});
            return;
        }
        if (!owns(view, message)) return;
        if (message.type === 'field-editor' || message.type === 'field-action') {
            handleFieldAction(view, message);
            return;
        }
        view.fieldAction = undefined;
        closeNativeEditor(view);
        if (message.type === 'select-target') {
            if (view.draining || !viewFocused(view)) return;
            const target = vm.runtime.getTargetById(message.nextTargetId);
            if (selectable(target) && target !== view.target) {
                pending = view;
                retarget(view, target);
            }
            return;
        }
        if (message.type === 'rename-target') {
            if (view.draining) return;
            let accepted = false;
            try {
                if (viewFocused(view)) accepted = renameTarget(view, message.name);
            } catch (error) {
                onError?.(error);
            }
            send(view, {type: 'rename-result', lease: view.lease, accepted});
            return;
        }
        if (message.type === 'edits' && Array.isArray(message.events) && message.events.length <= 1000) {
            const edits = message.events.map(decodeEdit);
            if (!edits.length || edits.some(event => !event)) return;
            const {target} = view;
            // Those fields resolve through the VM's current editing target rather than the Blocks container.
            if (vm.runtime.getEditingTarget() !== target && edits.some(needsEditingTarget)) return;
            const stage = vm.runtime.getTargetForStage();
            const before = capture(target);
            let applied = false;
            const reject = () => {
                if (applied) restore(target, before);
                publish(target, null, applied);
            };
            try {
                const mutations = new Set<string>();
                for (const event of edits) {
                    const {name} = event;
                    if (event.type === 'change' && event.element === 'field' && typeof name === 'string') {
                        const field = customField(vm.runtime, target.blocks.getBlock(event.blockId)?.opcode, name);
                        if (field?.programmatic || field?.native) {
                            reject();
                            return;
                        }
                    }
                    if (event.type === 'change' && event.element === 'field' && isReferenceName(name) &&
                        referenceField(target.blocks.getBlock(event.blockId), name) &&
                        !scopedReference(target, stage, event.newValue, name)) {
                        reject();
                        return;
                    }
                    target.blocks.blocklyListen(event);
                    applied = true;
                    if (event.type === 'change' && event.element === 'mutation') mutations.add(event.blockId);
                }
                removeObsoleteProcedureInputs(target.blocks, mutations);
                // Create XML stores variable IDs directly. Only check changed references so old projects
                // with unrelated unresolved fields can still be edited.
                if (edits.some(event => event.type === 'create') &&
                    Object.entries(target.blocks._blocks).some(([id, block]) => referenceNames.some(name => {
                        const field = referenceField(block, name);
                        const previous = referenceField(before.blocks[id], name);
                        if (!field || (previous && field.id === previous.id && field.value === previous.value)) return false;
                        const variable = scopedReference(target, stage, field.id, name);
                        return !variable || variable.name !== field.value;
                    }))) {
                    reject();
                    return;
                }
            } catch (error) {
                restore(target, before);
                publish(target, null, true);
                view.close();
                onError?.(error);
                return;
            }
            if (histories.get(target).commit()) publish(target, view, true);
        } else if (message.type === 'step' && typeof message.redo === 'boolean' && !view.draining &&
            vm.editingTarget === view.target) {
            if (histories.get(view.target).step(message.redo)) publish(view.target, view, true);
            send(view, {type: 'step-result', lease: view.lease, ...projection(view.target)});
        }
    }

    function targetsUpdated() {
        if (views.size) updateCatalog();
        for (const view of views) if (!exists(view.target)) view.close();
        for (const target of histories.keys()) if (!exists(target)) histories.delete(target);
        const target = vm.editingTarget;
        if (target === selectedTarget) return;
        selectedTarget = target;
        switchingWorkspace = true;
        queueMicrotask(flushWorkspaceProjection);
        if (parentFocused() && activeView && selectable(target)) retarget(activeView, target);
        if (owner && target !== owner.target) revoke();
    }

    function extensionsUpdated() {
        for (const view of views) {
            closeNativeEditor(view);
            send(view, {type: 'extensions', extensions: extensionsFor(view.target), dynamicShapes: dynamicShapesFor(view.target)});
        }
    }

    function attach({target, mount, port, close, duplicate, layoutMenu}) {
        if (disposed || !exists(target)) {
            close();
            return () => {};
        }
        if (!views.size) {
            selectedTarget = vm.editingTarget;
            updateCatalog();
        }
        if (!histories.has(target)) histories.set(target, createHistory(target, vm.runtime.getTargetForStage()));
        const view: CodeView = {target, port, document: mount.ownerDocument, close, duplicate};
        const listener = event => receive(view, event.data);
        views.add(view);
        port.addEventListener('message', listener);
        port.start();
        send(view, {type: 'snapshot', targetId: target.id, targets: catalog, locale,
            backpackDrop: Boolean(receiveBackpackDrop), layoutMenu: Boolean(layoutMenu),
            canDuplicate: Boolean(duplicate && canDuplicate), extensions: extensionsFor(target), ...projection(target)});
        return () => {
            closeNativeEditor(view);
            views.delete(view);
            port.removeEventListener('message', listener);
            if (activeView === view) activeView = undefined;
            if (pending === view) pending = undefined;
            if (owner === view) owner = undefined;
            grant();
        };
    }

    workspace.undo = function (redo) {
        const target = vm.editingTarget;
        if (!parentFocused() || owner || pending || dropJob || !canUse()) return;
        const history = histories.get(target);
        if (!history) return nativeUndo.call(this, redo);
        ScratchBlocks.Events.fireNow_();
        flushParent();
        if (history.step(Boolean(redo))) publish(target, null, true);
    };
    workspace.hasUndoStack = function () {
        return histories.get(vm.editingTarget)?.state.canUndo ?? nativeHasUndo.call(this);
    };
    workspace.hasRedoStack = function () {
        return histories.get(vm.editingTarget)?.state.canRedo ?? nativeHasRedo.call(this);
    };
    workspace.addChangeListener(observeParent);
    parent.addEventListener('focus', parentFocus);
    vm.on('targetsUpdate', targetsUpdated);
    vm.on('workspaceUpdate', flushWorkspaceProjection);
    vm.on('EXTENSION_ADDED', extensionsUpdated);
    vm.on('BLOCKSINFO_UPDATE', extensionsUpdated);

    return {attach, setCanDuplicate(available) {
        if (available === canDuplicate) return;
        canDuplicate = available;
        for (const view of views) if (view.duplicate) send(view, {type: 'can-duplicate', available});
    }, dispose() {
        disposed = true;
        if (dropJob && !dropJob.running) {
            dropJob.resolve(false);
            dropJob = undefined;
        }
        for (const view of views) view.close();
        views.clear();
        workspace.removeChangeListener(observeParent);
        workspace.undo = nativeUndo;
        workspace.hasUndoStack = nativeHasUndo;
        workspace.hasRedoStack = nativeHasRedo;
        parent.removeEventListener('focus', parentFocus);
        vm.removeListener('targetsUpdate', targetsUpdated);
        vm.removeListener('workspaceUpdate', flushWorkspaceProjection);
        vm.removeListener('EXTENSION_ADDED', extensionsUpdated);
        vm.removeListener('BLOCKSINFO_UPDATE', extensionsUpdated);
        container.inert = originalInert;
    }};
}
