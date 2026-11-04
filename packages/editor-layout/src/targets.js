const tileHeight = 80;
const minTileWidth = 72;
const gap = 6;
const padding = gap * 2;

export function createTargetList(React, styles) {
    const {createElement: element, useLayoutEffect, useRef, useState} = React;

    function SpriteGrid({className, compact, fixedColumns, stageTile, children}) {
        const grid = useRef(null);
        const [size, setSize] = useState({width: 0, height: 0});
        useLayoutEffect(() => {
            if (!compact || fixedColumns) return;
            const viewport = grid.current.parentElement;
            const measure = () => {
                const {clientWidth: width, clientHeight: height} = viewport;
                setSize(previous => previous.width === width && previous.height === height ? previous : {width, height});
            };
            measure();
            const observer = new ResizeObserver(measure);
            observer.observe(viewport);
            return () => observer.disconnect();
        }, [compact, fixedColumns]);

        const columns = fixedColumns || Math.max(1, Math.floor((size.width - padding + gap) / (minTileWidth + gap)));
        const visibleRows = Math.floor((size.height - padding + gap) / (tileHeight + gap));
        const placement = fixedColumns ? 'inline' : size.width >= size.height && columns >= 2 ? 'top-right' :
            (visibleRows >= 2 ? 'bottom-left' : 'inline');
        const rows = Math.max(visibleRows, Math.ceil((React.Children.count(children) + 1) / columns));
        return element('div', {
            className: compact ? `${className} ${styles.grid}` : className,
            'data-fixed-columns': fixedColumns,
            'data-backdrop-placement': compact ? placement : undefined,
            ref: grid,
            style: compact ? {'--target-columns': columns, '--target-rows-before-last': rows - 1} : undefined
        }, children, stageTile && element('div', {className: styles.backdropCell, key: 'stage'}, stageTile));
    }

    function BackdropTile({url, label, selected, highlighted, containerRef, onClick, onMouseEnter, onMouseLeave}) {
        return element('button', {
            type: 'button', className: styles.backdrop, ref: containerRef, 'aria-pressed': selected,
            'data-highlighted': highlighted || undefined, onClick, onMouseEnter, onMouseLeave
        }, url && element('img', {src: url, alt: '', draggable: false}),
        element('span', {className: styles.backdropLabel}, label));
    }

    function BackdropFooter({buttons, label}) {
        return element('div', {className: styles.backdropFooter, role: 'group', 'aria-label': label},
            buttons.map(({title, img, onClick, fileInput, fileAccept, fileChange, fileMultiple}) =>
                element(React.Fragment, {key: title},
                    element('button', {type: 'button', 'aria-label': title, title, onClick},
                        element('img', {src: img, alt: '', draggable: false})),
                    fileInput && element('input', {type: 'file', accept: fileAccept, multiple: fileMultiple,
                        ref: fileInput, onChange: fileChange, hidden: true}))));
    }

    return {SpriteGrid, BackdropTile, BackdropFooter};
}
