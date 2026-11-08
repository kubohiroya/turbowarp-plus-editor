import {configurePayloads, decodePayloads, encodePayloads, inventory} from './codec.ts';
import {nativeAssetConversion} from './native-assets.ts';
import type {ProjectArchive} from '../extension-host/shared-project-archive.ts';

const projectFiles = vm => Object.fromEntries(vm.serializeAssets().map(({fileName, fileContent}) =>
    [fileName, fileContent]));

const installed = new WeakMap();
export const saveProjectForPackager = vm => installed.get(vm)?.saveExpanded() ?? vm.saveProjectSb3('arraybuffer');

export function createProjectPayloadHost(vm, {fetch, cache, approve, validate, canEdit, vmModules}) {
    let selection = new Map();
    let revision = 0;
    let expanded = 0;
    const currentItems = () => inventory(JSON.parse(vm.toJSON()), projectFiles(vm));
    const ensureCurrent = expected => {
        if (expected !== revision) throw new Error('The project changed. Reopen its payload settings.');
    };
    const host = {
        canEdit,
        canConvert: canEdit && Boolean(vmModules?.assetUploads),
        convert() {
            const expected = revision;
            return nativeAssetConversion(vm, vmModules, () => ensureCurrent(expected));
        },
        get active() { return !expanded && selection.size > 0; },
        loadStarted() { revision++; },
        clear() { selection = new Map(); },
        dispose() { installed.delete(vm); },
        read(input, signal, archive?: ProjectArchive) {
            return decodePayloads(input, {fetch, cache, approve, validate, signal, archive});
        },
        async loaded(result, signal) {
            selection = result.settings;
            revision++;
            if (cache && result.claims?.length) {
                // Complete writes before the next queued project changes the cache bucket.
                await Promise.all(result.claims.map(([key, bytes]) => cache.put(key, bytes, {signal}).catch(() => {})));
            }
        },
        edit() {
            const expected = revision;
            const items = currentItems();
            return {
                items: [...items].map(([id, {kind, label, key}]) =>
                    ({id, kind, label, key, format: selection.get(id)?.format, url: selection.get(id)?.url})),
                async apply(choices, signal) {
                    ensureCurrent(expected);
                    const next = await configurePayloads(items, choices, {fetch, signal});
                    signal.throwIfAborted();
                    ensureCurrent(expected);
                    const live = currentItems();
                    for (const [id, entry] of next) {
                        const item = live.get(id);
                        if (!item || (entry.bytes && (entry.bytes.length !== item.bytes.length ||
                            !entry.bytes.every((byte, index) => byte === item.bytes[index])))) {
                            throw new Error('A selected payload changed. Reopen its payload settings.');
                        }
                    }
                    selection = next;
                    revision++;
                    vm.runtime.emitProjectChanged();
                }
            };
        },
        writeZip(zip) {
            const {files, removed} = encodePayloads(JSON.parse(vm.toJSON()), projectFiles(vm), selection);
            for (const name of removed) zip.remove(name);
            for (const [name, bytes] of Object.entries(files)) {
                if (name === 'project.json' || name.startsWith('plus-payloads/')) {
                    if (name !== 'project.json' && zip.file(name)) throw new Error(`SB3 payload path is occupied: ${name}`);
                    zip.file(name, bytes, {date: new Date(1591657163000), compression: 'DEFLATE', createFolders: false});
                }
            }
            return zip;
        },
        saveExpanded() {
            expanded++;
            try { return vm.saveProjectSb3('arraybuffer'); } finally { expanded--; }
        }
    };
    installed.set(vm, host);
    return host;
}
