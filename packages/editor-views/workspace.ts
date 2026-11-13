import type {CodeTarget} from './history.ts';
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
            const {target, presentation, attachMinimap, watermark, locale, onScriptViewChange} = view;
            const preview = withoutEvents(blocks, () => blocks.inject(element, {
                readOnly: true, scrollbars: false, sounds: false, media: options.media, rtl: options.rtl,
                colours: options.colours, grid: options.grid,
                zoom: {startScale: presentation?.scale ?? options.zoom?.startScale}
            }));
            workspace.markFocused();
            presentation?.chrome?.mount(chrome);
            const minimap = attachMinimap?.(preview, blocks, watermark);
            const scriptView = attachScriptView({workspace: preview, mount: chrome.parentElement,
                getLocale: () => locale ?? workspace.getInjectionDiv().ownerDocument.documentElement.lang,
                initialView: view.scriptView ?? presentation?.scriptView,
                onChange: next => {
                    if (presentation) presentation.scriptView = next;
                    onScriptViewChange?.(next);
                }, passive: true});
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
                    scriptView.dispose();
                    minimap?.dispose();
                    presentation?.chrome?.dispose();
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
