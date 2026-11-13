interface Point {
    x: number;
    y: number;
}

export interface ScriptBounds extends Point {
    id: string;
    width: number;
    height: number;
}

export type ScriptOrder = 'z' | 'n';
export type LayoutDirection = 'vertical' | 'horizontal';

const alignmentTolerance = 24;
const spacing = 32;

export function arrangeScripts<T extends ScriptBounds>(scripts: readonly T[], order: ScriptOrder, direction: LayoutDirection) {
    const bandAxis = order === 'z' ? 'y' : 'x';
    const scanAxis = order === 'z' ? 'x' : 'y';
    const compare = (a: T, b: T, first: 'x' | 'y', second: 'x' | 'y') =>
        a[first] - b[first] || a[second] - b[second] || (a.id < b.id ? -1 : Number(a.id > b.id));
    const ordered = [...scripts].sort((a, b) => compare(a, b, bandAxis, scanAxis));
    const bands: T[][] = [];
    for (const script of ordered) {
        const band = bands.at(-1);
        // Measure each band from its first script so small offsets cannot chain across rows or columns.
        if (band && script[bandAxis] - band[0][bandAxis] <= alignmentTolerance) band.push(script);
        else bands.push([script]);
    }

    let offset = spacing;
    return bands.flatMap(band => band.sort((a, b) => compare(a, b, scanAxis, bandAxis))).map(script => {
        const vertical = direction === 'vertical';
        const x = vertical ? spacing : offset;
        const y = vertical ? offset : spacing;
        offset += Math.ceil(vertical ? script.height : script.width) + spacing;
        return {script, x, y};
    });
}
