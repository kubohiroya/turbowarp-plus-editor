import React from 'react';
import ReactDOM from 'react-dom';
import {IconMenuButton} from './icon-menu-button.tsx';
import styles from './detached-block-palette.css';

type Point = {x: number; y: number};
type PaletteCategory = {id: string; label: string};
type PaletteItem = {
    label: string;
    preview?: SVGSVGElement;
    disabled?: boolean;
    insert?(point?: Point): void;
};

type PaletteSource = {
    surface: SVGSVGElement;
    categories(): PaletteCategory[];
    read(id: string): PaletteItem[];
    subscribe(refresh: () => void): () => void;
    setDetached(detached: boolean): void;
};

type PaletteWindowOptions = {
    locale: string;
    decorate(document: Document): () => void;
};

const sources = new WeakMap<object, PaletteSource>();
const opened = new WeakMap<PaletteSource, {popup: Window; close(): void}>();
const dragType = 'application/x-tw-plus-palette-block';

function BlockPreview({svg}: {svg: SVGSVGElement}) {
    const ref = React.useRef<HTMLSpanElement>(null);
    React.useLayoutEffect(() => {
        const node = ref.current;
        node.replaceChildren(node.ownerDocument.importNode(svg, true));
    }, [svg]);
    return <span ref={ref} aria-hidden="true" />;
}

function LayoutIcon({path}: {path: string}) {
    return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"
        strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>;
}

function Palette({source, locale, close, startDrag, endDrag}: {
    source: PaletteSource;
    locale: string;
    close(): void;
    startDrag(item: PaletteItem, data: DataTransfer): void;
    endDrag(): void;
}) {
    const ja = /^ja(?:-|$)/i.test(locale);
    const [vertical, setVertical] = React.useState(false);
    const [categoryId, setCategory] = React.useState('');
    const [revision, refresh] = React.useReducer(value => value + 1, 0);
    const [items, setItems] = React.useState<PaletteItem[]>([]);
    const categories = source.categories();
    const selected = categories.find(category => category.id === categoryId) ?? categories[0];
    const selectedId = selected?.id;
    React.useLayoutEffect(() => source.subscribe(refresh), [source]);
    React.useLayoutEffect(() => {
        setItems(selectedId ? source.read(selectedId) : []);
    }, [source, selectedId, revision]);

    return <main className={styles.palette} data-palette-orientation={vertical ? 'vertical' : 'horizontal'}>
        <div className={styles.content}>
            <div className={styles.categories} role="group" aria-label={ja ? 'ブロックのカテゴリ' : 'Block categories'}>
                {categories.map(({id, label}) => <button key={id} type="button" aria-pressed={id === selectedId}
                    onClick={() => setCategory(id)}>{label}</button>)}
            </div>
            <div className={styles.blocks} role="group" aria-label={selected?.label}>
                {items.map((item, index) => item.insert ? <button key={index} type="button" aria-label={item.label}
                    title={item.label} disabled={item.disabled} draggable={Boolean(item.preview && !item.disabled)}
                    onDragStart={event => startDrag(item, event.dataTransfer)} onDragEnd={endDrag}
                    onClick={() => item.insert()}>
                    {item.preview ? <BlockPreview svg={item.preview} /> : item.label}
                </button> : <span key={index}>{item.label}</span>)}
            </div>
        </div>
        <footer className={styles.footer}>
            <IconMenuButton label={ja ? 'ブロックパレットのレイアウト' : 'Block palette layout'}
                icon={<LayoutIcon path="M2.5 3.5h11v9h-11zM2.5 7h11" />} items={[
                    {id: 'horizontal', label: ja ? '横並びにする' : 'Arrange horizontally', checked: !vertical,
                        icon: <LayoutIcon path="M2 5h5v6H2zm7 0h5v6H9z" />, onSelect: () => setVertical(false)},
                    {id: 'vertical', label: ja ? '縦並びにする' : 'Arrange vertically', checked: vertical,
                        icon: <LayoutIcon path="M5 2h6v5H5zm0 7h6v5H5z" />, onSelect: () => setVertical(true)},
                    {id: 'dock', label: ja ? 'このパネルを別画面から元に戻す' : 'Return this panel to the editor',
                        icon: <LayoutIcon path="M9 3h4v10H3V9m0-6 6 6M5 9h4V5" />, onSelect: close}
                ]} />
        </footer>
    </main>;
}

export function openDetachedBlockPalette(workspace: object, {locale, decorate}: PaletteWindowOptions) {
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
        ReactDOM.render(<Palette source={source} locale={locale} close={close} startDrag={(item, data) => {
            drag = item;
            data.effectAllowed = 'copy';
            data.setData(dragType, 'block');
        }} endDrag={() => { drag = undefined; }} />, mount);
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
