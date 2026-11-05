/**
 * Adding, configuring and removing a project's extensions, serialized against the VM.
 *
 * Moved from the fork's `src/lib/tw-plus-extension-authoring.js`. The host installed from here
 * makes one of these and keeps it in the map below; the extension library reads it back through
 * `getExtensionAuthoringHost`, so both sides of that handover now live on this side.
 */

/* global AggregateError */
import JSZip from '@turbowarp/jszip';
import {createProjectUUID, prepareExtensionAddition} from '@kubohiroya/turbowarp-extension-loader/project-authoring';
import {
    prepareCatalogExtensionChanges, readProjectAuthoringState
} from '@kubohiroya/turbowarp-extension-loader/project-catalog';

import {createProjectAddresser} from './project-address.ts';

import type {AuthoringPorts} from '@kubohiroya/turbowarp-extension-loader/project-authoring';
import type {LoaderOptions, DiagnosticEvent} from '@kubohiroya/turbowarp-extension-loader';

const hosts = new WeakMap<object, ReturnType<typeof createExtensionAuthoringController>>();
const failure = (code, message) => Object.assign(new Error(message), {code});

/**
 * Keep project mutations outside the presentation layer and inside the active host.
 * @param {object} vm The VM owned by this host.
 * @returns {object} The serialized authoring lifecycle.
 */
export const createExtensionAuthoringController = (vm, {
    ports, diagnostics = () => {}, prepareAddition = prepareExtensionAddition, zip = JSZip, loaderOptions,
    // What the host accepts when reading a project's embedded extensions. The limits belong to the
    // distribution, so the host that installs this controller passes them in.
    archiveOptions = {},
    // Where the editor was opened (`location.origin`, no path). A project that gets its first
    // manifest here is given its default address under this origin; the editor entry reads it
    // from the page and passes it in, so nothing in here looks at `location`.
    origin, createUUID = createProjectUUID
}: {
    ports?: AuthoringPorts & {registrar?: ReturnType<typeof import('./registrar.ts').createVMExtensionRegistrar>};
    diagnostics?: (event: DiagnosticEvent & {message?: string}) => void;
    prepareAddition?: typeof prepareExtensionAddition;
    zip?: typeof JSZip;
    loaderOptions?: LoaderOptions;
    archiveOptions?: object;
    origin?: string;
    createUUID?: () => string;
} = {}) => {
    // Null where no address can be made: the origin is not HTTPS (see `project-address.ts`).
    const addressProject = createProjectAddresser(origin, createUUID);
    let revision = 0;
    let pending;
    let ownLoad = false;
    const ownInputs = new Set();
    let disposed = false;
    const disposalListeners = new Set<() => void>();
    const changed = () => {
        revision++;
        if (pending && !ownLoad) pending.controller.abort();
    };
    vm.on('PROJECT_CHANGED', changed);
    const load = bytes => {
        // The diagnostics/metadata wrapper can defer the host's load-start callback. Claim this
        // input now so a delayed callback neither cancels this operation nor changes its revision.
        revision++;
        ownInputs.add(bytes);
        ownLoad = true;
        try {
            return Promise.resolve(vm.loadProject(bytes)).finally(() => ownInputs.delete(bytes));
        } catch (error) {
            ownInputs.delete(bytes);
            throw error;
        } finally {
            ownLoad = false;
        }
    };
    return Object.freeze({
        projectLoadStarted (input) {
            if (!ownInputs.has(input)) changed();
        },
        onDispose (callback: () => void) {
            disposalListeners.add(callback);
            return () => disposalListeners.delete(callback);
        },
        async apply (request, {signal, onPrepared = () => {}}: {signal?: AbortSignal; onPrepared?: (preview: unknown) => void} = {}, prepare = prepareAddition) {
            if (disposed) throw failure('LOADER_DISPOSED', 'The extension host was disposed');
            if (pending) throw failure('PROJECT_BUSY', 'Another extension is being added');
            if (signal?.aborted) throw failure('CANCELLED', 'Extension addition cancelled');
            const operation = {controller: new AbortController()};
            pending = operation;
            const abort = () => operation.controller.abort();
            signal?.addEventListener('abort', abort, {once: true});
            const originalRevision = revision;
            let original;
            let appliedRevision = null;
            let legacy;
            try {
                original = await vm.saveProjectSb3('arraybuffer');
                const assertCurrent = () => {
                    if (disposed || operation.controller.signal.aborted || revision !== originalRevision) {
                        throw failure('PROJECT_CHANGED', 'The project changed or extension addition was cancelled');
                    }
                };
                assertCurrent();
                let state;
                const readState = async () => {
                    if (state === undefined) state = await readProjectAuthoringState(original, {zip, archiveOptions});
                    return state;
                };
                // A project is addressed when its manifest is first written: adding an extension,
                // or a catalog selection that keeps at least one. One that already has an address
                // keeps it, because the Loader keeps the current one when it is given none. A
                // selection that leaves nothing never introduces an address.
                const writesManifest = Array.isArray(request) ? request.length > 0 : true;
                let uri;
                if (addressProject && writesManifest) {
                    const current = await readState();
                    assertCurrent();
                    if (typeof current?.uri !== 'string') uri = addressProject();
                }
                // The Loader reports a failure of its own `load()`, but not one of preparing a
                // change, so the end of a fetch it was still retrying would go unsaid and the
                // waiting indicator would stay up. Say it here, in the event shape `load()` uses.
                let prepared;
                try {
                    prepared = await prepare(original, request, ports,
                        {zip, signal: operation.controller.signal, loaderOptions,
                            archiveOptions, ...(uri === undefined ? {} : {uri})});
                } catch (error) {
                    try {
                        diagnostics({type: 'error', code: error?.code || 'LOAD_FAILED',
                            id: error?.extensionId, message: error?.message});
                    } catch (diagnosticError) {
                        // A presentation failure must not change the operation's outcome.
                    }
                    throw error;
                }
                assertCurrent();
                onPrepared(prepared.spec || prepared.manifest);
                const oldManifest = prepared.manifest ? await readState() : null;
                assertCurrent();
                const priorIds = new Set((oldManifest?.extensions || []).map(spec => spec.id));
                const legacyIds = (prepared.manifest?.extensions || []).map(spec => spec.id)
                    .filter(id => !priorIds.has(id) && vm.extensionManager.isExtensionLoaded(id));
                if (legacyIds.length) {
                    if (typeof ports?.registrar?.prepareLegacyReplacement !== 'function') {
                        throw failure('UNSUPPORTED_HOST', 'This VM cannot transfer existing extension ownership');
                    }
                    legacy = ports.registrar.prepareLegacyReplacement(legacyIds);
                }
                // The core has already obtained the host's approval for these exact bytes.
                const loading = load(prepared.projectBytes);
                appliedRevision = revision;
                await loading;
                if (disposed || operation.controller.signal.aborted || revision !== appliedRevision) {
                    throw failure('PROJECT_CHANGED', 'A different project was opened while adding the extension');
                }
                await legacy?.commit();
                // Only this serialized operation owns the legacy stage reference.
                // eslint-disable-next-line require-atomic-updates
                legacy = null;
                if (disposed || operation.controller.signal.aborted || revision !== appliedRevision) {
                    throw failure('PROJECT_CHANGED', 'The project changed while completing the extension update');
                }
                vm.emit('PROJECT_CHANGED');
                return prepared.spec || prepared.manifest;
            } catch (error) {
                if (error.committed === true) {
                    // eslint-disable-next-line require-atomic-updates
                    legacy = null;
                    diagnostics({type: 'project-error', code: 'PROJECT_RECOVERY_REQUIRED', message: error.message});
                    throw Object.assign(error, {code: 'PROJECT_RECOVERY_REQUIRED', originalProject: original});
                }
                // Never restore a stale snapshot over a newer project loaded by another caller.
                if (appliedRevision !== null && revision === appliedRevision && !disposed) {
                    const recovery = await Promise.resolve().then(async () => {
                        legacy?.rollback();
                        legacy = null;
                        await load(original);
                    })
                        .then(() => null, cause => ({cause}));
                    if (recovery) {
                        diagnostics({type: 'project-error',
                            code: 'PROJECT_RECOVERY_REQUIRED',
                            message: recovery.cause.message});
                        throw Object.assign(new AggregateError([error, recovery.cause],
                            'The original project could not be restored'), {code: 'PROJECT_RECOVERY_REQUIRED',
                            originalProject: original});
                    }
                } else if (legacy) {
                    await legacy.commit({allowMissingReplacement: true});
                    // eslint-disable-next-line require-atomic-updates
                    legacy = null;
                }
                throw error;
            } finally {
                signal?.removeEventListener('abort', abort);
                if (pending === operation) pending = null;
            }
        },
        add (request, options) {
            return this.apply(request, options);
        },
        configure (requests, options) {
            return this.apply(requests, options, prepareCatalogExtensionChanges);
        },
        async inspect () {
            if (disposed || pending) throw failure('PROJECT_BUSY', 'Wait for the active project operation');
            const current = revision;
            const input = await vm.saveProjectSb3('arraybuffer');
            const manifest = await readProjectAuthoringState(input, {zip, archiveOptions});
            if (current !== revision || disposed) {
                throw failure('PROJECT_CHANGED', 'The project changed during inspection');
            }
            return manifest;
        },
        dispose () {
            disposed = true;
            pending?.controller.abort();
            vm.off('PROJECT_CHANGED', changed);
            for (const callback of disposalListeners) callback();
            disposalListeners.clear();
        }
    });
};

export const setExtensionAuthoringHost = (vm, authoring) => {
    if (authoring) hosts.set(vm, authoring);
    else hosts.delete(vm);
};

export const getExtensionAuthoringHost = vm => hosts.get(vm);
