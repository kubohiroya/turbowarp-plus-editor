const svgNamespace = 'http://www.w3.org/2000/svg';
export const svgDrawingElements = new Set(['g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan']);
const numbers = /^[\d.eE+,%\s-]+$/;
const geometry = new Set(['x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'dx', 'dy',
    'points', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-size']);
const paint = /^(?:#[\da-f]{3,8}|[a-z]+|rgba?\([\d.,%\s]+\))$/i;
const svgPaint = ['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity'];
const svgTypography = ['font-size', 'font-family', 'font-weight', 'font-style'];
const textStyle = new Set(['text-anchor', 'dominant-baseline', 'alignment-baseline', 'font-weight', 'font-style']);

type Drawing = {tag: string; attributes: [string, string][]; children: (Drawing | string)[]};
export type NativeFieldGraphic = {
    blockId: string; name: string; value: string; bounds: [number, number, number, number]; drawing: Drawing;
};

export function isSafeSvgDrawingAttribute(name: string, value: string) {
    if (value.length > 4096) return false;
    if (geometry.has(name)) return numbers.test(value);
    if (name === 'fill' || name === 'stroke') return paint.test(value);
    if (name === 'd') return /^[\d.aAcCeEhHlLmMqQsStTvVzZ+,\s-]+$/.test(value);
    if (name === 'transform') return /^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\([\d.eE+,\s-]+\)[\s,]*)+$/.test(value);
    if (name === 'font-family') return /^[\w ,'"-]+$/.test(value);
    return textStyle.has(name) && /^[\w-]+$/.test(value);
}

/** Project inert drawing data from a trusted, already rendered field. */
export function captureNativeFieldDrawing(root: SVGGraphicsElement): Pick<NativeFieldGraphic, 'bounds' | 'drawing'> | undefined {
    let remaining = 128;
    function read(element: Element, depth: number): Drawing | undefined {
        if (element.namespaceURI !== svgNamespace || !svgDrawingElements.has(element.localName) || depth > 8 || remaining <= 0) return;
        remaining--;
        const tag = element.localName;
        const attributes: [string, string][] = [];
        for (const {name, value} of element.attributes) {
            if ((depth || name !== 'transform') && isSafeSvgDrawingAttribute(name, value)) attributes.push([name, value]);
        }
        // Use the applied appearance so that parent-only CSS selectors need not exist in the child.
        const style = element.ownerDocument.defaultView?.getComputedStyle(element);
        const properties = tag === 'text' || tag === 'tspan' ? [...svgPaint, ...svgTypography] : svgPaint;
        if (style) for (const name of properties) {
            const computed = style.getPropertyValue(name);
            const value = name === 'font-size' || name === 'stroke-width' ? computed.replace(/px$/, '') : computed;
            const index = attributes.findIndex(([key]) => key === name);
            if (isSafeSvgDrawingAttribute(name, value)) {
                const attribute: [string, string] = [name, value];
                if (index === -1) attributes.push(attribute);
                else attributes[index] = attribute;
            } else if (computed && index !== -1) {
                attributes.splice(index, 1);
            }
        }
        const children: (Drawing | string)[] = [];
        for (const child of element.childNodes) {
            if (child.nodeType === 1) {
                const drawing = read(child as Element, depth + 1);
                if (drawing) children.push(drawing);
            } else if (child.nodeType === 3 && (tag === 'text' || tag === 'tspan') && remaining > 0) {
                remaining--;
                children.push(child.textContent.slice(0, 1024));
            }
        }
        if (tag === 'g' && !children.length) return;
        return {tag, attributes, children};
    }
    const drawing = read(root, 0);
    if (!drawing) return;
    try {
        const {x, y, width, height} = root.getBBox();
        if ([x, y, width, height].every(Number.isFinite) && width > 0 && height > 0) {
            return {bounds: [x, y, width, height], drawing};
        }
    } catch {
        // The docked field can be temporarily unrendered.
    }
}

export function projectNativeFieldGraphics(runtime, target, workspace): NativeFieldGraphic[] {
    const types = new Set<string>();
    for (const category of runtime._blockInfo ?? []) {
        for (const entry of Object.values(category.customFieldTypes ?? {}) as {extendedName: string; fieldImplementation?: {fromJson?: unknown}}[]) {
            if (typeof entry.fieldImplementation?.fromJson === 'function') types.add(entry.extendedName);
        }
    }
    if (!types.size) return [];
    const graphics: NativeFieldGraphic[] = [];
    for (const [blockId, block] of Object.entries(target.blocks._blocks) as [string, {opcode: string; fields: Record<string, {value: unknown}>}][]) {
        if (!types.has(block.opcode)) continue;
        const name = `field_${block.opcode}`;
        const value = block.fields[name]?.value;
        const field = workspace.getBlockById(blockId)?.getField(name);
        const root = field?.getSvgRoot?.();
        if (typeof value !== 'string' || !root || field.getValue() !== value) continue;
        const graphic = captureNativeFieldDrawing(root);
        if (graphic) graphics.push({blockId, name, value, ...graphic});
    }
    return graphics;
}

/** Keep the child proxy's click handling and saved value. Only its drawing changes. */
export function attachNativeFieldGraphic(field, lookup: (blockId: string, value: string) => NativeFieldGraphic | undefined) {
    const render = field.render_;
    let drawn: NativeFieldGraphic | undefined;
    let svg: SVGSVGElement | undefined;
    field.render_ = function () {
        render.call(this);
        const root = this.getSvgRoot();
        if (!root || !this.textElement_) return;
        const graphic = lookup(this.sourceBlock_.id, this.getValue());
        if (graphic !== drawn) {
            svg?.remove();
            svg = undefined;
            drawn = graphic;
            this.textElement_.style.visibility = graphic ? 'hidden' : '';
            if (graphic) {
                const document = root.ownerDocument;
                const materialize = (drawing: Drawing) => {
                    const node = document.createElementNS(svgNamespace, drawing.tag);
                    for (const [name, value] of drawing.attributes) node.setAttribute(name, value);
                    for (const child of drawing.children) node.append(typeof child === 'string' ? child : materialize(child));
                    return node;
                };
                svg = document.createElementNS(svgNamespace, 'svg');
                svg.setAttribute('aria-hidden', 'true');
                svg.setAttribute('pointer-events', 'none');
                svg.setAttribute('viewBox', graphic.bounds.join(' '));
                svg.append(materialize(graphic.drawing));
                root.append(svg);
            }
        }
        if (graphic && svg) {
            const [, , width, height] = graphic.bounds;
            const scale = Math.min(1, this.size_.height / height, 192 / width);
            this.size_.width = Math.max(16, width * scale);
            svg.setAttribute('width', String(width * scale));
            svg.setAttribute('height', String(height * scale));
            svg.setAttribute('y', String((this.size_.height - height * scale) / 2));
            this.box_?.setAttribute('width', String(this.size_.width));
        }
    };
}
