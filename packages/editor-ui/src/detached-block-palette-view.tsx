import React from 'react';
import {IconMenuButton} from './icon-menu-button.tsx';
import type {PaletteItem, PaletteSource} from './detached-block-palette.ts';
import styles from './detached-block-palette.css';

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

export default function Palette({source, locale, close, startDrag, endDrag}: {
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
