import {exportScript, importScriptWithReceipt, type BlockImportReceipt, type TargetPort, type VMPort}
    from '@kubohiroya/turbowarp-script-transfer';

type Destination = {element: HTMLElement; workspace; target: TargetPort};
type Point = {x: number; y: number};
type StartDrag = (dragger) => void;
const sources = new WeakMap<object, StartDrag>();
const installed = new WeakSet<object>();
const onDragDisposed = new WeakMap<object, () => void>();

function installDragStart(blocks) {
    const prototype = blocks.BlockDragger.prototype;
    if (installed.has(prototype)) return;
    installed.add(prototype);
    const {startBlockDrag, dispose} = prototype;
    prototype.startBlockDrag = function (...args) {
        sources.get(this.workspace_)?.(this);
        return startBlockDrag.apply(this, args);
    };
    prototype.dispose = function (...args) {
        onDragDisposed.get(this)?.();
        return dispose.apply(this, args);
    };
}

function finishAtSource(blocks, workspace, gesture, group: string) {
    const {x, y} = gesture.mouseDownXY_;
    const block = gesture.blockDragger_.draggingBlock_;
    const connections = gesture.blockDragger_.draggedConnectionManager_;
    const {isDeleteArea, isInsideBlocksArea} = workspace;
    const {wouldConnectBlock} = connections;
    const {scheduleSnapAndBump} = block;
    const redo = workspace.redoStack_.slice();
    // Finish the native gesture at its origin. A detached stack is reconnected by undoing
    // just the drag's event group, before releasing the workspace to another tab.
    workspace.isDeleteArea = () => blocks.DELETE_AREA_NONE;
    workspace.isInsideBlocksArea = () => true;
    connections.wouldConnectBlock = () => false;
    block.scheduleSnapAndBump = () => {};
    try {
        const Mouse = workspace.getInjectionDiv().ownerDocument.defaultView.MouseEvent;
        gesture.handleUp(new Mouse('mouseup', {clientX: x, clientY: y}));
        blocks.Events.fireNow_();
        if (group && workspace.undoStack_.at(-1)?.group === group) {
            workspace.undo(false);
            blocks.Events.fireNow_();
            workspace.redoStack_ = redo;
        }
    } finally {
        workspace.isDeleteArea = isDeleteArea;
        workspace.isInsideBlocksArea = isInsideBlocksArea;
        connections.wouldConnectBlock = wouldConnectBlock;
        block.scheduleSnapAndBump = scheduleSnapAndBump;
    }
}

function positionIn(destination: Destination, {x, y}: Point) {
    const svg = destination.workspace.getParentSvg();
    const matrix = destination.workspace.getCanvas().getScreenCTM();
    if (!matrix) return;
    const point = svg.createSVGPoint();
    point.x = x;
    point.y = y;
    const position = point.matrixTransform(matrix.inverse());
    if (Number.isFinite(position.x) && Number.isFinite(position.y)) {
        return {x: Math.round(destination.workspace.RTL ? -position.x : position.x), y: Math.round(position.y)};
    }
}

export function attachBlockDrag({vm, workspace, ScratchBlocks: blocks, onError, prepareImport}: {
    vm: VMPort; workspace; ScratchBlocks; onError(error: unknown): void;
    prepareImport(target: TargetPort): (receipt: BlockImportReceipt) => void;
}) {
    const destinations = new Set<Destination>();
    const windowOffsets = new WeakMap<Window, Point>();
    let disposed = false;
    let clearDrag: (() => void) | undefined;

    function windowPoint(event: MouseEvent, source: Document, destination: Document): Point | undefined {
        if (source === destination) return {x: event.clientX, y: event.clientY};
        const host = source.defaultView;
        const child = destination.defaultView;
        if (!host || !child || (event.clientX >= 0 && event.clientX < host.innerWidth &&
                event.clientY >= 0 && event.clientY < host.innerHeight)) return;
        // A browser may continue to deliver mouse input to the pressed window. Prefer a
        // measured viewport offset, accounting for browser chrome around a popup.
        const measured = windowOffsets.get(child);
        const border = (child.outerWidth - child.innerWidth) / 2;
        const x = measured?.x ?? border;
        const y = measured?.y ?? child.outerHeight - child.innerHeight - border;
        return {x: event.screenX - child.screenX - x, y: event.screenY - child.screenY - y};
    }

    const current = (destination: Destination) => !disposed && destinations.has(destination) &&
        destination.element.isConnected && vm.runtime.getTargetById(destination.target.id) === destination.target;

    installDragStart(blocks);
    sources.set(workspace, dragger => {
        clearDrag?.();
        const gesture = workspace.currentGesture_;
        const down = gesture?.mostRecentEvent_;
        const block = dragger.draggingBlock_;
        const target = vm.editingTarget;
        if (!destinations.size || !down?.type.startsWith('mouse') || !(down.buttons & 1) ||
            gesture.flyout_ || block.isShadow() || !target?.blocks.getBlock(block.id)) return;
        const source = workspace.getInjectionDiv().ownerDocument as Document;
        const stage = vm.runtime.getTargetForStage();
        blocks.Events.fireNow_();
        const root = block.getRootBlock().id;

        const listeners = new AbortController();
        clearDrag = () => {
            listeners.abort();
            onDragDisposed.delete(dragger);
            clearDrag = undefined;
        };
        onDragDisposed.set(dragger, clearDrag);
        const capture = {capture: true, signal: listeners.signal};
        const documents = new Set([source, ...Array.from(destinations, item => item.element.ownerDocument)]);
        for (const document of documents) {
            document.addEventListener('mousemove', event => {
                const host = document.defaultView;
                const {clientX, clientY, screenX, screenY} = event;
                if (host && clientX >= 0 && clientY >= 0 && clientX < host.innerWidth && clientY < host.innerHeight) {
                    windowOffsets.set(host, {x: screenX - clientX - host.screenX, y: screenY - clientY - host.screenY});
                }
            }, capture);
            document.addEventListener('keydown', event => {
                if (event.key !== 'Escape') return;
                clearDrag?.();
                if (workspace.currentGesture_ !== gesture || gesture.blockDragger_ !== dragger) return;
                event.preventDefault();
                finishAtSource(blocks, workspace, gesture, blocks.Events.getGroup());
            }, capture);
            document.addEventListener('mouseup', event => {
                if (event.button !== 0) return;
                clearDrag?.();
                if (workspace.currentGesture_ !== gesture || gesture.blockDragger_ !== dragger ||
                        vm.editingTarget !== target || vm.runtime.getTargetById(target.id) !== target ||
                        vm.runtime.getTargetForStage() !== stage) return;

                for (const destination of destinations) {
                    const element = destination.element;
                    const point = windowPoint(event, document, element.ownerDocument);
                    if (!point || !current(destination) ||
                        !element.contains(element.ownerDocument.elementFromPoint(point.x, point.y))) continue;
                    const position = positionIn(destination, point);
                    if (!position) continue;
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    finishAtSource(blocks, workspace, gesture, blocks.Events.getGroup());
                    try {
                        const script = exportScript(vm, target, root);
                        let record: ReturnType<typeof prepareImport>;
                        void importScriptWithReceipt(vm, destination.target, script, {
                            position,
                            canCommit: () => current(destination) && vm.runtime.getTargetForStage() === stage,
                            beforeCommit: () => { record = prepareImport(destination.target); },
                            onCommitted: receipt => record(receipt)
                        }).catch(onError);
                    } catch (error) {
                        onError(error);
                    }
                    return;
                }

                const host = source.defaultView;
                if (document !== source || (host && (event.clientX < 0 || event.clientX >= host.innerWidth ||
                        event.clientY < 0 || event.clientY >= host.innerHeight))) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    finishAtSource(blocks, workspace, gesture, blocks.Events.getGroup());
                }
            }, capture);
        }
    });

    return {
        register(destination: Destination) {
            destinations.add(destination);
            return () => destinations.delete(destination);
        },
        dispose() {
            disposed = true;
            clearDrag?.();
            sources.delete(workspace);
            destinations.clear();
        }
    };
}
