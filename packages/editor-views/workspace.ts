import type {CodeTarget} from './history.ts';

// Keep VM identity and workspace lifetime separate from the lifetime of a floating window.
interface CodeSession {
    bridge: ReturnType<typeof attachCodeWorkspace> | null;
    subscribe(listener: () => void): () => void;
    changed(): void;
}
const sessions = new WeakMap<object, CodeSession>();

export function getCodeSession(vm: object) {
    let session = sessions.get(vm);
    if (!session) {
        const listeners = new Set<() => void>();
        session = {
            bridge: null,
            subscribe(listener) {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
            changed() {
                for (const listener of listeners) listener();
            }
        };
        sessions.set(vm, session);
    }
    return session;
}

const withoutEvents = (blocks, action) => {
    blocks.Events.disable();
    try {
        return action();
    } finally {
        blocks.Events.enable();
    }
};

function targetXml(vm: {runtime: {getTargetForStage(): CodeTarget}}, target: CodeTarget) {
    const stage = vm.runtime.getTargetForStage();
    const globals = Object.values(stage.variables).map(variable => variable.toXML());
    const locals = target === stage ? [] : Object.values(target.variables).map(variable => variable.toXML(true));
    const comments = Object.values(target.comments).filter(comment => comment.blockId === null)
        .map(comment => comment.toXML());
    return `<xml xmlns="http://www.w3.org/1999/xhtml"><variables>${globals.join('')}${locals.join('')}</variables>` +
        `${comments.join('')}${target.blocks.toXML(target.comments)}</xml>`;
}

export function attachCodeWorkspace({vm, ScratchBlocks: blocks, workspace, options, onError}) {
    const session = getCodeSession(vm);
    const histories = new WeakMap();
    const signature = target => target.blocks.toXML(target.comments);
    let loadedTarget = vm.editingTarget;
    let loadedSignature = loadedTarget && signature(loadedTarget);
    let pendingFrame = null;

    function changed() {
        if (pendingFrame !== null) return;
        pendingFrame = requestAnimationFrame(() => {
            pendingFrame = null;
            session.changed();
        });
    }

    function flush() {
        workspace.cancelCurrentGesture();
        blocks.hideChaff();
        blocks.Events.fireNow_();
    }

    const bridge = {
        onError,
        prepareImport(target) {
            if (loadedTarget === target) flush();
            const before = signature(target);
            const stored = histories.get(target);
            const previous = loadedTarget === target && loadedSignature === before ? workspace.undoStack_.slice() :
                (stored?.signature === before ? stored.undo : []);
            return ({blockIds, rootBlockIds}) => {
                const group = crypto.randomUUID();
                const added = new Set(blockIds);
                const events = rootBlockIds.map(blockId => {
                    const xml = target.blocks.blockToXML(blockId, target.comments);
                    const root: Element = blocks.Xml.textToDom(`<xml>${xml}</xml>`).firstElementChild;
                    const ids = [blockId, ...Array.from(root.querySelectorAll('block[id], shadow[id]'),
                        child => child.id)].filter(id => added.has(id));
                    const event = blocks.Events.fromJson({type: 'create', blockId, xml, ids}, workspace);
                    // The pinned ScratchBlocks block decoder does not restore the event group.
                    event.group = group;
                    return event;
                });
                const history = {signature: signature(target), undo: [...previous, ...events], redo: []};
                histories.set(target, history);
                if (loadedTarget === target) {
                    loadedSignature = history.signature;
                    workspace.undoStack_ = history.undo.slice();
                    workspace.redoStack_ = [];
                }
            };
        },
        blockListener(event) {
            if (event.workspaceId !== workspace.id || !loadedTarget || vm.editingTarget !== loadedTarget ||
                vm.runtime.getEditingTarget() !== loadedTarget) return;
            vm.blockListener(event);
            if (event.recordUndo !== undefined && event.type !== 'ui') loadedSignature = signature(loadedTarget);
            changed();
        },
        beforeReload() {
            if (loadedTarget && vm.runtime.getTargetById(loadedTarget.id) === loadedTarget) {
                if (signature(loadedTarget) === loadedSignature) {
                    histories.set(loadedTarget, {signature: loadedSignature,
                        undo: workspace.undoStack_.slice(), redo: workspace.redoStack_.slice()});
                } else {
                    histories.delete(loadedTarget);
                }
            }
        },
        load: action => withoutEvents(blocks, action),
        afterReload() {
            loadedTarget = vm.editingTarget;
            loadedSignature = loadedTarget && signature(loadedTarget);
            const history = histories.get(loadedTarget);
            if (history && history.signature === loadedSignature) {
                workspace.undoStack_ = history.undo.slice();
                workspace.redoStack_ = history.redo.slice();
            }
            changed();
        },
        select(target) {
            if (vm.runtime.getTargetById(target.id) !== target) return false;
            if (target !== vm.editingTarget) {
                flush();
                vm.setEditingTarget(target.id);
            }
            return true;
        },
        preview(element, target) {
            const preview = withoutEvents(blocks, () => blocks.inject(element, {
                readOnly: true, scrollbars: false, sounds: false, media: options.media, rtl: options.rtl,
                colours: options.colours
            }));
            workspace.markFocused();
            let renderedXml;
            const resize = () => {
                blocks.svgResize(preview);
                const width = element.clientWidth;
                const height = element.clientHeight;
                if (!width || !height) return;
                const bounds = preview.getBlocksBoundingBox();
                // Preserve the existing coordinates when the whole preview already fits.
                const fits = bounds.x >= 0 && bounds.y >= 0 &&
                    bounds.x + bounds.width <= width && bounds.y + bounds.height <= height;
                const padding = Math.min(16, width / 4, height / 4);
                const scale = fits ? 1 : Math.min(1,
                    (width - 2 * padding) / Math.max(1, bounds.width),
                    (height - 2 * padding) / Math.max(1, bounds.height));
                // setScale hides Blockly widgets globally, including those in the active editor.
                preview.scale = scale;
                const x = fits ? 0 : (width - bounds.width * scale) / 2 - bounds.x * scale;
                const y = fits ? 0 : (height - bounds.height * scale) / 2 - bounds.y * scale;
                preview.translate(x, y);
            };
            const observer = new ResizeObserver(resize);
            observer.observe(element);
            return {
                workspace: preview,
                update() {
                    if (vm.runtime.getTargetById(target.id) !== target) return;
                    const xml = targetXml(vm, target);
                    if (renderedXml === xml) return;
                    try {
                        withoutEvents(blocks, () => blocks.Xml.clearWorkspaceAndLoadFromXml(
                            blocks.Xml.textToDom(xml), preview));
                        renderedXml = xml;
                        resize();
                    } catch (error) {
                        onError(error);
                    }
                },
                dispose() {
                    observer.disconnect();
                    withoutEvents(blocks, () => preview.dispose());
                }
            };
        },
        dispose() {
            if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
            if (session.bridge === bridge) {
                session.bridge = null;
                session.changed();
            }
            vm.runtime.removeListener('PROJECT_CHANGED', changed);
        }
    };

    session.bridge = bridge;
    vm.runtime.on('PROJECT_CHANGED', changed);
    changed();
    return bridge;
}
