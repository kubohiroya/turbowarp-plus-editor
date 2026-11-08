import styles from './palette-category-search.css';

export const paletteSearchHeight = 36;

type Bounds = {left: number; top: number; width: number};
type PaletteItem<Block> = {type: 'block'; block: Block} | {
    type: 'button'; button: {isLabel_: boolean; getText(): string};
};

const normalize = (text: string) => text.normalize('NFKC').trim().toLocaleLowerCase();

export function matchPaletteBlocks<Block>(items: PaletteItem<Block>[], category: string, query: string,
    heading: (text: string) => string, labels: (block: Block) => string) {
    const matches = (text: string) => normalize(text).includes(query);
    const categoryMatches = matches(heading(category));
    let headingMatches = false;
    const visible = new Set<Block>();
    for (const item of items) {
        if (item.type === 'button') {
            if (item.button.isLabel_) headingMatches = matches(heading(item.button.getText()));
        } else if (categoryMatches || headingMatches || matches(labels(item.block))) {
            visible.add(item.block);
        }
    }
    return visible;
}

export function attachPaletteCategorySearch(panel: SVGElement, getLocale: () => string,
    change: (query: string, previous: string) => void) {
    const doc = panel.ownerDocument;
    const japanese = () => /^ja(?:-|$)/i.test(getLocale());
    const input = doc.createElement('input');
    input.type = 'search';
    input.className = styles.input;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.hidden = true;
    panel.after(input);

    let query = '';
    const update = () => {
        const next = normalize(input.value);
        if (next === query) return;
        const previous = query;
        query = next;
        change(query, previous);
    };
    input.addEventListener('input', event => {
        if (!(event as InputEvent).isComposing) update();
    });
    input.addEventListener('compositionend', update);

    return {
        get query() {
            return query;
        },
        get emptyLabel() {
            return japanese() ? '一致するブロックがありません' : 'No matching blocks';
        },
        place(bounds: Bounds | null) {
            input.hidden = !bounds || bounds.width <= 59;
            if (!bounds || input.hidden) return;
            const label = japanese() ? 'ブロックを検索' : 'Search blocks';
            if (input.placeholder !== label) {
                input.placeholder = label;
                input.setAttribute('aria-label', label);
            }
            input.style.width = `${bounds.width - 59}px`;
            input.style.transform = `translate(${bounds.left + 8}px, ${bounds.top + 4}px)`;
        },
        close() {
            query = '';
            input.value = '';
            input.hidden = true;
        },
        contains(target: Node | null) {
            return input.contains(target);
        },
        dispose() {
            input.remove();
        }
    };
}
