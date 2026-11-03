import JSZip from '@turbowarp/jszip';

export const PROJECT_INFO_KEY = 'turboWarpPlusProject';
const fields = ['title', 'description', 'author', 'contact'];
const empty = () => ({schemaVersion: 1, title: '', description: '', author: '', contact: '',
    createdAt: null, updatedAt: null});
const clone = value => JSON.parse(JSON.stringify(value));
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
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
            if (!file || file._data?.uncompressedSize > 32 * 1024 * 1024) return null;
            project = JSON.parse(await file.async('string'));
        }
        const value = project?.[PROJECT_INFO_KEY];
        return value && typeof value === 'object' && !Array.isArray(value) ? clone(value) : null;
    } catch (error) { return null; }
}

/**
 * Install after the extension persistence bridge and release before it. Serialization reads the
 * latest native title; only completed whole-project exports advance the modification date.
 */
export function installProjectProperties(vm, {projectState = {}, now = () => new Date().toISOString()} = {}) {
    const names = ['loadProject', 'toJSON', 'saveProjectSb3', 'saveProjectSb3Stream', 'saveProjectSb3DontZip'];
    const originals = Object.fromEntries(names.filter(name => typeof vm[name] === 'function').map(name => [name, vm[name]]));
    const descriptors = Object.fromEntries(Object.keys(originals).map(name => [name, Object.getOwnPropertyDescriptor(vm, name)]));
    let info = null;
    let baseline = null;
    let loading = 0;
    let generation = 0;
    let transaction = null;
    let disposed = false;
    let loadQueue = Promise.resolve();
    let loadState = {phase: 'idle', sequence: 0};
    const listeners = new Set();
    const notify = () => {
        // Presentation subscribers cannot change the result of loading or saving a project.
        for (const listener of listeners) { try { listener(); } catch (error) { /* Keep the project lifecycle intact. */ } }
    };
    const current = () => {
        const value = normalize(info);
        value.title = projectState.getTitle?.() ?? value.title;
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
        if (disposed || receipt.generation !== generation) return;
        // Applying properties or editing blocks during compression must remain unsaved.
        if (JSON.stringify(info) === receipt.previous) info = receipt.info;
        baseline = receipt.fingerprint;
        notify();
    };
    const save = (original, args, stream = false) => {
        if (loading) throw new Error('Wait for project loading to finish before saving');
        const print = fingerprint();
        const value = info?.schemaVersion === 1 ? current() : info;
        const receipt = {generation, fingerprint: print, previous: JSON.stringify(info),
            info: value ? {...value} : null};
        if (receipt.info?.schemaVersion === 1 && print !== baseline) receipt.info.updatedAt = now();
        transaction = receipt;
        let result;
        try { result = original.apply(vm, args); } finally { transaction = null; }
        if (stream) {
            result.on('end', () => commit(receipt));
        } else if (result && typeof result.then === 'function') {
            return result.then(output => { commit(receipt); return output; });
        } else commit(receipt);
        return result;
    };
    const wrappers = {
        loadProject(input, ...args) {
            loading++;
            const isNew = projectState.isNew?.() === true;
            const run = async () => {
                const sequence = ++generation;
                loadState = {phase: 'loading', sequence};
                notify();
                const loaded = await readInfo(input);
                try {
                    const result = await originals.loadProject.call(vm, input, ...args);
                    if (disposed) return result;
                    info = loaded || (isNew ? {...empty(), createdAt: now()} : null);
                    if (info?.schemaVersion === 1 && info.title) projectState.setTitle?.(info.title);
                    baseline = fingerprint();
                    loadState = {phase: 'loaded', sequence};
                    notify();
                    return result;
                } catch (error) {
                    loadState = {phase: 'failed', sequence, code: error.code, message: error.message || String(error)};
                    notify();
                    throw error;
                }
            };
            const result = loadQueue.then(run);
            loadQueue = result.catch(() => {});
            return result.finally(() => { loading--; });
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
            if (disposed || loading || (info && info.schemaVersion !== 1)) throw new Error('Project properties are not editable');
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
