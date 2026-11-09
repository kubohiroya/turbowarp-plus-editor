import JSZip from '@turbowarp/jszip';
import {beginProjectLoad} from '@kubohiroya/turbowarp-plus-editor-ui/project-load-progress';
import {beginProjectArchiveRead} from '../extension-host/shared-project-archive.ts';
import {projectSerializationOptions} from '@kubohiroya/turbowarp-extension-loader/scratch-vm';
import type {ProjectArchive} from '../extension-host/shared-project-archive.ts';

export const PROJECT_INFO_KEY = 'turboWarpPlusProject';
const fields = ['title', 'description', 'author', 'contact'];
const empty = () => ({schemaVersion: 1, title: '', description: '', author: '', contact: '',
    createdAt: null, updatedAt: null});
const clone = value => JSON.parse(JSON.stringify(value));
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
const maxInfoBytes = 32 * 1024 * 1024;
const projectInfo = project => {
    const value = project?.[PROJECT_INFO_KEY];
    return value && typeof value === 'object' && !Array.isArray(value) ? clone(value) : null;
};
const archiveInfo = (archive?: ProjectArchive) =>
    archive && archive.projectBytes <= maxInfoBytes ? projectInfo(archive.project) : null;
const normalize = value => ({...empty(), ...value,
    ...Object.fromEntries(fields.map(key => [key, typeof value?.[key] === 'string' ? value[key] : ''])),
    createdAt: validDate(value?.createdAt), updatedAt: validDate(value?.updatedAt)});

/** Read only this host's metadata. Project validation and extension manifests remain with the VM/Loader. */
async function readInfo(input) {
    try {
        let project;
        if (typeof input === 'string') project = JSON.parse(input);
        else if (input && typeof input === 'object' && !ArrayBuffer.isView(input) &&
            !(input instanceof ArrayBuffer) && !(typeof Blob !== 'undefined' && input instanceof Blob)) project = input;
        else {
            const bytes = typeof Blob !== 'undefined' && input instanceof Blob ? await input.arrayBuffer() : input;
            const array = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) :
                new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            const prefix = new TextDecoder().decode(array.subarray(0, 64)).trimStart();
            if (prefix.startsWith('{')) return readInfo(JSON.parse(new TextDecoder().decode(array)));
            // Old .sb/.sb2 inputs are left entirely to the VM.
            const zip = await JSZip.loadAsync(bytes);
            const file = zip.file('project.json');
            if (!file || (file as typeof file & {_data?: {uncompressedSize?: number}})._data?.uncompressedSize > maxInfoBytes) return null;
            project = JSON.parse(await file.async('string'));
        }
        return projectInfo(project);
    } catch (error) { return null; }
}

/**
 * Install after the extension persistence bridge and release before it. Serialization reads the
 * latest native title; only completed whole-project exports advance the modification date.
 */
interface ProjectState {
    isNew?(): boolean;
    getTitle?(): string;
    setTitle?(title: string): void;
}
interface LoadState {
    phase: string;
    sequence: number;
    title?: string;
    code?: string;
    message?: string;
}
export function installProjectProperties(vm, {
    projectState = {}, now = () => new Date().toISOString(), metadataEnabled = true, runProjectLoad, shareArchives = false
}: {projectState?: ProjectState; now?: () => string; metadataEnabled?: boolean;
    runProjectLoad?: <T>(run: () => Promise<T>) => Promise<T>; shareArchives?: boolean} = {}) {
    // Diagnostics observes loads even when metadata editing and serialization are disabled.
    const names = ['loadProject', ...(metadataEnabled ?
        ['toJSON', 'saveProjectSb3', 'saveProjectSb3Stream', 'saveProjectSb3DontZip'] : [])];
    const originals = Object.fromEntries(names.filter(name => typeof vm[name] === 'function').map(name => [name, vm[name]]));
    const descriptors = Object.fromEntries(Object.keys(originals).map(name => [name, Object.getOwnPropertyDescriptor(vm, name)]));
    let info = null;
    let baseline = null;
    let loading = 0;
    let generation = 0;
    let transaction = null;
    let saveSerial = 0;
    let lastCommittedSave = 0;
    let disposed = false;
    let loadQueue = Promise.resolve();
    let loadState: LoadState = {phase: 'idle', sequence: 0};
    const listeners = new Set<() => void>();
    const notify = () => {
        // Presentation subscribers cannot change the result of loading or saving a project.
        for (const listener of listeners) { try { listener(); } catch (error) { /* Keep the project lifecycle intact. */ } }
    };
    const current = () => {
        const value = normalize(info);
        value.title = projectSerializationOptions(vm)?.title ?? projectState.getTitle?.() ?? value.title;
        return value;
    };
    const fingerprint = () => {
        const json = JSON.parse(originals.toJSON.call(vm));
        delete json[PROJECT_INFO_KEY];
        delete json.meta;
        const value = current();
        return JSON.stringify([json, fields.map(key => value[key])]);
    };
    const commit = receipt => {
        if (disposed || receipt.generation !== generation || receipt.serial < lastCommittedSave) return;
        lastCommittedSave = receipt.serial;
        // Applying properties or editing blocks during compression must remain unsaved.
        if (JSON.stringify(info) === receipt.previous || receipt.fingerprint === fingerprint()) info = receipt.info;
        baseline = receipt.fingerprint;
        notify();
    };
    const save = (original, args, stream = false) => {
        if (loading) throw new Error('Wait for project loading to finish before saving');
        const options = projectSerializationOptions(vm);
        if (options?.preview) return original.apply(vm, args);
        const print = fingerprint();
        const value = info?.schemaVersion === 1 ? current() : info;
        const receipt = {generation, serial: ++saveSerial, fingerprint: print, previous: JSON.stringify(info),
            info: value ? {...value} : null};
        if (receipt.info?.schemaVersion === 1 && print !== baseline) receipt.info.updatedAt = now();
        transaction = receipt;
        let result;
        try { result = original.apply(vm, args); } finally { transaction = null; }
        if (options?.deferCommit) {
            options.deferCommit(() => commit(receipt));
        } else if (stream) {
            result.on('end', () => commit(receipt));
        } else if (result && typeof result.then === 'function') {
            return result.then(output => { commit(receipt); return output; });
        } else commit(receipt);
        return result;
    };
    const wrappers = {
        loadProject(input, ...args) {
            if (disposed) return Promise.reject(new Error('Project properties were disposed'));
            loading++;
            const progress = beginProjectLoad(vm, input);
            const archive = shareArchives ? beginProjectArchiveRead(vm, input) : undefined;
            const isNew = projectState.isNew?.() === true;
            // The authoring controller identifies its own load in the synchronous start callback.
            // Metadata reading must not defer that callback beyond the caller's ownership scope.
            let nativeLoad;
            const load = () => originals.loadProject.call(vm, input, ...args);
            const invoke = () => archive ? archive.invoke(load) : load();
            try { nativeLoad = progress ? progress.invoke(invoke) : invoke(); }
            catch (error) { nativeLoad = Promise.reject(error); }
            const settled = Promise.resolve(nativeLoad).then(value => ({value}), error => ({error, failed: true}));
            const run = async () => {
                if (disposed) throw new Error('Project properties were disposed');
                const sequence = ++generation;
                loadState = {phase: 'loading', sequence};
                notify();
                let loaded = metadataEnabled && !archive ? await readInfo(input) : null;
                try {
                    if (disposed) throw new Error('Project properties were disposed');
                    const outcome = await settled;
                    if (metadataEnabled && archive) {
                        if (archive.read.original) loaded = archiveInfo(archive.read.original);
                        else if (!('failed' in outcome)) loaded = await readInfo(input);
                    }
                    if ('failed' in outcome) throw outcome.error;
                    const result = outcome.value;
                    if (disposed) return result;
                    if (metadataEnabled) {
                        info = loaded || (isNew ? {...empty(), createdAt: now()} : null);
                        if (info?.schemaVersion === 1 && info.title) projectState.setTitle?.(info.title);
                        baseline = fingerprint();
                    }
                    loadState = {phase: 'loaded', sequence};
                    notify();
                    return result;
                } catch (error) {
                    loadState = {phase: 'failed', sequence, title: loaded?.title,
                        code: error.code, message: error.message || String(error)};
                    notify();
                    throw error;
                }
            };
            const result = loadQueue.then(() => runProjectLoad ? runProjectLoad(run) : run());
            loadQueue = result.catch(() => {});
            return result.finally(() => {
                loading--;
                progress?.finish();
            });
        },
        toJSON(...args) {
            const raw = originals.toJSON.apply(vm, args);
            if (args[0]) return raw;
            const value = transaction ? transaction.info : info?.schemaVersion === 1 ? current() : info;
            if (!value) return raw;
            return JSON.stringify({...JSON.parse(raw), [PROJECT_INFO_KEY]: value});
        },
        saveProjectSb3(...args) { return save(originals.saveProjectSb3, args); },
        saveProjectSb3Stream(...args) { return save(originals.saveProjectSb3Stream, args, true); },
        saveProjectSb3DontZip(...args) { return save(originals.saveProjectSb3DontZip, args); }
    };
    for (const name of Object.keys(originals)) vm[name] = wrappers[name];
    return {
        snapshot: () => ({...current(), readOnly: Boolean(info && info.schemaVersion !== 1), loading: loading > 0}),
        loadState: () => ({...loadState}),
        subscribe (listener) { listeners.add(listener); return () => listeners.delete(listener); },
        loadedTitle: () => info?.schemaVersion === 1 && typeof info.title === 'string' && info.title ? info.title : undefined,
        restoreTitle () { const title = this.loadedTitle(); if (title !== undefined) projectState.setTitle?.(title); },
        apply (draft) {
            if (!metadataEnabled || disposed || loading || (info && info.schemaVersion !== 1)) {
                throw new Error('Project properties are not editable');
            }
            const previous = current();
            const next = {...previous, ...Object.fromEntries(fields.map(key =>
                [key, String(draft[key] ?? previous[key])]))};
            next.title = next.title.slice(0, 100);
            next.author = next.author.trim(); next.contact = next.contact.trim();
            if (fields.every(key => next[key] === previous[key])) return false;
            info = next;
            projectState.setTitle?.(next.title);
            vm.runtime?.emitProjectChanged?.();
            notify();
            return true;
        },
        dispose () {
            disposed = true;
            generation++;
            listeners.clear();
            for (const [name, original] of Object.entries(originals)) {
                if (vm[name] !== wrappers[name]) continue;
                if (descriptors[name]) Object.defineProperty(vm, name, {...descriptors[name], value: original});
                else delete vm[name];
            }
        }
    };
}
