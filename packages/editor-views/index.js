import {capture, createHistory, restore, workspaceXML} from './history.js';
import {decodeEdit, isBlockEdit} from './protocol.js';

export {encodeEdit} from './protocol.js';

// Shared history captures blocks, so a drop must not create variables or load extensions.
const supportsSharedHistory = script => !script.variables.length && !script.extensionIDs?.length &&
    !Object.keys(script.extensionURLs).length;

export function createCodeSession({vm, workspace, ScratchBlocks, document, canUse, onError, receiveBackpackDrop}) {
    const parent = document.defaultView;
    const container = workspace.getParentSvg().parentElement;
    const originalInert = container.inert;
    const nativeUndo = workspace.undo;
    const nativeHasUndo = workspace.hasUndoStack;
    const nativeHasRedo = workspace.hasRedoStack;
    const histories = new Map();
    const views = new Set();
    const dirty = new Set();
    let owner;
    let pending;
    let dropJob;
    let lease = 0;
    let projecting = false;
    let disposed = false;

    const exists = target => vm.runtime.getTargetById(target.id) === target;
    const parentFocused = () => document.hasFocus();
    const viewFocused = view => view.document.hasFocus();
    const updateInput = () => {
        container.inert = originalInert || Boolean(owner || pending || dropJob);
    };
    const projection = target => ({...histories.get(target).state, xml: workspaceXML(vm, target)});
    const send = (view, message) => view.port.postMessage(message);

    function publish(target, source, refreshParent) {
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
        if (projecting || disposed || dropJob?.running) return;
        const target = vm.editingTarget;
        if (isBlockEdit(event) && histories.has(target)) {
            dirty.add(target);
            queueMicrotask(flushParent);
        } else if (/^(?:var|comment)_/.test(event.type) && histories.size) {
            // These operations can affect blocks on multiple targets and need a wider history model.
            queueMicrotask(() => {
                if (disposed) return;
                for (const tracked of histories.keys()) {
                    if (!exists(tracked)) continue;
                    histories.set(tracked, createHistory(tracked));
                    publish(tracked, null, false);
                }
                dirty.clear();
            });
        }
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
        ScratchBlocks.Events.fireNow_();
        flushParent();
        if (vm.editingTarget !== view.target) vm.setEditingTarget(view.target.id);
        owner = view;
        view.lease = ++lease;
        view.draining = false;
        updateInput();
        send(view, {type: 'grant', lease: view.lease, ...projection(view.target)});
    }

    function revoke() {
        if (!owner || owner.draining) return;
        owner.draining = true;
        send(owner, {type: 'revoke', lease: owner.lease});
    }

    function parentFocus() {
        pending = undefined;
        revoke();
        updateInput();
    }

    function owns(view, message) {
        return owner === view && view.lease === message.lease && view.target.id === message.targetId &&
            exists(view.target) && vm.editingTarget === view.target && vm.runtime.getEditingTarget() === view.target;
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

    function receive(view, message) {
        if (!views.has(view) || !message || typeof message !== 'object') return;
        if (message.type === 'focus') {
            if (owner === view && !view.draining || !viewFocused(view)) return;
            pending = view;
            if (owner) revoke();
            else grant();
            return;
        }
        if (message.type === 'release') {
            if (owner === view && view.lease === message.lease) {
                owner = undefined;
                grant();
            }
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
        if (message.type === 'edits' && Array.isArray(message.events) && message.events.length <= 1000) {
            const edits = message.events.map(decodeEdit);
            if (!edits.length || edits.some(event => !event)) return;
            const before = capture(view.target);
            try {
                for (const event of edits) view.target.blocks.blocklyListen(event);
            } catch (error) {
                restore(view.target, before);
                publish(view.target, null, true);
                view.close();
                onError?.(error);
                return;
            }
            if (histories.get(view.target).commit()) publish(view.target, view, true);
        } else if (message.type === 'step' && typeof message.redo === 'boolean' && !view.draining) {
            if (histories.get(view.target).step(message.redo)) publish(view.target, view, true);
            send(view, {type: 'step-result', lease: view.lease, ...projection(view.target)});
        }
    }

    function targetsUpdated() {
        for (const view of views) if (!exists(view.target)) view.close();
        for (const target of histories.keys()) if (!exists(target)) histories.delete(target);
        if (owner && vm.editingTarget !== owner.target) revoke();
    }

    function attach({target, mount, port, close}) {
        if (disposed || !exists(target)) {
            close();
            return () => {};
        }
        if (!histories.has(target)) histories.set(target, createHistory(target));
        const view = {target, port, document: mount.ownerDocument, close};
        const listener = event => receive(view, event.data);
        views.add(view);
        port.addEventListener('message', listener);
        port.start();
        send(view, {type: 'snapshot', targetId: target.id, name: target.getName(),
            backpackDrop: Boolean(receiveBackpackDrop), ...projection(target)});
        return () => {
            views.delete(view);
            port.removeEventListener('message', listener);
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

    return {attach, dispose() {
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
        container.inert = originalInert;
    }};
}
