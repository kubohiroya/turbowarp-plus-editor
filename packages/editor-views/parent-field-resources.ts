import {isSafeSvgDrawingAttribute, svgDrawingElements} from './native-field-svg.ts';

const maxBytes = 256 * 1024;
const maxSide = 512;
const idPattern = /^[\w-]{1,48}$/;
const pngHeader = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82];
const svgNamespace = 'http://www.w3.org/2000/svg';

type Asset = {kind: 'image' | 'font'; url: string};
export type FieldResourceOptions = {manifest: unknown; canFetch(url: string): boolean | Promise<boolean>};

function readManifest(manifest: unknown) {
    const assets = new Map<string, Asset>();
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return assets;
    for (const [id, value] of Object.entries(manifest).slice(0, 8)) {
        if (!idPattern.test(id) || !value || typeof value !== 'object') continue;
        const {kind, url} = value as Partial<Asset>;
        if ((kind !== 'image' && kind !== 'font') || typeof url !== 'string' || url.length > 2048) continue;
        const parsed = URL.parse(url);
        if (parsed?.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) continue;
        assets.set(id, {kind, url: parsed.href});
    }
    return assets;
}

async function readAsset(parent: Window, asset: Asset, signal: AbortSignal) {
    const response = await parent.fetch(asset.url, {
        signal, mode: 'cors', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer'
    });
    const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    const acceptable = asset.kind === 'font' ? type === 'font/woff2' : type === 'image/png' || type === 'image/svg+xml';
    if (!response.ok || !acceptable || !response.body || Number(response.headers.get('content-length')) > maxBytes) {
        await response.body?.cancel();
        return;
    }
    const reader = response.body.getReader();
    const buffer = new Uint8Array(maxBytes);
    let count = 0;
    try {
        for (;;) {
            const {done, value} = await reader.read();
            if (done) return {type, bytes: buffer.slice(0, count)};
            if (count + value.byteLength > maxBytes) {
                await reader.cancel();
                return;
            }
            buffer.set(value, count);
            count += value.byteLength;
        }
    } finally {
        reader.releaseLock();
    }
}

function staticSvg(document: Document, bytes: Uint8Array<ArrayBuffer>) {
    const view = document.defaultView;
    const markup = new TextDecoder().decode(bytes);
    if (/<!doctype/i.test(markup)) return;
    const svg = new view.DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
    if (svg.localName !== 'svg' || svg.namespaceURI !== svgNamespace) return;
    const output = document.createElementNS(svgNamespace, 'svg');
    for (const name of ['width', 'height']) {
        const size = svg.getAttribute(name) ?? '';
        if (!/^\d+(?:\.\d+)?(?:px)?$/.test(size) || Number.parseFloat(size) <= 0 || Number.parseFloat(size) > maxSide) return;
        output.setAttribute(name, size);
    }
    const viewBox = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/);
    if (viewBox?.length === 4 && viewBox.every(value => /^-?\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value))) &&
        Number(viewBox[2]) > 0 && Number(viewBox[3]) > 0) output.setAttribute('viewBox', viewBox.join(' '));
    let remaining = 128;
    function copy(original: Element, target: SVGElement, depth: number) {
        for (const {name, value} of original.attributes) {
            if ((depth || (name !== 'width' && name !== 'height')) &&
                isSafeSvgDrawingAttribute(name, value)) target.setAttribute(name, value);
        }
        for (const child of original.childNodes) {
            if (remaining <= 0) break;
            if (child.nodeType === 3 && (original.localName === 'text' || original.localName === 'tspan')) {
                remaining--;
                target.append(child.textContent.slice(0, 1024));
            } else if (child.nodeType === 1 && depth < 8) {
                const element = child as Element;
                if (element.namespaceURI !== svgNamespace || !svgDrawingElements.has(element.localName)) continue;
                remaining--;
                const next = document.createElementNS(svgNamespace, element.localName);
                copy(element, next, depth + 1);
                target.append(next);
            }
        }
    }
    copy(svg, output, 0);
    return new view.XMLSerializer().serializeToString(output);
}

async function rasterize(document: Document, type: string, bytes: Uint8Array<ArrayBuffer>, signal: AbortSignal) {
    if (signal.aborted) return;
    let data: BlobPart = bytes;
    if (type === 'image/png') {
        if (bytes.length < 24 || !pngHeader.every((byte, index) => bytes[index] === byte)) return;
        const header = new DataView(bytes.buffer);
        if (![header.getUint32(16), header.getUint32(20)].every(side => side > 0 && side <= maxSide)) return;
    } else {
        data = staticSvg(document, bytes);
        if (!data) return;
    }
    const view = document.defaultView;
    const image = document.createElement('img');
    const url = view.URL.createObjectURL(new view.Blob([data], {type}));
    const revoke = () => view.URL.revokeObjectURL(url);
    signal.addEventListener('abort', revoke, {once: true});
    try {
        // Decode SVG only in image mode, then send pixels to the popup.
        image.src = url;
        await image.decode();
        const {naturalWidth: width, naturalHeight: height} = image;
        if (signal.aborted || !width || !height || width > maxSide || height > maxSide) return;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) return;
        context.drawImage(image, 0, 0);
        return canvas.toDataURL('image/png');
    } finally {
        signal.removeEventListener('abort', revoke);
        revoke();
    }
}

export function createFieldResources(source: HTMLElement, options: FieldResourceOptions | undefined, valid: () => boolean) {
    const assets = readManifest(options?.manifest);
    const pending = new Map<Asset, Promise<string | undefined>>();
    const fonts: {document: Document; face: FontFace}[] = [];
    const controller = new AbortController();
    const parent = source.ownerDocument.defaultView;

    async function load(asset: Asset, child: Document) {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]);
        if (!await options.canFetch(asset.url) || signal.aborted || !valid()) return;
        const resource = await readAsset(parent, asset, signal);
        if (!resource || signal.aborted || !valid()) return;
        const {type, bytes} = resource;
        if (asset.kind === 'image') return rasterize(source.ownerDocument, type, bytes, signal);
        if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'wOF2') return;
        const family = `tw-field-font-${parent.crypto.randomUUID()}`;
        const face = new child.defaultView.FontFace(family, bytes);
        await face.load();
        if (signal.aborted || !valid()) return;
        child.fonts.add(face);
        fonts.push({document: child, face});
        return family;
    }

    function assetFor(node: HTMLElement, kind: Asset['kind']) {
        const asset = assets.get(node.getAttribute(`data-plus-field-${kind}`) ?? '');
        return asset?.kind === kind ? asset : undefined;
    }

    return {
        hasImage(node: HTMLElement) {
            return Boolean(assetFor(node, 'image'));
        },
        attach(original: HTMLElement, proxy: HTMLElement) {
            const image = proxy.localName === 'img';
            const asset = assetFor(original, image ? 'image' : 'font');
            if (!asset) return;
            if (!pending.has(asset)) pending.set(asset, load(asset, proxy.ownerDocument).catch(() => undefined));
            return pending.get(asset).then(value => {
                if (!value || controller.signal.aborted || !valid()) return;
                if (image) (proxy as HTMLImageElement).src = value;
                return image ? undefined : value;
            });
        },
        dispose() {
            controller.abort();
            for (const {document, face} of fonts) document.fonts.delete(face);
        }
    };
}
