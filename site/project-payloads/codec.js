import JSZip from '@turbowarp/jszip';
import {inspectZip} from '@kubohiroya/turbowarp-extension-loader/project-codec';
import {createFetchPort} from '@kubohiroya/turbowarp-extension-loader';
import {sb3SaveFormats} from '@kubohiroya/turbowarp-sb3-save-format';
import {extensionProjectArchiveOptions} from '../extension-host/config.js';

export const payloadKey = 'turboWarpPlusPayloads';
// Match the Loader's default archive bound before reading a browser File into memory.
const maxArchiveBytes = 64 * 1024 * 1024;
const maxEntry = 16 * 1024 * 1024;
const maxTotal = 32 * 1024 * 1024;
const maxEntries = 1024;
const maxDataLength = Math.ceil(maxEntry / 3) * 4;
const dataPrefix = 'data:application/octet-stream;base64,';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
const jsonDecoder = new TextDecoder('utf-8', {fatal: true});
const own = (object, key) => object && Object.hasOwn(object, key);
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const remote = format => format === 'remote-cacheable' || format === 'remote-non-cacheable';
const failure = message => Object.assign(new Error(message), {code: 'INVALID_PROJECT_PAYLOAD'});
const assert = (condition, message) => { if (!condition) throw failure(message); };
const equalBytes = (first, second) => first?.length === second?.length &&
    Boolean(first && second && first.every((value, index) => value === second[index]));
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    byte => byte.toString(16).padStart(2, '0')).join('');

const httpsURL = value => {
    let url;
    try { url = new URL(value); } catch { throw failure('An absolute HTTPS URL is required.'); }
    assert(typeof value === 'string' && value.length <= 4096 && url.protocol === 'https:' &&
        !url.username && !url.password && !url.href.includes('#'), 'Use HTTPS without credentials or a fragment.');
    return url.href;
};

const dataURL = bytes => {
    let binary = '';
    for (let index = 0; index < bytes.length; index += 8192) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    }
    return dataPrefix + btoa(binary);
};

const dataBytes = data => {
    assert(typeof data === 'string' && data.startsWith(dataPrefix) &&
        data.length <= dataPrefix.length + maxDataLength, 'Invalid embedded payload data.');
    const bytes = Uint8Array.from(atob(data.slice(dataPrefix.length)), char => char.charCodeAt(0));
    assert(dataURL(bytes) === data, 'Invalid embedded payload encoding.');
    return bytes;
};

const documentOwners = project => {
    const storage = project.extensionStorage;
    const bundle = storage?.kubohiroyakamishibai4;
    const runtime = storage?.kubohiroyakamishibairuntime4;
    return {
        bundled: [bundle, bundle?.components?.kubohiroyakamishibairuntime4],
        unbundled: [runtime, runtime]
    };
};

// Restore exactly the same owner slots before VM load, preserving the owner's integrity metadata.
function sourceSlots(project) {
    const slots = new Map();
    for (const [id, [storageOwner, owner]] of Object.entries(documentOwners(project))) {
        if (!record(owner) || Object.keys(storageOwner?.documentSourceLocations?.urls || {}).length) continue;
        if (record(owner.source) && owner.source.mode === 'embedded') {
            slots.set(id, {record: owner.source, field: 'text', label: owner.source.displayName || '台本 YAML'});
        }
        for (const [path, file] of Object.entries(owner.sourceDocuments?.files || {})) {
            if (record(file)) slots.set(`${id}/${path}`, {record: file, field: 'source', label: path});
        }
    }
    return slots;
}

const assetNames = project => {
    const assets = new Map();
    for (const target of project.targets || []) {
        for (const asset of [...(target.costumes || []), ...(target.sounds || [])]) {
            const file = asset.md5ext || (asset.assetId && asset.dataFormat && `${asset.assetId}.${asset.dataFormat}`);
            if (typeof file === 'string' && /^[0-9a-f]{32}\.[a-z0-9]+$/u.test(file)) assets.set(file, asset.name || file);
        }
    }
    return assets;
};

const bundledAssetSlots = project => {
    const slots = new Map();
    for (const [ownerId, [, owner]] of Object.entries(documentOwners(project))) {
        const files = owner?.assets?.files;
        if (owner?.assets?.formatVersion !== 1 || !Array.isArray(files)) continue;
        for (const file of files) {
            if (record(file) && typeof file.assetId === 'string' && typeof file.path === 'string' &&
                file.encoding === 'base64') {
                const key = JSON.stringify([ownerId, file.assetId, file.path]);
                slots.set(key, {record: file, label: `${file.assetId} / ${file.path}`});
            }
        }
    }
    return slots;
};

const itemId = ({kind, key}) => `${kind}:${key}`;
const filePath = (entry, index, bundled) => entry.kind === 'assets' && !bundled ?
    entry.key : `plus-payloads/${entry.kind}-${index}.bin`;

export function bundleMaterials(project) {
    const materials = [];
    for (const [key, slot] of bundledAssetSlots(project)) {
        const {assetId, path, data} = slot.record;
        if (typeof data !== 'string' || data.length > maxDataLength) continue;
        materials.push({key, label: slot.label, name: assetId, path, bytes: dataBytes(dataPrefix + data)});
    }
    return materials;
}

export function inventory(project, assets) {
    const items = new Map();
    for (const [key, slot] of sourceSlots(project)) {
        if (typeof slot.record[slot.field] !== 'string') continue;
        const item = {kind: 'source', key, label: slot.label, bytes: encoder.encode(slot.record[slot.field])};
        items.set(itemId(item), item);
    }
    for (const {key, label, bytes} of bundleMaterials(project)) {
        const item = {kind: 'assets', key, label, bytes};
        items.set(itemId(item), item);
    }
    for (const [key, label] of assetNames(project)) {
        const bytes = assets[key];
        if (!(bytes instanceof Uint8Array)) continue;
        const item = {kind: 'assets', key, label, bytes};
        items.set(itemId(item), item);
    }
    return items;
}

function checkSize(bytes, total) {
    assert(bytes instanceof Uint8Array && bytes.length <= maxEntry, 'A payload exceeds its byte limit.');
    total += bytes.length;
    assert(total <= maxTotal, 'The project payloads exceed their total byte limit.');
    return total;
}

const fetcher = fetch => createFetchPort(
    (url, options) => fetch(url, {...options, cache: 'no-store'}), {retries: 0});
async function readURL(fetch, url, signal) {
    signal?.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    const timer = setTimeout(() => controller.abort(failure('The payload request timed out.')), 15000);
    signal?.addEventListener('abort', abort, {once: true});
    try {
        return (await fetcher(fetch).fetch(url, {maxBytes: maxEntry, signal: controller.signal})).bytes;
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
    }
}

export async function configurePayloads(items, choices, {fetch = globalThis.fetch, signal} = {}) {
    assert(choices.size <= maxEntries, 'Too many project payloads are selected.');
    const selected = new Map();
    let total = 0;
    for (const [id, choice] of choices) {
        const item = items.get(id);
        assert(item && sb3SaveFormats.includes(choice.format), 'The payload or its format is unavailable.');
        total = checkSize(item.bytes, total);
        const entry = {kind: item.kind, key: item.key, format: choice.format};
        if (remote(entry.format)) {
            entry.url = httpsURL(choice.url);
            const bytes = await readURL(fetch, entry.url, signal);
            assert(equalBytes(bytes, item.bytes), `The URL does not match the current bytes for ${item.label}.`);
            entry.sha256 = await digest(bytes);
            entry.bytes = bytes;
        }
        selected.set(id, entry);
    }
    return selected;
}

/** Rewrite only the selected items. VM asset buffers are never modified. */
export function encodePayloads(project, assets, settings) {
    const files = {...assets};
    const sources = sourceSlots(project);
    const bundledAssets = bundledAssetSlots(project);
    const items = inventory(project, assets);
    const entries = [];
    const removed = [];
    let total = 0;
    for (const [id, setting] of settings) {
        const item = items.get(id);
        if (!item) continue; // The document or asset was removed from the project.
        const {bytes} = item;
        total = checkSize(bytes, total);
        const {kind, key, format, url, sha256} = setting;
        if (remote(format)) {
            assert(equalBytes(bytes, setting.bytes),
                `The remote reference no longer matches ${item.label}. Update its URL or storage format.`);
        }
        const entry = {kind, key, format, ...(url ? {url, sha256} : {})};
        if (format === 'embedded-data') entry.data = dataURL(bytes);
        const bundled = bundledAssets.get(key);
        if (kind === 'source' || bundled) {
            const slot = bundled ? {record: bundled.record, field: 'data'} : sources.get(key);
            delete slot.record[slot.field];
            if (format === 'embedded-file') files[filePath(entry, entries.length, bundled)] = bytes;
        } else if (format !== 'embedded-file') {
            delete files[key];
            removed.push(key);
        }
        entries.push(entry);
    }
    if (entries.length) project[payloadKey] = {version: 1, entries};
    else delete project[payloadKey];
    const json = encoder.encode(JSON.stringify(project));
    assert(json.length <= extensionProjectArchiveOptions.maxProjectBytes, 'The project JSON exceeds its byte limit.');
    return {files: {...files, 'project.json': json}, removed};
}

const readEntry = async (zip, path, limit) => {
    const entry = zip?.file(path);
    assert(entry, `The SB3 is missing ${path}.`);
    return new Promise((resolve, reject) => {
        const stream = entry.internalStream('uint8array');
        const chunks = [];
        let size = 0;
        stream.on('data', chunk => {
            size += chunk.length;
            if (size > limit) {
                stream.pause();
                reject(failure(`The SB3 entry ${path} exceeds its byte limit.`));
            } else chunks.push(chunk);
        }).on('error', reject).on('end', () => {
            const bytes = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
            resolve(bytes);
        }).resume();
    });
};

export async function decodePayloads(input, {fetch = globalThis.fetch, cache, approve, validate, signal} = {}) {
    const {maxProjectBytes} = extensionProjectArchiveOptions;
    if (input instanceof Blob || input instanceof Uint8Array || input instanceof ArrayBuffer) {
        assert((input instanceof Blob ? input.size : input.byteLength) <= maxArchiveBytes, 'The SB3 exceeds its byte limit.');
    } else if (typeof input === 'string') {
        assert(input.length <= maxProjectBytes, 'The project JSON exceeds its byte limit.');
    }
    const bytes = input instanceof Blob ? new Uint8Array(await input.arrayBuffer()) :
        input instanceof ArrayBuffer ? new Uint8Array(input) : input;
    let zip;
    let project;
    if (bytes instanceof Uint8Array && bytes[0] === 0x50 && bytes[1] === 0x4b) {
        inspectZip(bytes, extensionProjectArchiveOptions);
        zip = await JSZip.loadAsync(bytes);
        project = JSON.parse(jsonDecoder.decode(await readEntry(zip, 'project.json', extensionProjectArchiveOptions.maxProjectBytes)));
    } else if (typeof bytes === 'string' || bytes instanceof Uint8Array) {
        const json = typeof bytes === 'string' ? bytes : jsonDecoder.decode(bytes);
        if (!json.includes(payloadKey)) return {input, settings: new Map()};
        project = JSON.parse(json);
    } else if (own(bytes, payloadKey)) {
        project = JSON.parse(JSON.stringify(bytes));
    }
    const manifest = project?.[payloadKey];
    if (!own(project, payloadKey)) return {input, settings: new Map()};
    // Validate the original archive as well as the reconstructed one. In particular, moving a
    // selected entry out of the ZIP must not hide a CRC or size error from the Loader.
    await validate?.(input, {signal});
    assert(record(manifest) && Object.keys(manifest).length === 2 && manifest.version === 1 && Array.isArray(manifest.entries) &&
        manifest.entries.length <= maxEntries, 'Invalid SB3 payload manifest.');
    const sources = sourceSlots(project);
    const assets = assetNames(project);
    const bundledAssets = bundledAssetSlots(project);
    const settings = new Map();
    const urls = new Set();
    for (const entry of manifest.entries) {
        assert(record(entry) && typeof entry.key === 'string' && sb3SaveFormats.includes(entry.format) &&
            ((entry.kind === 'source' && sources.has(entry.key)) || (entry.kind === 'assets' && (assets.has(entry.key) || bundledAssets.has(entry.key)))),
        'The SB3 payload manifest names an unknown item or format.');
        const id = itemId(entry);
        assert(!settings.has(id), 'The SB3 payload manifest repeats an item.');
        const {kind, key, format} = entry;
        const fields = ['kind', 'key', 'format', ...(remote(format) ? ['url', 'sha256'] :
            format === 'embedded-data' ? ['data'] : [])];
        assert(Object.keys(entry).length === fields.length && fields.every(field => own(entry, field)),
            'The SB3 payload manifest contains unexpected fields.');
        const selection = {kind, key, format};
        if (remote(format)) {
            const url = httpsURL(entry.url);
            assert(typeof entry.sha256 === 'string' && /^[0-9a-f]{64}$/u.test(entry.sha256),
                'A remote SB3 payload requires a SHA-256 digest.');
            urls.add(url);
            Object.assign(selection, {url, sha256: entry.sha256});
        }
        settings.set(id, selection);
    }
    const useCache = urls.size && await approve?.([...urls], [...settings.values()].some(entry =>
        entry.format === 'remote-cacheable'), signal);
    assert(!urls.size || typeof useCache === 'boolean', 'Opening remote project payloads was cancelled.');
    if (!zip && assets.size) zip = new JSZip();
    let total = 0;
    let index = 0;
    const claims = [];
    for (const entry of settings.values()) {
        signal?.throwIfAborted();
        let content;
        const {format, kind, key} = entry;
        const bundled = bundledAssets.get(key);
        if (remote(format)) {
            const store = useCache && format === 'remote-cacheable' ? cache : undefined;
            if (store) content = await store.get(entry.sha256, {signal}).catch(() => undefined);
            if (!(content instanceof Uint8Array) || content.length > maxEntry || await digest(content) !== entry.sha256) {
                content = await readURL(fetch, entry.url, signal);
                assert(await digest(content) === entry.sha256, `The remote payload changed at ${entry.url}.`);
            }
            entry.bytes = content;
            if (store) claims.push([entry.sha256, content]);
        } else if (format === 'embedded-data') content = dataBytes(manifest.entries[index].data);
        else content = await readEntry(zip, filePath(entry, index, bundled), maxEntry);
        total = checkSize(content, total);
        if (kind === 'source' || bundled) {
            const slot = bundled ? {record: bundled.record, field: 'data'} : sources.get(key);
            assert(!own(slot.record, slot.field), 'The SB3 repeats data in different carriers.');
            slot.record[slot.field] = bundled ? dataURL(content).slice(dataPrefix.length) : decoder.decode(content);
            if (format === 'embedded-file') zip.remove(filePath(entry, index, bundled));
        } else if (format !== 'embedded-file') {
            assert(!zip.file(key), 'The SB3 repeats an asset in different carriers.');
            zip.file(key, content);
        }
        index++;
    }
    delete project[payloadKey];
    const json = JSON.stringify(project);
    assert(encoder.encode(json).length <= extensionProjectArchiveOptions.maxProjectBytes,
        'The restored project JSON exceeds its byte limit.');
    if (zip) {
        const folder = 'plus-payloads/';
        if (zip.files[folder]?.dir && !Object.keys(zip.files).some(name => name !== folder && name.startsWith(folder))) {
            zip.remove(folder);
        }
        zip.file('project.json', json);
    }
    const restored = zip ? await zip.generateAsync({type: 'uint8array', compression: 'DEFLATE'}) : json;
    return {input: restored, settings, claims};
}
