const flexDisplays = new Set(['flex', 'inline-flex']);
const gridDisplays = new Set(['grid', 'inline-grid']);
const dimensions = ['width', 'min-width', 'max-width'];
const align = /^(?:normal|stretch|start|end|self-start|self-end|flex-start|flex-end|center|baseline|auto)$/;
const distribute = /^(?:normal|stretch|start|end|flex-start|flex-end|left|right|center|space-between|space-around|space-evenly)$/;
const placement = /^(?:auto|(?:span )?[1-8])$/;

function pixels(value: string, limit: number) {
    return /^\d+(?:\.\d+)?px$/.test(value) && Number.parseFloat(value) <= limit;
}

function size(value: string) {
    return value === 'auto' || pixels(value, 480) ||
        (/^\d+(?:\.\d+)?%$/.test(value) && Number.parseFloat(value) <= 100);
}

function tracks(value: string) {
    if (value === 'none') return true;
    const list = value.split(/\s+/);
    return list.length <= 8 && list.every(track => track === 'auto' || pixels(track, 480) ||
        (/^\d+(?:\.\d+)?fr$/.test(track) && Number.parseFloat(track) <= 16));
}

/** Recreate the layout using the popup's own dimensions and the mirrored controls. */
export function createFieldLayoutMirror(original: HTMLElement, proxy: HTMLElement) {
    let applied = new Set<string>();
    return (computed: CSSStyleDeclaration) => {
        const next = new Set<string>();
        const set = (name: string, value: string) => {
            next.add(name);
            if (proxy.style.getPropertyValue(name) !== value) proxy.style.setProperty(name, value);
        };
        const copy = (name: string, accepts: (value: string) => boolean, value = computed.getPropertyValue(name)) => {
            if (accepts(value)) set(name, value);
        };
        const parentDisplay = proxy.parentElement?.style.display;
        const flexItem = flexDisplays.has(parentDisplay);
        const gridItem = gridDisplays.has(parentDisplay);
        const flex = flexDisplays.has(computed.display);
        const grid = gridDisplays.has(computed.display);
        const typed = flex || grid || flexItem || gridItem ? original.computedStyleMap?.() : undefined;
        const computedValue = (name: string) => typed?.get(name)?.toString() ?? '';

        // The CSSOM resolved track list is measured in the parent's pixels. Keep fr units.
        const columns = grid ? computedValue('grid-template-columns') : '';
        const rows = grid ? computedValue('grid-template-rows') : '';
        const supportedGrid = grid && tracks(columns) && tracks(rows) && computedValue('grid-template-areas') === 'none';
        if (flex || supportedGrid) {
            set('display', computed.display);
            for (const name of ['row-gap', 'column-gap']) copy(name, value => value === 'normal' || pixels(value, 64));
            copy('justify-content', value => distribute.test(value));
            copy('align-content', value => distribute.test(value) || value === 'baseline');
            copy('align-items', value => align.test(value));
        }
        if (flex) {
            copy('flex-direction', value => /^(?:row|column)(?:-reverse)?$/.test(value));
            copy('flex-wrap', value => /^(?:nowrap|wrap|wrap-reverse)$/.test(value));
        }
        if (supportedGrid) {
            set('grid-template-columns', columns);
            set('grid-template-rows', rows);
            copy('grid-auto-flow', value => /^(?:row|column)(?: dense)?$/.test(value) || value === 'dense');
            copy('justify-items', value => align.test(value));
        }
        if (flex || supportedGrid || flexItem || gridItem) {
            for (const name of dimensions) copy(name, value => size(value) || value === 'none', computedValue(name));
            copy('box-sizing', value => value === 'border-box' || value === 'content-box');
        }
        if (flexItem || gridItem) {
            copy('align-self', value => align.test(value));
        }
        if (flexItem) {
            for (const name of ['flex-grow', 'flex-shrink']) {
                copy(name, value => /^\d+(?:\.\d+)?$/.test(value) && Number(value) <= 16);
            }
            copy('flex-basis', size);
        }
        if (gridItem) {
            copy('justify-self', value => align.test(value));
            for (const axis of ['column', 'row']) {
                copy(`grid-${axis}-start`, value => placement.test(value));
                copy(`grid-${axis}-end`, value => placement.test(value));
            }
        }
        for (const name of applied) if (!next.has(name)) proxy.style.removeProperty(name);
        applied = next;
    };
}
