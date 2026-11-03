/**
 * The bridge that puts this loader in front of the VM's project lifecycle.
 *
 * Moved from the fork's `src/lib/tw-plus-project-loader.js`. It touches no GUI module: everything
 * it needs about the VM arrives as `host.vm`, and marking a failure as an extension failure — the
 * fork's own bookkeeping, read by its project-error paths — arrives as `host.markFailure`.
 *
 * Whether opening again could end differently is asked of the Loader here, the one place that
 * holds the error, and travels on the `project-error` diagnostic as `retryable` for whatever
 * screen states the failure.
 */

import {isWorthAskingAgain} from '@kubohiroya/turbowarp-extension-loader';

const installations = new WeakSet();

const failure = (code, message) => Object.assign(new Error(message), {code});

/**
 * Stage a GUI bridge around a host with transactional extension registration.
 * Project decoding, validation, persistence and trust belong to the Loader core.
 * This is deliberately not installed automatically on an arbitrary Scratch VM.
 */
export function installExtensionLoader(host, loader) {
    const vm = host?.vm;
    const io = host?.projectIO;
    if (host?.transactionalRegistration !== true || !vm || !io ||
        ['loadProject', '_loadExtensions', 'toJSON', '_saveProjectZip', 'saveProjectSb3DontZip']
            .some(name => typeof vm[name] !== 'function') ||
        ['prepare', 'restoreJSON', 'restoreFiles', 'restoreArchive'].some(name => typeof io[name] !== 'function') ||
        !loader || typeof loader.load !== 'function' || typeof loader.unload !== 'function') {
        throw failure('UNSUPPORTED_HOST', 'A transactional registrar and Loader project codec are required');
    }
    if (installations.has(vm)) throw failure('ALREADY_INSTALLED', 'The Loader bridge is already installed');

    const originals = Object.fromEntries(
        ['loadProject', '_loadExtensions', 'toJSON', '_saveProjectZip', 'saveProjectSb3DontZip']
            .map(name => [name, vm[name]])
    );
    const descriptors = Object.fromEntries(Object.keys(originals).map(name => [name,
        Object.getOwnPropertyDescriptor(vm, name)]));
    for (const descriptor of Object.values(descriptors)) {
        if (descriptor && (!Object.hasOwn(descriptor, 'value') || !descriptor.writable)) {
            throw failure('UNSUPPORTED_HOST', 'VM lifecycle hooks must be writable data properties');
        }
        if (!descriptor && !Object.isExtensible(vm)) {
            throw failure('UNSUPPORTED_HOST', 'VM lifecycle hooks cannot be installed on this host');
        }
    }
    let disposed = false;
    let pending = 0;
    let queue = Promise.resolve();
    let loading = null;
    let savedContext = null;
    // The address of the project open now, as its manifest names it, or undefined: none, or no
    // manifest. The host is told each time it changes, which is how the cache knows whose bucket
    // a fetched extension is filed under.
    let projectURI;
    let activeController = null;
    let hasLoaded = false;
    let drain = null;

    const checkActive = () => {
        if (disposed) throw failure('LOADER_DISPOSED', 'The Loader bridge was disposed');
    };
    const canSave = () => {
        checkActive();
        if (pending) throw failure('PROJECT_BUSY', 'Wait for project loading to finish before saving');
    };
    const tellProjectURI = uri => {
        projectURI = uri;
        if (typeof host.onProjectURI === 'function') {
            try {
                host.onProjectURI(uri);
            } catch (error) {
                // Bookkeeping must not change the loading or saving decision.
            }
        }
    };
    /**
     * The context a whole-project save restores, given its address first if it has none yet.
     *
     * A project opened with a manifest but no address gets one on its first serialization, kept in
     * `savedContext` so every later save carries the same one. One that has an address keeps it,
     * a project without a manifest gets nothing, and neither does a host that makes no address
     * (an editor not opened over HTTPS, or a built HTML, which supplies no `addressProject`).
     * @returns {object|null} The context to restore with.
     */
    const contextForSave = () => {
        if (savedContext === null || projectURI !== undefined || typeof host.addressProject !== 'function' ||
            typeof io.assignProjectURI !== 'function') return savedContext;
        const uri = host.addressProject();
        if (typeof uri !== 'string') return savedContext;
        savedContext = io.assignProjectURI(savedContext, uri);
        tellProjectURI(uri);
        return savedContext;
    };
    const restored = value => {
        if (value === null || value === undefined || typeof value.then === 'function') {
            throw failure('INVALID_PROJECT_CODEC', 'Project persistence must return a synchronous result');
        }
        return value;
    };
    const loadProject = function(input, ...args) {
        checkActive();
        if (host.onProjectLoadStart) host.onProjectLoadStart(input);
        pending++;
        const run = async () => {
            checkActive();
            const controller = new AbortController();
            activeController = controller;
            let touchedHost = false;
            try {
                const prepared = await io.prepare(input, {signal: controller.signal});
                checkActive();
                if (!prepared || !Object.hasOwn(prepared, 'manifest') || !Object.hasOwn(prepared, 'input')) {
                    throw failure('INVALID_PROJECT_CODEC', 'The Loader project codec returned no project');
                }
                // Optional presentation receives the manifest; it makes no authorization decision.
                try { host.onProjectManifest?.(prepared.manifest); } catch (error) { /* Keep loading independent of diagnostics. */ }
                touchedHost = true;
                savedContext = null;
                // Known before the VM loads, so what the Loader fetches for it is filed under it.
                tellProjectURI(typeof prepared.manifest?.uri === 'string' ? prepared.manifest.uri : undefined);
                if (hasLoaded) {
                    await loader.unload();
                    hasLoaded = false;
                }
                checkActive();
                const context = prepared.context ?? null;
                if (io.activate) io.activate(context);
                loading = {manifest: prepared.manifest, signal: controller.signal, loaded: false, registration: null};
                const result = await originals.loadProject.call(vm, prepared.input, ...args);
                checkActive();
                // A VM that never invokes the extension hook cannot load Plus projects.
                if (prepared.manifest !== null && !loading.loaded) {
                    throw failure('UNSUPPORTED_HOST', 'The VM did not invoke its extension loading hook');
                }
                savedContext = context;
                return result;
            } catch (error) {
                if (typeof host.onDiagnostic === 'function') {
                    try {
                        host.onDiagnostic({type: 'project-error', code: error.code || 'LOAD_FAILED',
                            message: error.message, retryable: isWorthAskingAgain(error)});
                    } catch (diagnosticError) {
                        // A presentation failure must not change the loading decision.
                    }
                }
                if (touchedHost) savedContext = null;
                if (touchedHost && hasLoaded) {
                    await loader.unload();
                    hasLoaded = false;
                }
                throw error;
            } finally {
                loading = null;
                activeController = null;
            }
        };
        const result = queue.then(run);
        queue = result.catch(() => {});
        return result.finally(() => { pending--; });
    };

    // The GUI reports extension failures instead of treating them as a broken Editor. Marking is
    // the GUI's bookkeeping, so it is the GUI that hands the marker in; with none, the error still
    // propagates unchanged and is reported as an ordinary project failure.
    const markFailure = typeof host.markFailure === 'function' ? host.markFailure : error => error;
    const extensionStep = async step => {
        try {
            return await step();
        } catch (error) {
            throw markFailure(error);
        }
    };
    const loadExtensions = async function(ids, urls = new Map(), ...args) {
        checkActive();
        if (!loading || loading.manifest === null) {
            return extensionStep(() => originals._loadExtensions.call(vm, ids, urls, ...args));
        }
        const context = loading;
        const listed = new Set(context.manifest.extensions.map(spec => spec.id));
        let othersLoaded = false;
        if (!context.registration && typeof host.review === 'function') {
            // Ask first, about everything: the review sees the Plus rows beside the project's other
            // extensions and answers once, before the Loader fetches or registers anything. The other
            // extensions load as that review's own step, so they are not loaded a second time below.
            const others = [...ids].filter(id => !listed.has(id));
            const otherURLs = new Map([...urls].filter(([id]) => !listed.has(id)));
            const answer = await extensionStep(() => host.review(context.manifest,
                () => originals._loadExtensions.call(vm, others, otherURLs, ...args)));
            checkActive();
            othersLoaded = true;
            context.registration = loader.load(context.manifest,
                {signal: context.signal, declineCaching: answer.declineCaching});
            context.registration.then(answer.release, answer.release);
        }
        const registration = context.registration ??= loader.load(context.manifest, {signal: context.signal});
        const result = await extensionStep(() => registration);
        hasLoaded = true;
        checkActive();
        if (!result || !Array.isArray(result.ids)) {
            throw failure('INVALID_LOADER_RESULT', 'The Loader returned no registered extension IDs');
        }
        context.loaded = true;
        if (othersLoaded) return undefined;
        const handled = new Set(result.ids);
        const remaining = [...ids].filter(id => !handled.has(id));
        const remainingURLs = new Map([...urls].filter(([id]) => !handled.has(id)));
        return extensionStep(() => originals._loadExtensions.call(vm, remaining, remainingURLs, ...args));
    };
    const toJSON = function(...args) {
        canSave();
        const json = originals.toJSON.apply(vm, args);
        // Standalone sprite export must not acquire a whole-project manifest, nor an address.
        if (savedContext === null || args[0]) return json;
        return restored(io.restoreJSON(json, contextForSave()));
    };
    const saveZip = function(...args) {
        canSave();
        const zip = originals._saveProjectZip.apply(vm, args);
        return savedContext === null ? zip : restored(io.restoreArchive(zip, contextForSave()));
    };
    const saveFiles = function(...args) {
        canSave();
        const files = originals.saveProjectSb3DontZip.apply(vm, args);
        return savedContext === null ? files : restored(io.restoreFiles(files, contextForSave()));
    };

    const wrappers = {loadProject, _loadExtensions: loadExtensions, toJSON,
        _saveProjectZip: saveZip, saveProjectSb3DontZip: saveFiles};
    const installed = [];
    try {
        for (const [name, wrapper] of Object.entries(wrappers)) {
            Object.defineProperty(vm, name, descriptors[name] ? {...descriptors[name], value: wrapper} :
                {value: wrapper, writable: true, configurable: true, enumerable: true});
            installed.push(name);
        }
    } catch (error) {
        disposed = true;
        for (const name of installed.reverse()) {
            if (descriptors[name]) Object.defineProperty(vm, name, descriptors[name]);
            else delete vm[name];
        }
        throw failure('UNSUPPORTED_HOST', `VM lifecycle hook installation failed: ${error.message}`);
    }
    installations.add(vm);

    return () => {
        if (disposed) return drain;
        disposed = true;
        activeController?.abort();
        // Keep the guarded extension hook until in-flight VM loading has ended.
        drain = queue.then(async () => {
            // Removing persistence hooks while registrations remain would lose project data.
            if (hasLoaded) {
                await loader.unload();
                hasLoaded = false;
            }
            for (const [name, wrapper] of Object.entries(wrappers)) {
                if (vm[name] === wrapper) {
                    if (descriptors[name]) Object.defineProperty(vm, name, descriptors[name]);
                    else delete vm[name];
                }
            }
            installations.delete(vm);
        });
        return drain;
    };
}
