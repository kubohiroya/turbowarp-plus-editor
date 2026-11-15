import {attachBlockDrag} from './block-drag.ts';
import {workspaceXML, type CodeTarget} from './history.ts';
import {removeObsoleteProcedureInputs} from './procedure-edits.ts';
import {decodeEdit, encodeEdit, isCommentEdit} from './protocol.ts';
import {captureCodePreviewChrome} from './preview-chrome.ts';
import type {PresentationElements} from './preview-chrome.ts';
import {attachScriptView, getDockedScriptLayout, type ScriptView} from './script-layout-view.ts';

export type AttachPreviewMinimap = (workspace, ScratchBlocks, watermark: HTMLElement) => {dispose(): void};

// Keep VM identity and workspace lifetime separate from the lifetime of a floating window.
interface Presentation {
    scale: number;
    x: number;
    y: number;
    visible: boolean;
    scriptView?: ScriptView;
    chrome: ReturnType<typeof captureCodePreviewChrome>;
}

interface CodeSession {
    frontView: {target: object; mount: HTMLElement; presentation?: Presentation} | null;
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
            frontView: null,
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

export function attachCodeWorkspace({vm, ScratchBlocks: blocks, workspace, options, onError, presentationElements = null as PresentationElements | null}) {
    const session = getCodeSession(vm);
    const homeDocument: Document = workspace.getInjectionDiv().ownerDocument;
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

    function capturePresentation({preserveViewport = false, includeNavigation = true} = {}): Presentation | undefined {
        const metrics = workspace.getMetrics();
        if (!metrics || !loadedTarget) return;
        const area = workspace.getParentSvg().getBoundingClientRect();
        const roots = workspace.getTopBlocks(false);
        const visible = preserveViewport || !roots.length || roots.some(block => {
            const bounds = block.getSvgRoot()?.getBoundingClientRect();
            return bounds && bounds.left < area.right && bounds.right > area.left + metrics.absoluteLeft &&
                bounds.top < area.bottom && bounds.bottom > area.top + metrics.absoluteTop;
        });
        return {
            scale: workspace.scale,
            x: workspace.scrollX + metrics.absoluteLeft,
            y: workspace.scrollY + metrics.absoluteTop,
            visible,
            scriptView: getDockedScriptLayout(vm)?.view.view,
            chrome: captureCodePreviewChrome(workspace, loadedTarget, presentationElements, includeNavigation)
        };
    }

    function rememberView() {
        const {frontView} = session;
        if (!frontView || frontView.target !== loadedTarget ||
                !frontView.mount?.contains(workspace.getInjectionDiv())) return;
        const presentation = capturePresentation();
        if (presentation) frontView.presentation = presentation;
    }

    let parentFrame = null;
    // Show edits made in a function editor in the code area when it displays the same target.
    function refreshParent(target) {
        if (parentFrame !== null) return;
        parentFrame = requestAnimationFrame(() => {
            parentFrame = null;
            if (vm.editingTarget !== target || vm.runtime.getTargetById(target.id) !== target) return;
            withoutEvents(blocks, () => vm.emit('workspaceUpdate', {xml: workspaceXML(vm, target)}));
        });
    }

    const bridge = {
        onError,
        capturePane(targetId: string) {
            if (loadedTarget?.id === targetId) return capturePresentation({preserveViewport: true, includeNavigation: false});
        },
        restorePane(targetId: string, presentation: Presentation) {
            const injection = workspace.getInjectionDiv();
            if (loadedTarget?.id !== targetId || !injection.clientWidth || !injection.clientHeight) return;
            blocks.svgResize(workspace);
            workspace.setScale(presentation.scale);
            const metrics = workspace.getMetrics();
            if (!metrics) return;
            workspace.scrollbar.set(metrics.absoluteLeft - presentation.x - metrics.contentLeft,
                metrics.absoluteTop - presentation.y - metrics.contentTop);
        },
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
            if (loadedTarget !== vm.editingTarget) rememberView();
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
        select(view) {
            const {target} = view;
            if (vm.runtime.getTargetById(target.id) !== target) return false;
            if (target !== vm.editingTarget) {
                flush();
                vm.setEditingTarget(target.id);
            } else if (session.frontView !== view) {
                rememberView();
                flush();
            }
            if (session.frontView !== view) getDockedScriptLayout(vm)?.view.setView(view.presentation?.scriptView ?? 'free');
            return true;
        },
        preview(element, chrome, view) {
            const {target, presentation, attachMinimap, watermark, locale, onScriptViewChange, dropElement} = view;
            // ScratchBlocks injects into the document where its bundle was evaluated.
            // Initialize the read-only preview there, then move it into the popout.
            const staging = element.ownerDocument === homeDocument ? null : homeDocument.createElement('div');
            if (staging) homeDocument.body.appendChild(staging);
            let preview;
            try {
                preview = withoutEvents(blocks, () => blocks.inject(staging ?? element, {
                    readOnly: true, scrollbars: false, sounds: false, media: options.media, rtl: options.rtl,
                    colours: options.colours, grid: options.grid,
                    zoom: {startScale: presentation?.scale ?? options.zoom?.startScale}
                }));
                if (staging) element.appendChild(preview.getInjectionDiv());
            } finally {
                staging?.remove();
            }
            workspace.markFocused();
            presentation?.chrome?.mount(chrome);
            const minimap = attachMinimap?.(preview, blocks, watermark);
            const scriptView = attachScriptView({workspace: preview, ScratchBlocks: blocks, mount: chrome.parentElement,
                getLocale: () => locale ?? workspace.getInjectionDiv().ownerDocument.documentElement.lang,
                initialView: view.scriptView ?? presentation?.scriptView,
                onChange: next => {
                    if (presentation) presentation.scriptView = next;
                    onScriptViewChange?.(next);
                }, hasWorkspaceMenu: () => false});
            let renderedXml;
            const resize = () => {
                blocks.svgResize(preview);
                if (presentation?.visible) {
                    preview.scrollX = presentation.x;
                    preview.scrollY = presentation.y;
                    preview.translate(presentation.x, presentation.y);
                    return;
                }
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
            const unregister = blockDrag.register({element: dropElement, workspace: preview, target});
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
                    unregister();
                    observer.disconnect();
                    scriptView.dispose();
                    minimap?.dispose();
                    presentation?.chrome?.dispose();
                    withoutEvents(blocks, () => preview.dispose());
                }
            };
        },
        editProcedure(element: HTMLElement, {target, definitionId, editable}: {
            target: CodeTarget & {id: string}; definitionId: string; editable: boolean;
        }) {
            return attachProcedureEditor({vm, blocks, workspace, options, onError, homeDocument,
                element, target, definitionId, editable, refreshParent});
        },
        dispose() {
            blockDrag.dispose();
            if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
            if (parentFrame !== null) cancelAnimationFrame(parentFrame);
            if (session.bridge === bridge) {
                session.bridge = null;
                session.changed();
            }
            vm.runtime.removeListener('PROJECT_CHANGED', changed);
        }
    };

    const blockDrag = attachBlockDrag({vm, workspace, ScratchBlocks: blocks, onError, prepareImport: bridge.prepareImport});
    session.bridge = bridge;
    vm.runtime.on('PROJECT_CHANGED', changed);
    changed();
    return bridge;
}

type ProcedureTarget = CodeTarget & {
    id: string;
    blocks: CodeTarget['blocks'] & {
        _blocks: Record<string, {topLevel?: boolean}>;
        blockToXML(id: string, comments: CodeTarget['comments']): string;
        blocklyListen(event: object): void;
    };
};

/**
 * An editor of one custom block definition script, for the functions section of a sprite tab.
 * It shares this page's ScratchBlocks, so extension blocks and field editors work as in the code area.
 * Edits go straight to the target's blocks, and edits made anywhere else reload it.
 * The definition hat cannot be moved or deleted here: moving it would rearrange the code area, and
 * deleting it would leave the calls in other scripts without a definition.
 */
function attachProcedureEditor({vm, blocks, workspace, options, onError, homeDocument, element, target: codeTarget,
    definitionId, editable, refreshParent}) {
    const target = codeTarget as ProcedureTarget;
    const document: Document = element.ownerDocument;
    const staging = document === homeDocument ? null : homeDocument.createElement('div');
    if (staging) homeDocument.body.appendChild(staging);
    let editor;
    try {
        // An editable workspace gets the default categories when it has no toolbox, and any toolbox, even an
        // empty one, gets a flyout over the script. This editor has no palette, so it takes neither.
        const defaultToolbox = blocks.Blocks.defaultToolbox;
        blocks.Blocks.defaultToolbox = null;
        try {
            editor = withoutEvents(blocks, () => blocks.inject(staging ?? element, {
                readOnly: !editable, scrollbars: true, sounds: false, comments: true, trashcan: false,
                media: options.media, rtl: options.rtl, colours: options.colours, grid: options.grid,
                zoom: {...options.zoom, controls: true}
            }));
        } finally {
            blocks.Blocks.defaultToolbox = defaultToolbox;
        }
        if (staging) element.appendChild(editor.getInjectionDiv());
    } finally {
        staging?.remove();
    }
    // Injecting focuses the new workspace; the GUI keeps reading the code area as the main one.
    workspace.markFocused();

    const exists = () => vm.runtime.getTargetById(target.id) === target;
    // Scripts pulled out of the definition here stay in view until this editor closes.
    const detached = new Set<string>();
    const roots = () => [definitionId, ...detached].filter(id => id === definitionId ? target.blocks._blocks[id] :
        target.blocks._blocks[id]?.topLevel);
    function xml() {
        const stage: CodeTarget = vm.runtime.getTargetForStage();
        const globals = Object.values(stage.variables).map(variable => variable.toXML());
        const locals = target.isStage ? [] : Object.values(target.variables).map(variable => variable.toXML(true));
        return `<xml xmlns="http://www.w3.org/1999/xhtml"><variables>${globals.join('')}${locals.join('')}</variables>` +
            roots().map(id => target.blocks.blockToXML(id, target.comments)).join('') + '</xml>';
    }

    let rendered: string | undefined;
    let positioned = false;
    function position() {
        const definition = editor.getBlockById(definitionId);
        const metrics = editor.getMetrics();
        if (!definition || !metrics?.viewWidth || !metrics.viewHeight) return false;
        // Put the hat at the top left whatever its place in the code area.
        const {x, y} = definition.getRelativeToSurfaceXY();
        const padding = 16;
        editor.scrollbar.set(x * editor.scale - metrics.contentLeft - padding,
            y * editor.scale - metrics.contentTop - padding);
        return true;
    }
    function load() {
        if (!exists() || !target.blocks._blocks[definitionId]) return;
        const next = xml();
        if (next === rendered) return;
        const {scrollX, scrollY} = editor;
        try {
            withoutEvents(blocks, () => blocks.Xml.clearWorkspaceAndLoadFromXml(blocks.Xml.textToDom(next), editor));
        } catch (error) {
            onError(error);
            return;
        }
        rendered = next;
        const definition = editor.getBlockById(definitionId);
        if (definition) {
            definition.setMovable(false);
            definition.setDeletable(false);
            // Its menu edits the block's inputs, which needs the callers that live in other scripts.
            definition.contextMenu = false;
        }
        editor.clearUndo();
        if (positioned) {
            editor.scrollX = scrollX;
            editor.scrollY = scrollY;
            editor.resize();
        } else positioned = position();
    }

    let frame: number | undefined;
    const view = document.defaultView;
    function scheduleLoad() {
        if (frame !== undefined) return;
        frame = view.requestAnimationFrame(() => {
            frame = undefined;
            if (editor.isDragging()) scheduleLoad();
            else load();
        });
    }

    editor.addChangeListener(event => {
        if (!editable || !exists()) return;
        const edit = decodeEdit(encodeEdit(event));
        if (!edit) return;
        // The VM files comments under the editing target, whatever blocks container receives them.
        if (isCommentEdit(edit) && vm.runtime.getEditingTarget() !== target) {
            rendered = undefined;
            scheduleLoad();
            return;
        }
        try {
            target.blocks.blocklyListen(edit);
            if (edit.type === 'change' && edit.element === 'mutation') {
                removeObsoleteProcedureInputs(target.blocks, new Set([edit.blockId]));
            }
        } catch (error) {
            onError(error);
            rendered = undefined;
            scheduleLoad();
            return;
        }
        if ((edit.type === 'create' || edit.type === 'move') && edit.blockId !== definitionId &&
            target.blocks._blocks[edit.blockId]?.topLevel) detached.add(edit.blockId);
        rendered = xml();
        refreshParent(target);
    });

    const observer = new view.ResizeObserver(() => {
        if (!element.clientWidth || !element.clientHeight) return;
        blocks.svgResize(editor);
        if (!positioned) positioned = position();
    });
    observer.observe(element);
    // A click elsewhere in the GUI gives the code area back its place as the main workspace,
    // which the GUI and the project search read through ScratchBlocks.getMainWorkspace().
    const releaseFocus = (event: Event) => {
        const node = event.target as Element;
        if (blocks.mainWorkspace !== editor || element.contains(node) ||
            node?.closest?.('.blocklyWidgetDiv, .blocklyDropDownDiv')) return;
        workspace.markFocused();
    };
    document.addEventListener('pointerdown', releaseFocus, true);
    vm.runtime.on('PROJECT_CHANGED', scheduleLoad);
    load();

    // In a modal dialog the rest of the page is inert, including the text and dropdown editors
    // ScratchBlocks keeps in the body. Lend them to the dialog, which covers the viewport so their
    // page coordinates still line up, as the block definition dialog does.
    const modal = element.closest('dialog');
    const popups = modal ? [blocks.WidgetDiv?.DIV, blocks.DropDownDiv?.DIV_].filter(Boolean) as HTMLElement[] : [];
    const lent = popups.map(popup => ({popup, parent: popup.parentNode}));
    for (const popup of popups) modal.appendChild(popup);

    return {
        workspace: editor,
        dispose() {
            observer.disconnect();
            document.removeEventListener('pointerdown', releaseFocus, true);
            vm.runtime.removeListener('PROJECT_CHANGED', scheduleLoad);
            if (frame !== undefined) view.cancelAnimationFrame(frame);
            if (blocks.mainWorkspace === editor) {
                blocks.hideChaff();
                workspace.markFocused();
            }
            if (lent.length) {
                blocks.WidgetDiv.hide?.(true);
                blocks.DropDownDiv.hideWithoutAnimation?.();
                for (const {popup, parent} of lent) (parent ?? homeDocument.body).appendChild(popup);
            }
            withoutEvents(blocks, () => editor.dispose());
        }
    };
}
