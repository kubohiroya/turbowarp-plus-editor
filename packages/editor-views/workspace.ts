import {attachBlockDrag} from './block-drag.ts';
import {workspaceXML, type CodeTarget} from './history.ts';
import {isFoldedDefinition, removeObsoleteProcedureInputs, setFoldedDefinition} from './procedure-edits.ts';
import {decodeEdit, encodeEdit, isCommentEdit} from './protocol.ts';
import {captureCodePreviewChrome} from './preview-chrome.ts';
import type {PresentationElements} from './preview-chrome.ts';
import {attachScriptView, getDockedScriptLayout, type ScriptView} from './script-layout-view.ts';

export type AttachPreviewMinimap = (workspace, ScratchBlocks, watermark: HTMLElement) => {dispose(): void};
/** Adds the code area's zoom buttons and minimap to another workspace. */
export type AttachWorkspaceNavigation = (workspace, ScratchBlocks) => {dispose(): void} | undefined;

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

type MeasuredField = {textElement_?: {textContent?: string | null} | null; size_?: {width: number}};
type MeasuredBlock = {
    rendered?: boolean;
    inputList: {fieldRow: MeasuredField[]}[];
    getRootBlock(): MeasuredBlock;
    getDescendants(ordered: boolean): MeasuredBlock[];
    render(bubble?: boolean): void;
};

/**
 * Lay out again the blocks a workspace drew while it was not displayed. ScratchBlocks measures text with the
 * SVG it draws, which reads as no width in a hidden container, and keeps that width: labels then overlap and
 * blocks shrink. Children are laid out before their parents, so each parent takes their new size.
 * Returns whether anything was laid out again.
 */
/** The variables of a target and one of its scripts, as `targetXml` gives all of them. */
function scriptXml(vm: {runtime: {getTargetForStage(): CodeTarget}}, target: CodeTarget, id: string) {
    const stage = vm.runtime.getTargetForStage();
    const globals = Object.values(stage.variables).map(variable => variable.toXML());
    const locals = target === stage ? [] : Object.values(target.variables).map(variable => variable.toXML(true));
    return `<xml xmlns="http://www.w3.org/1999/xhtml"><variables>${globals.join('')}${locals.join('')}</variables>` +
        `${(target.blocks as unknown as {blockToXML(id: string, comments: object): string}).blockToXML(id, target.comments)}</xml>`;
}

export function remeasureHiddenFields(workspace: {getAllBlocks(ordered: boolean): MeasuredBlock[]}) {
    const unmeasured = (field: MeasuredField) => Boolean(field.textElement_?.textContent) && field.size_?.width === 0;
    const roots = new Set<MeasuredBlock>();
    for (const block of workspace.getAllBlocks(false)) {
        if (block.rendered && block.inputList.some(input => input.fieldRow.some(unmeasured))) roots.add(block.getRootBlock());
    }
    for (const root of roots) {
        for (const block of root.getDescendants(false).reverse()) {
            for (const input of block.inputList) {
                for (const field of input.fieldRow) if (field.size_ && field.textElement_) field.size_.width = 0;
            }
            if (block.rendered) block.render(false);
        }
    }
    return roots.size > 0;
}

function targetXml(vm: {runtime: {getTargetForStage(): CodeTarget}}, target: CodeTarget) {
    const stage = vm.runtime.getTargetForStage();
    const globals = Object.values(stage.variables).map(variable => variable.toXML());
    const locals = target === stage ? [] : Object.values(target.variables).map(variable => variable.toXML(true));
    const comments = Object.values(target.comments).filter(comment => comment.blockId === null)
        .map(comment => comment.toXML());
    return `<xml xmlns="http://www.w3.org/1999/xhtml"><variables>${globals.join('')}${locals.join('')}</variables>` +
        `${comments.join('')}${target.blocks.toXML(target.comments)}</xml>`;
}

const svgNamespace = 'http://www.w3.org/2000/svg';
const foldMarkAttribute = 'data-tw-plus-folded-mark';

type StackBlock = {
    id: string;
    workspace?: unknown;
    isInFlyout?: boolean;
    previousConnection?: unknown;
    outputConnection?: unknown;
    nextConnection?: {setHidden(hidden: boolean): void} | null;
    height?: number;
    width?: number;
    comment?: {bubble_?: {bubbleGroup_?: SVGElement}} | null;
    getSvgRoot(): SVGGElement | null;
    getParent(): StackBlock | null;
    getNextBlock(): StackBlock | null;
    getDescendants(ordered: boolean): StackBlock[];
    setConnectionsHidden(hidden: boolean): void;
    getColour?(): string;
    getColourTertiary?(): string;
};

/** Marks the workspace methods the one-script mode puts in place, so a later attachment can take them away. */
const focusOverride = Symbol('tw-plus-focus-override');

/** Hide an element of the workspace in a way ScratchBlocks does not undo (see script-layout.css). */
const setElementHidden = (element: Element | null | undefined, hidden: boolean) => element?.toggleAttribute('data-tw-plus-hidden', hidden);
const isElementHidden = (element: Element | null | undefined) => Boolean(element?.hasAttribute('data-tw-plus-hidden'));

const isHatBlock = (block: StackBlock) => !block.previousConnection && !block.outputConnection;

function setCommentsHidden(block: StackBlock, hidden: boolean) {
    for (const item of block.getDescendants(false)) {
        setElementHidden(item.comment?.bubble_?.bubbleGroup_, hidden);
    }
}

/**
 * Show a hat without the rest of its script, with a “Folded” mark below it, or show the whole script again.
 * The body stays in the workspace, so editing a function still updates its calls there; it is only hidden
 * and cannot be snapped to. `onUnfold` makes the mark a button.
 */
function paintFold(hat: StackBlock, folded: boolean, label: string, onUnfold?: () => void) {
    const root = hat.getSvgRoot();
    const body = hat.getNextBlock();
    const mark = root?.querySelector(`:scope > [${foldMarkAttribute}]`);
    if (!folded || !body || !root) {
        mark?.remove();
        if (isElementHidden(body?.getSvgRoot())) {
            setElementHidden(body.getSvgRoot(), false);
            body.setConnectionsHidden(false);
            setCommentsHidden(body, false);
            hat.nextConnection?.setHidden(false);
        }
        return;
    }
    setElementHidden(body.getSvgRoot(), true);
    body.setConnectionsHidden(true);
    setCommentsHidden(body, true);
    hat.nextConnection?.setHidden(true);
    if (mark) mark.remove();
    const document = root.ownerDocument;
    const group = document.createElementNS(svgNamespace, 'g');
    group.setAttribute(foldMarkAttribute, '');
    group.setAttribute('transform', `translate(0, ${hat.height ?? 48})`);
    const width = Math.max(120, Math.min(hat.width ?? 120, 220));
    const back = document.createElementNS(svgNamespace, 'rect');
    for (const [name, value] of Object.entries({width, height: 28, rx: 4, fill: hat.getColour?.() ?? '#888',
        stroke: hat.getColourTertiary?.() ?? '#666', 'fill-opacity': 0.6, 'stroke-dasharray': '4 3'})) {
        back.setAttribute(name, String(value));
    }
    const text = document.createElementNS(svgNamespace, 'text');
    text.setAttribute('class', 'blocklyText');
    text.setAttribute('x', '12');
    text.setAttribute('y', '18');
    text.textContent = `▸ ${label}`;
    group.append(back, text);
    if (onUnfold) {
        group.setAttribute('role', 'button');
        group.style.cursor = 'pointer';
        // The mark sits in the hat's group; pressing it must not start dragging the hat.
        for (const type of ['mousedown', 'pointerdown', 'touchstart']) group.addEventListener(type, event => event.stopPropagation());
        group.addEventListener('click', event => {
            event.stopPropagation();
            onUnfold();
        });
    }
    root.appendChild(group);
}

/**
 * Folding and the one-script mode of the code area.
 *
 * A hat whose script is folded (`tw-plus-folded` in its mutation, as the script editors save it) shows only the
 * hat and a mark that unfolds it. In the one-script mode the code area shows a single hat or function and what is
 * made or pulled out there; the other scripts and the workspace comments stay in the workspace, hidden, with no
 * connections to snap to and outside the scroll area. Both are painted again after every reload of the workspace.
 */
const visibilities = new WeakMap<object, {dispose(): void}>();

function attachScriptVisibility({vm, blocks, workspace, homeDocument, onError}) {
    // The GUI can attach the code area again without letting go of the earlier attachment; only the latest paints.
    visibilities.get(workspace)?.dispose();
    const japanese = () => /^ja(?:-|$)/i.test(blocks.ScratchMsgs?.currentLocale_ ?? homeDocument.documentElement.lang ?? '');
    const labels = () => japanese() ? {fold: '折りたたみ', unfold: '折りたたみを解除', folded: '折りたたみ中'} :
        {fold: 'Fold', unfold: 'Unfold', folded: 'Folded'};
    const vmBlock = (id: string) => vm.editingTarget?.blocks._blocks[id];
    const isFolded = (block: StackBlock) => isHatBlock(block) && isFoldedDefinition(vmBlock(block.id));

    let focus: {id: string; extras: Set<string>; onLost?: () => void} | undefined;
    // The GUI can attach the code area again; what an earlier attachment left on the workspace is not its own.
    const own = (name: string) => Object.prototype.hasOwnProperty.call(workspace, name) && !workspace[name][focusOverride] ?
        workspace[name] : undefined;
    const ownBoundingBox = own('getBlocksBoundingBox');
    const ownCleanUp = own('cleanUp');
    if (workspace.getBlocksBoundingBox?.[focusOverride] || workspace.cleanUp?.[focusOverride]) restoreWorkspaceMethods();
    const shown = (block: StackBlock) => !focus || block.id === focus.id || focus.extras.has(block.id);

    function restoreWorkspaceMethods() {
        if (ownBoundingBox) workspace.getBlocksBoundingBox = ownBoundingBox;
        else delete workspace.getBlocksBoundingBox;
        if (ownCleanUp) workspace.cleanUp = ownCleanUp;
        else delete workspace.cleanUp;
    }

    function paint() {
        if (focus && !vmBlock(focus.id)) {
            const {onLost} = focus;
            setFocus(undefined);
            onLost?.();
            return;
        }
        for (const top of workspace.getTopBlocks(false) as StackBlock[]) {
            const visible = shown(top);
            setElementHidden(top.getSvgRoot(), !visible);
            top.setConnectionsHidden(!visible);
            setCommentsHidden(top, !visible);
            if (visible) paintFold(top, isFolded(top), labels().folded, () => fold(top.id, false));
        }
        for (const comment of workspace.getTopComments?.(false) ?? []) {
            setElementHidden(comment.getSvgRoot?.(), Boolean(focus));
        }
    }

    function safePaint() {
        try {
            paint();
        } catch (error) {
            onError(error);
        }
    }

    // The GUI redraws the workspace on several paths; paint again whenever scripts are added to the canvas.
    // A block dragged in from the palette is painted once the drag ends, when it has been counted.
    const view = homeDocument.defaultView;
    let frame: number | undefined;
    function schedulePaint() {
        if (frame !== undefined) return;
        frame = view.requestAnimationFrame(() => {
            frame = undefined;
            if (workspace.isDragging?.()) return;
            safePaint();
            reveal();
        });
    }
    const canvasObserver = new view.MutationObserver(schedulePaint);
    // The VM takes in an edit after the workspace shows it, such as the deletion of the shown script.
    vm.runtime.on('PROJECT_CHANGED', schedulePaint);
    const observeCanvas = () => {
        const canvas = workspace.getCanvas?.();
        if (canvas) canvasObserver.observe(canvas, {childList: true});
    };
    observeCanvas();

    function fold(id: string, value: boolean) {
        const hat = vmBlock(id);
        if (!hat || isFoldedDefinition(hat) === value || workspace.options.readOnly) return;
        setFoldedDefinition(hat, value);
        vm.runtime.emitProjectChanged();
        safePaint();
    }

    /**
     * Put the shown script at the top left of the view, once the code area has its size there: the view it
     * moves into may only be laid out after the script was picked.
     */
    let revealPending = false;
    function reveal() {
        if (!revealPending) return;
        const block = focus && workspace.getBlockById(focus.id);
        const injection = workspace.getInjectionDiv();
        if (!block || !injection.clientWidth || !injection.clientHeight) return;
        // The scroll area follows the shown scripts, which may have changed since the scrollbars were sized.
        workspace.resize?.();
        const metrics = workspace.getMetrics?.();
        if (!metrics?.viewWidth || !metrics.viewHeight) return;
        revealPending = false;
        const {x, y} = block.getRelativeToSurfaceXY();
        const padding = 16;
        workspace.scrollbar?.set(x * workspace.scale - metrics.contentLeft - padding,
            y * workspace.scale - metrics.contentTop - padding);
    }

    function setFocus(next?: {id: string; onLost?: () => void}) {
        const changedScript = next?.id !== focus?.id;
        focus = next && {id: next.id, onLost: next.onLost, extras: changedScript ? new Set() : focus?.extras ?? new Set()};
        if (focus) {
            workspace.getBlocksBoundingBox = Object.assign(function () {
                let box: {left: number; top: number; right: number; bottom: number} | undefined;
                for (const top of this.getTopBlocks(false) as (StackBlock & {getBoundingRectangle()})[]) {
                    if (!shown(top)) continue;
                    const {topLeft, bottomRight} = top.getBoundingRectangle();
                    box = box ? {left: Math.min(box.left, topLeft.x), top: Math.min(box.top, topLeft.y),
                        right: Math.max(box.right, bottomRight.x), bottom: Math.max(box.bottom, bottomRight.y)} :
                        {left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y};
                }
                return box ? {x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top} :
                    {x: 0, y: 0, width: 0, height: 0};
            }, {[focusOverride]: true});
            // Cleaning up would also move the scripts that are not shown.
            workspace.cleanUp = Object.assign(() => undefined, {[focusOverride]: true});
        } else restoreWorkspaceMethods();
        safePaint();
        if (workspace.rendered && workspace.isVisible?.() !== false) workspace.resize?.();
        if (focus && changedScript) {
            revealPending = true;
            reveal();
            schedulePaint();
        }
    }

    // Blocks dragged in from the palette, or pulled out of the shown script, stay in view. Only the end of a
    // drag counts: a reload of the workspace also sends a create event for every block, after the load.
    const listener = event => {
        if (event.type !== 'endDrag') return;
        const block = focus && !event.isOutside ? workspace.getBlockById(event.blockId) as StackBlock | null : null;
        if (block && !block.getParent() && block.id !== focus.id) focus.extras.add(block.id);
        schedulePaint();
    };
    workspace.addChangeListener(listener);

    const prototype = blocks.BlockSvg.prototype;
    const showContextMenu = prototype.showContextMenu_;
    const patched = function (this: StackBlock & {customContextMenu?(options: unknown[]): void}, event) {
        if (this.workspace !== workspace || this.isInFlyout || this.getParent() || !isHatBlock(this) ||
            workspace.options.readOnly || (!this.getNextBlock() && !isFolded(this))) {
            return showContextMenu.call(this, event);
        }
        const owned = Object.prototype.hasOwnProperty.call(this, 'customContextMenu');
        const custom = this.customContextMenu;
        const folded = isFolded(this);
        const id = this.id;
        this.customContextMenu = function (options: {text: string; enabled: boolean; callback(): void}[]) {
            custom?.call(this, options);
            options.push({text: folded ? labels().unfold : labels().fold, enabled: true, callback: () => fold(id, !folded)});
        };
        try {
            return showContextMenu.call(this, event);
        } finally {
            if (owned) this.customContextMenu = custom;
            else delete this.customContextMenu;
        }
    };
    prototype.showContextMenu_ = patched;

    let disposed = false;
    const visibility = {
        paint: () => {
            if (!disposed) safePaint();
        },
        /** The code area has a size again, such as after moving to another view. */
        resized: () => {
            if (!disposed) reveal();
        },
        focus: (id?: string, onLost?: () => void) => {
            if (!disposed) setFocus(id ? {id, onLost} : undefined);
        },
        get focusedScript() { return focus?.id; },
        dispose() {
            if (disposed) return;
            disposed = true;
            if (visibilities.get(workspace) === visibility) visibilities.delete(workspace);
            workspace.removeChangeListener(listener);
            canvasObserver.disconnect();
            vm.runtime.removeListener('PROJECT_CHANGED', schedulePaint);
            if (frame !== undefined) view.cancelAnimationFrame(frame);
            if (prototype.showContextMenu_ === patched) prototype.showContextMenu_ = showContextMenu;
            if (focus) {
                focus = undefined;
                restoreWorkspaceMethods();
            }
        }
    };
    visibilities.set(workspace, visibility);
    return visibility;
}

/** Paint the folded scripts of a read-only workspace, such as the preview of a code view. */
function paintPreviewFolds(blocks, preview, target, label: string) {
    for (const top of preview.getTopBlocks(false) as StackBlock[]) {
        paintFold(top, isHatBlock(top) && isFoldedDefinition(target.blocks._blocks[top.id]), label);
    }
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

    // Function editors take the code area's palette, which the GUI replaces as the editing target changes.
    const toolboxListeners = new Set<() => void>();
    const updateToolbox = workspace.updateToolbox;
    workspace.updateToolbox = function (...args) {
        const result = updateToolbox.apply(this, args);
        for (const listener of toolboxListeners) listener();
        return result;
    };

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
            visibility.paint();
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
            const {target, presentation, attachMinimap, watermark, locale, onScriptViewChange, dropElement, scriptId} = view;
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
                    // A view that shows one script previews only that script.
                    const xml = scriptId && target.blocks._blocks[scriptId] ? scriptXml(vm, target, scriptId) : targetXml(vm, target);
                    if (renderedXml === xml) return;
                    try {
                        withoutEvents(blocks, () => blocks.Xml.clearWorkspaceAndLoadFromXml(
                            blocks.Xml.textToDom(xml), preview));
                        paintPreviewFolds(blocks, preview, target,
                            /^ja(?:-|$)/i.test(locale ?? homeDocument.documentElement.lang ?? '') ? '折りたたみ中' : 'Folded');
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
        /**
         * Show only one script in the code area, a hat or a function, or every script again without `id`.
         * `onLost` runs when that script is deleted.
         */
        focusScript(id?: string, onLost?: () => void) {
            visibility.focus(id, onLost);
        },
        get focusedScript() { return visibility.focusedScript; },
        createFunction(target: CodeTarget & {id: string}, kind: 'procedure' | 'named', name: string, {loadNamedFunctions}: {
            loadNamedFunctions?(): Promise<void>;
        } = {}) {
            return createFunctionDefinition({vm, blocks, workspace, target, kind, name, loadNamedFunctions,
                loadedTarget: () => loadedTarget, refreshParent});
        },
        editProcedure(element: HTMLElement, {target, definitionId, editable, attachNavigation, locale = '', focusBlock}: {
            target: CodeTarget & {id: string}; definitionId: string; editable: boolean;
            attachNavigation?: AttachWorkspaceNavigation; locale?: string; focusBlock?: string;
        }) {
            return attachProcedureEditor({vm, blocks, workspace, options, onError, homeDocument, element, target,
                definitionId, editable, attachNavigation, toolboxListeners, refreshParent, locale, focusBlock});
        },
        dispose() {
            blockDrag.dispose();
            shown?.disconnect();
            visibility.dispose();
            if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
            if (parentFrame !== null) cancelAnimationFrame(parentFrame);
            if (workspace.updateToolbox !== updateToolbox) workspace.updateToolbox = updateToolbox;
            if (session.bridge === bridge) {
                session.bridge = null;
                session.changed();
            }
            vm.runtime.removeListener('PROJECT_CHANGED', changed);
        }
    };

    // The code area loads the editing target's scripts while another section covers it, such as after a function
    // is added from the functions sections; lay them out again once it shows.
    const injection = workspace.getInjectionDiv();
    const view = injection.ownerDocument.defaultView;
    const shown = typeof view?.ResizeObserver === 'function' ? new view.ResizeObserver(() => {
        if (!injection.clientWidth || !injection.clientHeight) return;
        withoutEvents(blocks, () => remeasureHiddenFields(workspace));
        visibility.resized();
    }) : null;
    shown?.observe(injection);

    const blockDrag = attachBlockDrag({vm, workspace, ScratchBlocks: blocks, onError, prepareImport: bridge.prepareImport});
    const visibility = attachScriptVisibility({vm, blocks, workspace, homeDocument, onError});
    visibility.paint();
    session.bridge = bridge;
    vm.runtime.on('PROJECT_CHANGED', changed);
    changed();
    return bridge;
}

type ProcedureTarget = CodeTarget & {
    id: string;
    blocks: CodeTarget['blocks'] & {
        _blocks: Record<string, {topLevel?: boolean; mutation?: Record<string, unknown>}>;
        blockToXML(id: string, comments: CodeTarget['comments']): string;
        blocklyListen(event: object): void;
    };
};

const foldedBodyType = 'twplus_folded_body';

/** The mark below a folded hat: a statement that ends the stack and holds only its label. */
function registerFoldedBodyBlock(blocks) {
    blocks.Blocks[foldedBodyType] ??= {
        init() {
            this.jsonInit({
                message0: '%1', args0: [{type: 'field_label', name: 'LABEL', text: ''}],
                previousStatement: null, colour: '#9E9E9E', colourSecondary: '#8A8A8A', colourTertiary: '#757575'
            });
        }
    };
}

/**
 * An editor of one custom block definition script, for the functions section of a sprite tab.
 * It shares this page's ScratchBlocks, so extension blocks and field editors work as in the code area,
 * and it takes the code area's palette, zoom buttons and minimap, which show while the pointer is over it.
 * Edits go straight to the target's blocks, and edits made anywhere else reload it.
 * The definition hat cannot be moved or deleted here: moving it would rearrange the code area, and
 * deleting it would leave the calls in other scripts without a definition.
 */
function attachProcedureEditor({vm, blocks, workspace, options, onError, homeDocument, element, target: codeTarget,
    definitionId, editable, attachNavigation, toolboxListeners, refreshParent, locale, focusBlock}) {
    const target = codeTarget as ProcedureTarget;
    const document: Document = element.ownerDocument;
    // ScratchBlocks injects only into a container in its own document, and a tab may mount before it is shown.
    const staging = document === homeDocument && element.isConnected ? null : homeDocument.createElement('div');
    if (staging) homeDocument.body.appendChild(staging);
    // The palette is the code area's, which holds the editing target's blocks; a read-only editor has none.
    const palette = (): Node | null => editable && vm.editingTarget === codeTarget ?
        workspace.options.languageTree?.cloneNode(true) ?? null : null;
    let editor;
    try {
        // An editable workspace gets the default categories when it has no toolbox.
        const defaultToolbox = blocks.Blocks.defaultToolbox;
        blocks.Blocks.defaultToolbox = null;
        try {
            editor = withoutEvents(blocks, () => blocks.inject(staging ?? element, {
                readOnly: !editable, toolbox: palette() ?? undefined,
                scrollbars: true, sounds: false, comments: true, trashcan: false,
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

    function refreshPalette() {
        const tree = palette();
        if (tree && editor.toolbox_) editor.updateToolbox(tree);
    }
    if (editor.toolbox_) {
        // My Blocks lists every function of the target, as in the code area, not only the one shown here.
        const callbacks = {...editor.toolboxCategoryCallbacks_};
        const procedures = callbacks[blocks.PROCEDURE_CATEGORY_NAME];
        callbacks[blocks.PROCEDURE_CATEGORY_NAME] = flyoutWorkspace => vm.editingTarget === target ?
            blocks.Procedures.flyoutCategory(workspace) : procedures(flyoutWorkspace);
        editor.toolboxCategoryCallbacks_ = callbacks;
        toolboxListeners.add(refreshPalette);
    }
    // The zoom buttons and minimap show while the pointer is over the editor, as in the code area,
    // and so does the palette, which would otherwise sit over a single script all the time.
    element.setAttribute('data-code-hover-surface', '');
    element.setAttribute('data-hover-palette', '');
    let navigation: {dispose(): void} | undefined;
    try {
        navigation = attachNavigation?.(editor, blocks) ?? undefined;
    } catch (error) {
        onError(error);
    }

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

    // A script can be folded to its hat, with a mark below it that unfolds it when clicked.
    // The dialog, for working on the whole body, always shows it.
    const modal = element.closest('dialog');
    const foldable = !modal;
    const foldLabels = /^ja(?:-|$)/i.test(locale) ? {fold: '折りたたみ', unfold: '折りたたみを解除', folded: '折りたたみ中'} :
        {fold: 'Fold', unfold: 'Unfold', folded: 'Folded'};
    const foldedBodyId = `${definitionId}:tw-plus-folded`;
    const folded = () => foldable && isFoldedDefinition(target.blocks._blocks[definitionId]);
    function fold(value: boolean) {
        const hat = target.blocks._blocks[definitionId];
        if (!editable || !exists() || !hat || isFoldedDefinition(hat) === value) return;
        setFoldedDefinition(hat, value);
        vm.runtime.emitProjectChanged();
        // A click or menu choice is still being handled, so reload after it.
        scheduleLoad();
    }
    // Add-ons append items such as cut to every block menu; these blocks offer only folding.
    function offerOnly(block, option: {text: string; enabled: boolean; callback(): void}) {
        block.contextMenu = editable;
        block.customContextMenu = options => {
            options.splice(0, options.length, option);
        };
        // Shown as ScratchBlocks shows a menu, without ContextMenu.show, where add-ons append and decorate items.
        block.showContextMenu_ = function (event) {
            if (this.workspace.options.readOnly || !this.contextMenu) return;
            const {ContextMenu, WidgetDiv} = blocks;
            WidgetDiv.show(ContextMenu, this.RTL, null);
            const menu = ContextMenu.populate_([{...option, callback() {
                ContextMenu.hide();
                option.callback();
            }}], this.RTL);
            ContextMenu.position_(menu, event, this.RTL);
            setTimeout(() => menu.getElement()?.focus(), 1);
        };
    }
    const unfoldOption = {text: foldLabels.unfold, enabled: true, callback: () => fold(false)};
    function showFolded(hat) {
        withoutEvents(blocks, () => {
            hat.nextConnection?.targetBlock()?.dispose(false);
            registerFoldedBodyBlock(blocks);
            const mark = blocks.Xml.domToBlock(blocks.Xml.textToDom(
                `<xml><block type="${foldedBodyType}" id="${foldedBodyId}"></block></xml>`).firstElementChild, editor);
            mark.setFieldValue(foldLabels.folded, 'LABEL');
            mark.setMovable(false);
            mark.setDeletable(false);
            mark.setEditable(false);
            offerOnly(mark, unfoldOption);
            hat.nextConnection?.connect(mark.previousConnection);
        });
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
            // A definition's own menu edits its inputs, which needs the callers that live in other scripts.
            // Only folding is offered here, and the dialog offers nothing.
            if (foldable) offerOnly(definition, folded() ? unfoldOption :
                {text: foldLabels.fold, enabled: true, callback: () => fold(true)});
            else definition.contextMenu = false;
            if (folded()) showFolded(definition);
        }
        editor.clearUndo();
        if (positioned) {
            editor.scrollX = scrollX;
            editor.scrollY = scrollY;
            editor.resize();
        } else positioned = position();
        reveal();
    }

    // A block to show, such as a call picked in the list of a function's uses. A folded script unfolds for it,
    // and a hidden tab shows it once it is laid out.
    let pendingBlock: string | undefined = focusBlock;
    function reveal() {
        if (!pendingBlock || !element.clientWidth || !element.clientHeight) return;
        const block = editor.getBlockById(pendingBlock);
        if (!block) {
            if (folded() && target.blocks._blocks[pendingBlock]) fold(false);
            else pendingBlock = undefined;
            return;
        }
        pendingBlock = undefined;
        editor.centerOnBlock(block.id);
        block.select();
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
        if (event.type === 'ui' && event.element === 'click' && event.blockId === foldedBodyId) {
            fold(false);
            return;
        }
        const edit = decodeEdit(encodeEdit(event));
        if (!edit) return;
        // The folded mark stands for the body the VM still has: nothing may take its place under the hat.
        if (folded() && (edit.blockId === foldedBodyId || edit.newParentId === definitionId ||
            edit.newParentId === foldedBodyId)) {
            rendered = undefined;
            scheduleLoad();
            return;
        }
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
        // A tab may load its script before it is shown.
        withoutEvents(blocks, () => remeasureHiddenFields(editor));
        blocks.svgResize(editor);
        if (!positioned) positioned = position();
        reveal();
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
    const popups = modal ? [blocks.WidgetDiv?.DIV, blocks.DropDownDiv?.DIV_].filter(Boolean) as HTMLElement[] : [];
    const lent = popups.map(popup => ({popup, parent: popup.parentNode}));
    for (const popup of popups) modal.appendChild(popup);

    return {
        workspace: editor,
        showBlock(id: string) {
            pendingBlock = id;
            reveal();
        },
        dispose() {
            toolboxListeners.delete(refreshPalette);
            navigation?.dispose();
            element.removeAttribute('data-code-hover-surface');
            element.removeAttribute('data-hover-palette');
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

const namedFunctionsExtension = 'kubohiroyanamedfunctions';
const escapeXml = (text: string) => text.replace(/[<>&"']/g, character =>
    ({'<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'})[character]);

const createError = (message: string, code: 'duplicate' | 'invalid' | 'unavailable') => Object.assign(new Error(message), {code});

/**
 * Add a function definition of the name the functions section asked for. A Scratch custom block gets
 * that text and no arguments, which its own Edit dialog can add later; a named function starts from the
 * extension's palette entry with that name. A name another definition here already has is refused.
 * The definition goes into the target's blocks directly, so it does not depend on the code area being
 * shown, and the code area is reloaded when it shows this target. Resolves with the id of the new hat.
 */
async function createFunctionDefinition({vm, blocks, workspace, target: codeTarget, kind, name: asked, loadNamedFunctions,
    loadedTarget, refreshParent}) {
    const name = String(asked ?? '').replace(/\s+/g, ' ').trim();
    if (!name) throw createError('A function needs a name', 'invalid');
    const target = codeTarget as ProcedureTarget & {blocks: {_blocks: Record<string, {
        topLevel?: boolean; shadow?: boolean; x?: number; y?: number; opcode?: string;
        mutation?: {proccode?: string}; inputs?: Record<string, {block?: string}>; fields?: Record<string, {value?: unknown}>;
    }>}};
    const exists = () => vm.runtime.getTargetById(target.id) === target;
    const tops = () => Object.values(target.blocks._blocks).filter(block => block.topLevel && !block.shadow);
    // Below the scripts already there, in the code area's coordinates.
    function place() {
        const shown = loadedTarget() === target ? workspace : null;
        let x = Infinity;
        let bottom = -Infinity;
        for (const [id, block] of Object.entries(target.blocks._blocks)) {
            if (!block.topLevel || block.shadow) continue;
            x = Math.min(x, Number(block.x) || 0);
            const height = shown?.getBlockById(id)?.getHeightWidth?.().height;
            bottom = Math.max(bottom, (Number(block.y) || 0) + (height || 160));
        }
        return Number.isFinite(x) ? {x: Math.round(x), y: Math.round(bottom + 48)} : {x: 48, y: 48};
    }
    function insert(xml: string, id: string) {
        if (!exists()) throw new Error('The sprite was removed');
        target.blocks.blocklyListen({type: 'create', blockId: id, xml: {outerHTML: xml}});
        refreshParent(target);
        return id;
    }
    const id = blocks.utils.genUid();

    if (kind === 'procedure') {
        // %s, %n and %b would read as argument slots in the block text.
        if (/%[snb]/.test(name)) throw createError('The name reads as an argument', 'invalid');
        // Each definition has one prototype, so a prototype with this proccode means the block exists.
        if (Object.values(target.blocks._blocks).some(block =>
            block.opcode === 'procedures_prototype' && block.mutation?.proccode === name)) {
            throw createError('A block with this definition already exists', 'duplicate');
        }
        const {x, y} = place();
        return insert(`<block type="procedures_definition" id="${id}" x="${x}" y="${y}"><value name="custom_block">` +
            `<shadow type="procedures_prototype" id="${blocks.utils.genUid()}"><mutation proccode="${escapeXml(name)}" ` +
            `argumentids="[]" argumentnames="[]" argumentdefaults="[]" warp="false"></mutation></shadow></value></block>`, id);
    }

    if (!vm.extensionManager.isExtensionLoaded(namedFunctionsExtension)) {
        if (!loadNamedFunctions) throw Object.assign(new Error('named-functions is not loaded'), {code: 'unavailable'});
        await loadNamedFunctions();
        if (!vm.extensionManager.isExtensionLoaded(namedFunctionsExtension) || !exists()) {
            throw Object.assign(new Error('named-functions could not be loaded'), {code: 'unavailable'});
        }
    }
    // The palette entry has the defaults of the loaded version, including fields a newer one adds.
    const category = vm.runtime.getBlocksXML(target).find(entry => entry.id === namedFunctionsExtension);
    const palette = new DOMParser().parseFromString(category?.xml ?? '<xml/>', 'text/xml');
    const hat = [...palette.getElementsByTagName('block')]
        .find(block => block.getAttribute('type') === `${namedFunctionsExtension}_defineFunction`);
    if (!hat) throw Object.assign(new Error('named-functions has no define function block'), {code: 'unavailable'});
    const used = new Set(tops().filter(block => block.opcode === `${namedFunctionsExtension}_defineFunction`)
        .map(block => String(target.blocks._blocks[block.inputs?.NAME?.block]?.fields?.TEXT?.value ?? '').trim()));
    if (used.has(name)) throw createError('A named function with this name already exists', 'duplicate');
    const field = (name: string) => [...hat.children].find(child => child.getAttribute('name') === name)
        ?.getElementsByTagName('field')[0];
    const nameField = field('NAME');
    if (nameField) nameField.textContent = name;
    for (const name of ['DESCRIPTION', 'RETURNS']) {
        const text = field(name);
        if (text) text.textContent = '';
    }
    const schema = field('SCHEMA');
    if (schema) schema.textContent = '{"type":"object","properties":{}}';
    // Shadows from the palette carry no ids; the VM needs one for each block.
    for (const node of [hat, ...hat.querySelectorAll('block, shadow')]) {
        if (node !== hat && !node.getAttribute('id')) node.setAttribute('id', blocks.utils.genUid());
    }
    const {x, y} = place();
    hat.setAttribute('id', id);
    hat.setAttribute('x', String(x));
    hat.setAttribute('y', String(y));
    return insert(new XMLSerializer().serializeToString(hat), id);
}
