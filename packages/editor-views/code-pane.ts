import {getCodeSession} from './workspace.ts';
import type {AttachPreviewMinimap, AttachWorkspaceNavigation} from './workspace.ts';
import {getDockedScriptLayout, type ScriptView} from './script-layout-view.ts';

type Pane = {id: string; targetId: string; section: number};
type Bridge = NonNullable<ReturnType<typeof getCodeSession>['bridge']>;
type Presentation = NonNullable<ReturnType<Bridge['capturePane']>>;

export function createCodePaneAdapter(vm, locale: string, attachMinimap?: AttachPreviewMinimap) {
    const session = getCodeSession(vm);
    const label = /^ja(?:-|$)/i.test(locale) ? 'このペインでコードを編集' : 'Edit code in this pane';
    const views = new Map<string, ScriptView>();
    // Views that show one script, a hat or a function, by pane id; `onLost` runs when that script is deleted.
    const focused = new Map<string, {scriptId: string; onLost?: () => void}>();
    // The code pane the code area is in, which shows its script there.
    let current: string | undefined;
    const applyFocus = (paneId?: string) => {
        const focus = paneId === undefined ? undefined : focused.get(paneId);
        session.bridge?.focusScript(focus?.scriptId, focus && (() => focus.onLost?.()));
    };
    let pending: {frame: number; pane: Pane; presentation: Presentation} | undefined;
    // The GUI can attach the code area again, with a new bridge; the view it is in still shows its script.
    let attached = session.bridge;
    session.subscribe(() => {
        if (session.bridge === attached) return;
        attached = session.bridge;
        if (current !== undefined) applyFocus(current);
    });
    const costumeUpdates = new Set<() => void>();
    const updateCostumes = () => costumeUpdates.forEach(update => update());

    function watchCostume(image: HTMLImageElement, readTarget) {
        let shownAsset;
        image.removeAttribute('src');
        function update() {
            const target = readTarget();
            const asset = target?.getCostumes()[target.currentCostume]?.asset;
            if (shownAsset === asset) return;
            shownAsset = asset;
            if (asset) image.src = asset.encodeDataURI();
            else image.removeAttribute('src');
        }
        if (!costumeUpdates.size) vm.on('targetsUpdate', updateCostumes);
        costumeUpdates.add(update);
        update();
        return () => {
            costumeUpdates.delete(update);
            if (!costumeUpdates.size) vm.removeListener('targetsUpdate', updateCostumes);
        };
    }

    return {
        /**
         * Make a code view show one script, a hat or a function, or every script again without `scriptId`.
         * The code area shows it while it is in that view, and the view's preview shows it otherwise.
         */
        focusPane(paneId: string, scriptId?: string, onLost?: () => void) {
            if (scriptId) focused.set(paneId, {scriptId, onLost});
            else focused.delete(paneId);
            if (current === paneId) applyFocus(paneId);
            // Previews of other views redraw with their script.
            session.changed();
        },
        focusedScript: (paneId: string) => focused.get(paneId)?.scriptId,
        /** Forget a view that has closed. */
        forgetPane(paneId: string) {
            focused.delete(paneId);
            views.delete(paneId);
            if (current === paneId) {
                current = undefined;
                applyFocus(undefined);
            }
        },
        ownsClick: (element: EventTarget) => Boolean((element as Element)?.closest?.('[data-code-view-control]')),
        watchEditingCostume: (image: HTMLImageElement) => watchCostume(image, () => vm.editingTarget),
        capture(pane: Pane) {
            if (pane.section !== 0) return;
            if (pending?.pane.id === pane.id) {
                const {frame, presentation} = pending;
                cancelAnimationFrame(frame);
                pending = undefined;
                return presentation;
            }
            views.set(pane.id, getDockedScriptLayout(vm)?.view.view ?? 'free');
            return session.bridge?.capturePane(pane.targetId);
        },
        restore(pane: Pane, presentation?: Presentation) {
            if (pending) cancelAnimationFrame(pending.frame);
            pending = undefined;
            if (pane.section !== 0) return;
            current = pane.id;
            applyFocus(pane.id);
            getDockedScriptLayout(vm)?.view.setView(views.get(pane.id) ?? 'free');
            if (!presentation) return;
            const frame = requestAnimationFrame(() => {
                pending = undefined;
                session.bridge?.restorePane(pane.targetId, presentation);
            });
            pending = {frame, pane, presentation};
        },
        renderInactive(container: HTMLElement, pane: Pane, presentation?: Presentation) {
            if (pane.section !== 0) return;
            const target = vm.runtime.getTargetById(pane.targetId);
            if (!target) return;
            const document = container.ownerDocument;
            const surface = document.createElement('div');
            surface.dataset.codePreview = '';
            surface.dataset.codeHoverSurface = '';
            surface.tabIndex = 0;
            surface.setAttribute('role', 'button');
            surface.setAttribute('aria-label', label);
            surface.addEventListener('keydown', event => {
                if (event.target !== surface || (event.key !== 'Enter' && event.key !== ' ')) return;
                event.preventDefault();
                event.stopPropagation();
                surface.click();
            });

            const blocks = document.createElement('div');
            const chrome = document.createElement('div');
            chrome.className = 'tw-code-preview-chrome';
            for (const child of [blocks, chrome]) child.setAttribute('inert', '');
            const watermark = document.createElement('div');
            watermark.dataset.dockviewCostumeThumbnail = '';
            const image = document.createElement('img');
            image.alt = '';
            watermark.appendChild(image);
            chrome.appendChild(watermark);
            surface.append(blocks, chrome);
            container.appendChild(surface);

            const stopCostume = watchCostume(image, () => target);
            let bridge: Bridge | null;
            let preview: ReturnType<Bridge['preview']> | undefined;
            let shownScript: string | undefined;
            function update() {
                if (bridge !== session.bridge || shownScript !== focused.get(pane.id)?.scriptId) {
                    preview?.dispose();
                    bridge = session.bridge;
                    shownScript = focused.get(pane.id)?.scriptId;
                    preview = bridge?.preview(blocks, chrome, {target, presentation, attachMinimap, watermark, locale, dropElement: surface,
                        scriptView: views.get(pane.id), onScriptViewChange: view => views.set(pane.id, view),
                        scriptId: focused.get(pane.id)?.scriptId});
                }
                preview?.update();
            }
            const unsubscribe = session.subscribe(update);
            update();
            return () => {
                stopCostume();
                unsubscribe();
                preview?.dispose();
                surface.remove();
            };
        }
    };
}

/**
 * Mount an editor of one custom block definition in `element`, for the functions section.
 * It follows the code area: when the GUI replaces its workspace, the editor is rebuilt on the new one.
 */
export function mountProcedureEditor(vm, locale: string, element: HTMLElement, targetId: string, definitionId: string,
    {editable, attachNavigation, focusBlock}: {editable: boolean; attachNavigation?: AttachWorkspaceNavigation; focusBlock?: string}) {
    const session = getCodeSession(vm);
    const notice = element.ownerDocument.createElement('p');
    notice.className = 'tw-sprite-functions__empty';
    notice.textContent = /^ja(?:-|$)/i.test(locale) ? 'コード領域の準備ができるまで待っています…' : 'Waiting for the code area…';
    let bridge: Bridge | null | undefined;
    let editor: {dispose(): void; showBlock(id: string): void} | undefined;
    // A block to show waits for the editor, which waits for the code area.
    let pendingBlock = focusBlock;
    function update() {
        if (bridge === session.bridge) return;
        editor?.dispose();
        editor = undefined;
        bridge = session.bridge;
        const target = vm.runtime.getTargetById(targetId);
        if (!bridge || !target) {
            element.appendChild(notice);
            return;
        }
        notice.remove();
        try {
            editor = bridge.editProcedure(element, {target, definitionId, editable, attachNavigation, locale, focusBlock: pendingBlock});
            pendingBlock = undefined;
        } catch (error) {
            bridge.onError?.(error);
        }
    }
    const unsubscribe = session.subscribe(update);
    update();
    return Object.assign(() => {
        unsubscribe();
        editor?.dispose();
        notice.remove();
    }, {
        /** Show one block of the script, such as a call picked in the list of a function's uses. */
        showBlock(id: string) {
            if (editor) editor.showBlock(id);
            else pendingBlock = id;
        }
    });
}

export interface HatScript {
    id: string;
    label: string;
    x: number;
    y: number;
    thumbnail?: SVGSVGElement;
}

const svgNamespace = 'http://www.w3.org/2000/svg';
const hatDrawings = new WeakMap<object, {workspace; drawings: Map<string, SVGSVGElement>}>();

/**
 * Draw a hat block as a standalone SVG, for the list of hats. ScratchBlocks renders it in a hidden workspace of
 * its own; the drawing keeps the block's shapes and images and carries the text styles the page gives them.
 * Drawings are kept by the hat's XML, so an unchanged hat is drawn once.
 */
function drawHat(ScratchBlocks, xml: string): SVGSVGElement | undefined {
    let state = hatDrawings.get(ScratchBlocks);
    if (!state) {
        const main = ScratchBlocks.getMainWorkspace?.();
        if (!main?.options) return undefined;
        const document = main.getInjectionDiv().ownerDocument as Document;
        const host = document.createElement('div');
        host.setAttribute('aria-hidden', 'true');
        host.style.cssText = 'position:fixed;left:-10000px;top:0;inline-size:600px;block-size:200px;visibility:hidden;pointer-events:none';
        document.body.appendChild(host);
        const workspace = ScratchBlocks.inject(host, {readOnly: true, media: main.options.pathToMedia, scrollbars: false,
            sounds: false, zoom: {startScale: 1}});
        // Injecting focuses the new workspace; the GUI keeps reading the code area as the main one.
        main.markFocused();
        state = {workspace, drawings: new Map()};
        hatDrawings.set(ScratchBlocks, state);
    }
    const kept = state.drawings.get(xml);
    if (kept) return kept;
    const {workspace} = state;
    const block = ScratchBlocks.Xml.domToBlock(ScratchBlocks.Xml.textToDom(`<xml>${xml}</xml>`).firstElementChild, workspace);
    try {
        const root = block.getSvgRoot() as SVGGElement;
        const box = root.getBBox();
        if (!box.width || !box.height) return undefined;
        const document = root.ownerDocument;
        const drawing = document.createElementNS(svgNamespace, 'svg') as SVGSVGElement;
        drawing.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
        drawing.setAttribute('width', String(box.width));
        drawing.setAttribute('height', String(box.height));
        const copy = root.cloneNode(true) as SVGGElement;
        copy.removeAttribute('transform');
        copy.removeAttribute('id');
        for (const node of copy.querySelectorAll('[id]')) node.removeAttribute('id');
        const texts = root.querySelectorAll('text');
        copy.querySelectorAll('text').forEach((text, index) => {
            const style = document.defaultView.getComputedStyle(texts[index]);
            for (const name of ['fill', 'font-family', 'font-size', 'font-weight']) {
                text.setAttribute(name, style.getPropertyValue(name));
            }
        });
        drawing.appendChild(copy);
        if (state.drawings.size > 500) state.drawings.clear();
        state.drawings.set(xml, drawing);
        return drawing;
    } finally {
        block.dispose(false);
    }
}

/**
 * Read the scripts of a target that start with a hat, such as “when green flag clicked”, leaving out `skip`
 * (its function definitions). A script is a hat script when its top block has nothing to attach above it or
 * to plug it into; its label is how ScratchBlocks spells that block.
 */
export function readHatScripts(target, ScratchBlocks, skip: ReadonlySet<string> = new Set()): HatScript[] {
    const blocks = target.blocks._blocks as Record<string, {id: string; topLevel?: boolean; shadow?: boolean; x?: number; y?: number}>;
    const tops = Object.values(blocks).filter(block => block.topLevel && !block.shadow && !skip.has(block.id));
    if (!tops.length || !ScratchBlocks?.Workspace) return [];
    const flag = /^ja(?:-|$)/i.test(ScratchBlocks.ScratchMsgs?.currentLocale_ ?? '') ? '緑の旗' : 'green flag';
    const workspace = new ScratchBlocks.Workspace();
    ScratchBlocks.Events.disable();
    try {
        const hats: HatScript[] = [];
        for (const top of tops) {
            try {
                const dom = ScratchBlocks.Xml.textToDom(`<xml>${target.blocks.blockToXML(top.id, {})}</xml>`).firstElementChild;
                // Only the hat itself is spelled and drawn; the rest of the script is not needed.
                for (const child of [...dom.children]) if (child.tagName.toLowerCase() === 'next') child.remove();
                const hatXml = ScratchBlocks.Xml.domToText(dom);
                const block = ScratchBlocks.Xml.domToBlock(dom, workspace);
                // The green flag is an image whose text is its alt, “flag”; read it as the flag's name.
                for (const field of block.inputList.flatMap(input => input.fieldRow)) {
                    if (field instanceof ScratchBlocks.FieldImage && /green-flag/.test(field.src_ ?? '')) field.text_ = flag;
                }
                if (!block.previousConnection && !block.outputConnection) {
                    hats.push({id: top.id, label: block.toString().replace(/\s+/g, ' ').trim(), x: top.x ?? 0, y: top.y ?? 0,
                        thumbnail: drawHat(ScratchBlocks, hatXml)});
                }
            } catch {
                // A block whose definition is not loaded, such as one of a missing extension, is left out.
            }
            workspace.clear();
        }
        return hats;
    } finally {
        ScratchBlocks.Events.enable();
        workspace.dispose();
    }
}

/**
 * Add “Show this function” at the top of the menu of every block that calls a function, in the code area and
 * in the script editors. `find` names the function a block calls, if any; `open` shows it.
 */
export function attachFunctionCallMenu(ScratchBlocks, {label, find, open}: {
    label(): string;
    find(blockId: string): string | undefined;
    open(functionId: string): void;
}) {
    const prototype = ScratchBlocks.BlockSvg.prototype;
    const showContextMenu = prototype.showContextMenu_;
    const patched = function (event) {
        const functionId = this.isInFlyout ? undefined : find(this.id);
        if (!functionId) return showContextMenu.call(this, event);
        const owned = Object.prototype.hasOwnProperty.call(this, 'customContextMenu');
        const custom = this.customContextMenu;
        this.customContextMenu = function (options) {
            custom?.call(this, options);
            options.unshift({text: label(), enabled: true, callback: () => open(functionId)});
        };
        try {
            return showContextMenu.call(this, event);
        } finally {
            if (owned) this.customContextMenu = custom;
            else delete this.customContextMenu;
        }
    };
    prototype.showContextMenu_ = patched;
    return () => {
        if (prototype.showContextMenu_ === patched) prototype.showContextMenu_ = showContextMenu;
    };
}

/** Add a function definition of this name to a target through the code area's bridge. Resolves with the new hat's id. */
export async function createFunction(vm, targetId: string, kind: 'procedure' | 'named', name: string,
    options: {loadNamedFunctions?(): Promise<void>} = {}) {
    const bridge = getCodeSession(vm).bridge;
    const target = vm.runtime.getTargetById(targetId);
    if (!bridge || !target) throw Object.assign(new Error('The code area is not ready'), {code: 'unavailable'});
    return bridge.createFunction(target, kind, name, options);
}
