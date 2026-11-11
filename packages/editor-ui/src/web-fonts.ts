// Regular Latin faces from the Google Fonts CSS API. A project selects a catalog ID, never a URL.
const fontOrigin = 'https://fonts.gstatic.com';
export const webFonts = Object.freeze([
    {id: 'press-start-2p', family: 'Press Start 2P',
        path: '/s/pressstart2p/v16/e3t4euO8T-267oIAQAu6jDQyK3nVivNm4I81.woff2'},
    {id: 'roboto-mono', family: 'Roboto Mono',
        path: '/s/robotomono/v31/L0xuDF4xlVMF-BfR8bXMIhJHg45mwgGEFl0_3vq_ROW4AJi8SJQt.woff2'},
    {id: 'space-grotesk', family: 'Space Grotesk',
        path: '/s/spacegrotesk/v22/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj7oUXskPMBBSSJLm2E.woff2'}
]);
type WebFont = typeof webFonts[number];
type Reference = {provider: 'google-fonts'; id: string};
type Font = {system: boolean; family: string; fallback: string; md5ext?: string; webFont?: Reference};
type ListedFont = {system: boolean; name: string; family: string; webFont?: Reference};
type Renderer = {setCustomFonts(faces: Record<string, string>): Promise<unknown>};
type FontManager = {
    getFonts(): ListedFont[];
    isValidCustomFont(family: string): boolean;
    hasFont(family: string): boolean;
    addSystemFont(family: string, fallback: string): void;
    addCustomFont(family: string, fallback: string, asset: unknown): Promise<unknown>;
    clear(): void;
    deleteFont(index: number): void;
    serializeJSON(): Font[] | null;
    deserialize(input: unknown, zip?: unknown, keepExisting?: boolean): Promise<void>;
    updateRenderer(): Promise<unknown>;
    changed(): void;
};
type FontVM = {
    runtime: {
        fontManager: FontManager;
        renderer?: Renderer;
        emitProjectChanged(): void;
    };
};

const allowedFallback = (value: unknown): value is string =>
    typeof value === 'string' && /^[-\w ]+$/u.test(value);

async function download(font: WebFont): Promise<Uint8Array | undefined> {
    try {
        const response = await fetch(fontOrigin + font.path, {
            credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) return;
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length >= 48 && bytes.length <= 256 * 1024 && new DataView(bytes.buffer).getUint32(0) === 0x774f4632) {
            return bytes;
        }
    } catch {
        // The project keeps the reference and can be opened with the fallback offline.
    }
}

const editors = new WeakMap<FontManager, {add(id: string, fallback: string): Promise<boolean>}>();
const fallbackOnly = new WeakSet<FontManager>();
export const webFontEditor = (manager: FontManager) => editors.get(manager);
export const webFontOwnsKeyEvent = event => Boolean(event?.target?.closest?.('[data-plus-web-fonts]'));

export function withPackagerFontFallbacks<T>(vm: Partial<FontVM>, run: () => T): T {
    const manager = vm.runtime?.fontManager;
    if (!manager || fallbackOnly.has(manager)) return run();
    fallbackOnly.add(manager);
    try {
        return run();
    } finally {
        fallbackOnly.delete(manager);
    }
}

/** Use the native font manager and SVG renderer for the lifetime of the GUI's security host. */
export function installWebFonts(vm: FontVM, approve: (families: string[]) => Promise<boolean>, read = download) {
    const {fontManager: manager} = vm.runtime;
    const original = {
        addSystemFont: manager.addSystemFont, addCustomFont: manager.addCustomFont, getFonts: manager.getFonts,
        clear: manager.clear, deleteFont: manager.deleteFont, deserialize: manager.deserialize,
        serializeJSON: manager.serializeJSON, updateRenderer: manager.updateRenderer
    };
    const references = new Map<string, {reference: Reference; css?: string}>();
    let generation = 0;

    const register = (font: WebFont, bytes?: Uint8Array) => {
        const reference: Reference = {provider: 'google-fonts', id: font.id};
        const data = bytes && btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
        const css = data && `@font-face { font-family: "${font.family}"; src: url("data:font/woff2;base64,${data}"); }`;
        references.set(font.family.toLowerCase(), {reference, css});
    };

    manager.updateRenderer = () => {
        const renderer = vm.runtime.renderer;
        if (!renderer?.setCustomFonts || !references.size) return original.updateRenderer.call(manager);
        const webFaces: Record<string, string> = {};
        for (const font of original.getFonts.call(manager)) {
            const css = references.get(font.name.toLowerCase())?.css;
            if (css) webFaces[font.family] = css;
        }
        const setCustomFonts = renderer.setCustomFonts;
        // The native manager synchronously hands its file faces to the renderer before awaiting them.
        // Supply web faces in the same update so the renderer embeds them into vector costume snapshots.
        renderer.setCustomFonts = faces => setCustomFonts.call(renderer, {...faces, ...webFaces});
        try {
            return original.updateRenderer.call(manager);
        } finally {
            renderer.setCustomFonts = setCustomFonts;
        }
    };

    manager.addSystemFont = (family, fallback) => {
        const key = family.toLowerCase();
        const hadFace = references.get(key)?.css;
        references.delete(key);
        original.addSystemFont.call(manager, family, fallback);
        if (hadFace) void manager.updateRenderer();
    };
    manager.addCustomFont = (family, fallback, asset) => {
        if (manager.isValidCustomFont(family)) references.delete(family.toLowerCase());
        return original.addCustomFont.call(manager, family, fallback, asset);
    };
    manager.deleteFont = index => {
        const entry = original.getFonts.call(manager).at(index);
        const key = entry?.name.toLowerCase();
        const removed = key && references.get(key);
        if (removed) references.delete(key);
        original.deleteFont.call(manager, index);
        if (removed?.css) void manager.updateRenderer();
        if (removed) vm.runtime.emitProjectChanged();
    };
    manager.clear = () => {
        generation++;
        const hadWebFonts = references.size > 0;
        references.clear();
        original.clear.call(manager);
        if (hadWebFonts) void manager.updateRenderer();
    };
    manager.getFonts = () => original.getFonts.call(manager).map(font => {
        const reference = references.get(font.name.toLowerCase())?.reference;
        return reference ? {...font, webFont: reference} : font;
    });
    manager.serializeJSON = () => original.serializeJSON.call(manager)?.map(font => {
        const reference = references.get(font.family.toLowerCase())?.reference;
        return reference && !fallbackOnly.has(manager) ? {...font, webFont: reference} : font;
    }) ?? null;

    manager.deserialize = async (input, zip, keepExisting) => {
        const existing = new Set(keepExisting ? manager.getFonts().map(font => font.name.toLowerCase()) : []);
        const nativeLoad = original.deserialize.call(manager, input, zip, keepExisting);
        const current = generation;
        await nativeLoad;
        if (!Array.isArray(input) || generation !== current) return;
        const loaded = new Map(manager.serializeJSON()?.map(font => [font.family.toLowerCase(), font]));
        const found: WebFont[] = [];
        for (const row of input) {
            if (row?.system !== true || typeof row.family !== 'string' || typeof row.fallback !== 'string') continue;
            const key = row.family.toLowerCase();
            if (existing.has(key)) continue;
            existing.add(key);
            const accepted = loaded.get(key);
            if (!accepted?.system || accepted.family !== row.family || accepted.fallback !== row.fallback) continue;
            const font = row.webFont?.provider === 'google-fonts' &&
                webFonts.find(entry => entry.id === row.webFont.id && entry.family === row.family);
            if (font && manager.isValidCustomFont(font.family)) found.push(font);
        }
        if (!found.length) return;
        const approved = await approve(found.map(font => font.family));
        if (generation !== current) return;
        const faces = approved ? await Promise.all(found.map(read)) : [];
        if (generation !== current) return;
        found.forEach((font, index) => register(font, faces[index]));
        await manager.updateRenderer();
        manager.changed();
    };

    editors.set(manager, {
        async add(id, fallback) {
            const font = webFonts.find(entry => entry.id === id);
            if (!font || !allowedFallback(fallback) || !manager.isValidCustomFont(font.family) ||
                manager.hasFont(font.family)) return false;
            const current = generation;
            const bytes = await read(font);
            if (current !== generation || manager.hasFont(font.family)) return false;
            register(font, bytes);
            original.addSystemFont.call(manager, font.family, fallback);
            await manager.updateRenderer();
            if (current !== generation) return false;
            vm.runtime.emitProjectChanged();
            return true;
        }
    });

    return () => {
        generation++;
        references.clear();
        Object.assign(manager, original);
        void manager.updateRenderer();
        editors.delete(manager);
    };
}
