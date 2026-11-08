import React from 'react';
import ReactDOM from 'react-dom';
import Palette from './detached-block-palette-view.tsx';

type Point = {x: number; y: number};
type PaletteCategory = {id: string; label: string; color?: string; image?: string};
export type PaletteItem = {
    label: string;
    preview?: SVGSVGElement;
    disabled?: boolean;
    insert?(point?: Point): void;
};

export type PaletteSource = {
    surface: SVGSVGElement;
    categories(): PaletteCategory[];
    read(id: string): PaletteItem[];
    subscribe(refresh: () => void): () => void;
    setDetached(detached: boolean): void;
};

type PaletteWindowOptions = {
    locale: string;
    categoryIcons: Readonly<Record<string, string>>;
    decorate(document: Document): () => void;
};

const sources = new WeakMap<object, PaletteSource>();
const opened = new WeakMap<PaletteSource, {popup: Window; close(): void}>();
const dragType = 'application/x-tw-plus-palette-block';

export function openDetachedBlockPalette(workspace: object, {locale, categoryIcons, decorate}: PaletteWindowOptions) {
    const source = sources.get(workspace);
    const owner = source?.surface.ownerDocument.defaultView;
    if (!owner) return;
    const existing = opened.get(source);
    if (existing && !existing.popup.closed) {
        existing.popup.focus();
        return;
    }
    const popup = owner.open('about:blank', '', 'popup,width=720,height=440');
    if (!popup) return;
    const doc = popup.document;
    doc.title = /^ja(?:-|$)/i.test(locale) ? 'ブロックパレット' : 'Block palette';
    const undecorate = decorate(doc);
    const mount = doc.createElement('div');
    doc.body.append(mount);
    const events = new AbortController();
    let drag: PaletteItem | undefined;

    const close = () => {
        if (events.signal.aborted) return;
        events.abort();
        drag = undefined;
        opened.delete(source);
        ReactDOM.unmountComponentAtNode(mount);
        source.setDetached(false);
        undecorate();
        if (!popup.closed) popup.close();
    };
    opened.set(source, {popup, close});
    popup.addEventListener('pagehide', close, {signal: events.signal});
    owner.addEventListener('pagehide', close, {signal: events.signal});
    source.surface.addEventListener('dragover', event => {
        if (!drag || !event.dataTransfer?.types.includes(dragType)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    }, {signal: events.signal});
    source.surface.addEventListener('drop', event => {
        if (!drag || !event.dataTransfer?.getData(dragType)) return;
        event.preventDefault();
        drag.insert({x: event.clientX, y: event.clientY});
        drag = undefined;
    }, {signal: events.signal});
    try {
        source.setDetached(true);
        ReactDOM.render(React.createElement(Palette, {
            source, locale, categoryIcons, close,
            startDrag(item, data) {
                drag = item;
                data.effectAllowed = 'copy';
                data.setData(dragType, 'block');
            },
            endDrag() { drag = undefined; }
        }), mount);
    } catch (error) {
        close();
        throw error;
    }
}

function registerDetachedBlockPalette(workspace: object, source: PaletteSource) {
    sources.set(workspace, source);
    return () => {
        opened.get(source)?.close();
        sources.delete(workspace);
    };
}

export function connectDetachedBlockPalette({blocks, workspace, flyout, menu, categories, show, setDetached}: {
    blocks: any;
    workspace: any;
    flyout: any;
    menu: HTMLElement;
    categories(): PaletteCategory[];
    show(id: string): void;
    setDetached(detached: boolean): void;
}) {
    const surface: SVGSVGElement = workspace.getParentSvg();
    const ns = 'http://www.w3.org/2000/svg';
    const win = surface.ownerDocument.defaultView;
    const placement = (point?: Point) => {
        const bounds = surface.getBoundingClientRect();
        const matrix = workspace.getCanvas().getScreenCTM();
        if (!matrix || !bounds.width || !bounds.height) return;
        const position = surface.createSVGPoint();
        position.x = point?.x ?? bounds.left + bounds.width / 2;
        position.y = point?.y ?? bounds.top + bounds.height / 2;
        return position.matrixTransform(matrix.inverse());
    };
    return registerDetachedBlockPalette(workspace, {
        surface, categories, setDetached,
        read(id) {
            show(id);
            const items: PaletteItem[] = [];
            for (const button of flyout.buttons_) {
                if (button.getIsCategoryLabel()) continue;
                const callback = button.callback_;
                items.push({label: blocks.utils.replaceMessageReferences(button.getText()), ...(callback && {insert() {
                    if (!placement()) return;
                    surface.ownerDocument.defaultView.focus();
                    callback(button);
                }})});
            }
            for (const block of flyout.workspace_.getTopBlocks(true)) {
                const original: SVGGElement = block.getSvgRoot();
                const {x, y, width, height} = original.getBBox();
                if (!width || !height) continue;
                const preview = original.ownerDocument.createElementNS(ns, 'svg');
                preview.setAttribute('viewBox', [x, y, width, height].join(' '));
                preview.setAttribute('width', String(width));
                preview.setAttribute('height', String(height));
                const graphic = original.cloneNode(true) as SVGGElement;
                graphic.removeAttribute('transform');
                preview.append(graphic);
                const xml = blocks.Xml.blockToDom(block, true);
                const label = block.toString();
                items.push({label, preview, disabled: Boolean(block.disabled), insert(point) {
                    const position = placement(point);
                    if (!position) return;
                    const previous = blocks.Events.getGroup();
                    blocks.Events.setGroup(true);
                    try {
                        const inserted = blocks.Xml.domToBlock(xml.cloneNode(true), workspace);
                        inserted.moveBy(position.x, position.y);
                    } finally {
                        blocks.Events.setGroup(previous);
                    }
                }});
            }
            return items;
        },
        subscribe(refresh) {
            const observer = new win.MutationObserver(refresh);
            observer.observe(menu, {childList: true, subtree: true, characterData: true});
            const onChange = event => {
                if (event.type?.startsWith('var_')) refresh();
            };
            workspace.addChangeListener(onChange);
            return () => {
                observer.disconnect();
                workspace.removeChangeListener(onChange);
            };
        }
    });
}

export function installGestureOwnerDocument(blocks) {
    const prototype = blocks.Gesture.prototype;
    const bind = prototype.bindMouseEvents;
    prototype.bindMouseEvents = function (event) {
        const inputDocument = event.target?.ownerDocument;
        bind.call(this, event);
        if (!inputDocument || inputDocument === document) return;
        // Move the registered handlers so Blockly's gesture cleanup still owns them.
        for (const binding of [...this.onMoveWrapper_, ...this.onUpWrapper_]) {
            const [node, type, handler] = binding;
            node.removeEventListener(type, handler, false);
            inputDocument.addEventListener(type, handler, {passive: false});
            binding[0] = inputDocument;
        }
    };
    const dragger = blocks.BlockDragger.prototype;
    const start = dragger.startBlockDrag;
    const dispose = dragger.dispose;
    const inlineDrags = new WeakSet();
    dragger.startBlockDrag = function (...args) {
        const block = this.draggingBlock_;
        if (block.useDragSurface_ && block.getSvgRoot().ownerDocument !== document) {
            // The optimized drag surface looks up its injection container in the opener.
            block.useDragSurface_ = false;
            inlineDrags.add(this);
        }
        return start.apply(this, args);
    };
    dragger.dispose = function () {
        if (inlineDrags.delete(this)) this.draggingBlock_.useDragSurface_ = true;
        return dispose.call(this);
    };
}

export function moveBlockWidgets(blocks, target: Document) {
    const widgets = [blocks.WidgetDiv.DIV, blocks.DropDownDiv.DIV, blocks.Tooltip.DIV]
        .filter(widget => widget && widget.ownerDocument !== target);
    if (!widgets.length) return;
    blocks.hideChaff();
    target.body.append(...widgets);
}
