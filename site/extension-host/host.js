/**
 * The wiring that makes an extension load happen, and what it is made of.
 *
 * Moved from the fork's `src/lib/tw-plus-extension-host.js`. Every choice in here is this
 * distribution's: which Loader packages are used, what the archive limits are, which cache, how
 * often a fetch is retried, what asks the user, and what counts as already trusted. The GUI keeps
 * none of it — it calls the socket and disposes of what comes back.
 *
 * What still comes from the GUI is what only the GUI has. Marking an error as an extension failure
 * and making an authoring controller arrive as functions, because its project-error paths and its
 * extension library read both back; with neither supplied — a distributed single HTML — the loader
 * runs without them. Whether the loader runs at all, and the archive limits, arrive as values: the
 * fork's own UI reads the same switch and the same limits, so they are defined in one place there
 * and a built HTML carries them in its bootstrap. The VM modules the registrar needs arrive the
 * same way, from whoever bundled the VM: see `registrar.js` for why they cannot be imported here.
 */

import JSZip from '@turbowarp/jszip';
import {createExtensionLoader, createFetchPort, DEFAULT_FETCH_RETRY} from '@kubohiroya/turbowarp-extension-loader';
import {createMemoryContentCache} from '@kubohiroya/turbowarp-extension-loader/memory-cache';
import {createProjectIO} from '@kubohiroya/turbowarp-extension-loader/project-codec';
import {createSessionTrustProvider} from '@kubohiroya/turbowarp-extension-loader/session-trust';

import {createPlusPermissionUI} from './permission-ui.js';
import {installExtensionLoader} from './project-loader.js';
import {createVMExtensionRegistrar} from './registrar.js';

const SHA256 = /^[0-9a-f]{64}$/;

/**
 * What a distributed single HTML trusts: only code whose actual bytes match a digest its build
 * embedded. It cannot read the catalog, because its own CSP forbids the connection, so the
 * decision this build already made travels with it as these digests.
 * @param {string[]} digests The digests embedded when the HTML was built.
 * @returns {object} Trust checks of the shape the Loader expects.
 */
const digestTrustedCatalog = digests => {
    const listed = new Set((Array.isArray(digests) ? digests : []).filter(digest => SHA256.test(digest)));
    return Object.freeze({
        isTrustedURL: () => Promise.resolve(false),
        isTrustedCode: code => Promise.resolve(listed.has(code.actualSHA256))
    });
};

/** Host-controlled wiring shared by the Editor and the bundled HTML runtime. */
export function installPlusExtensionHost (vm, {
    enabled = false, document = globalThis.document, locale = 'ja', fetchImpl = globalThis.fetch,
    cache, requestApproval, diagnostics: report, loaderOptions, hostPolicy, trustedCatalog = null, trustedDigests,
    fetchRetry, markLoadFailure, createAuthoring, setAuthoringHost, archiveOptions = {}, vmModules
} = {}) {
    if (enabled !== true) return Object.freeze({enabled: false, dispose: async () => {}});
    // A single HTML has no catalog to read; its build embeds the digests the catalog listed.
    const trusted = trustedCatalog === null && Array.isArray(trustedDigests) ?
        digestTrustedCatalog(trustedDigests) : trustedCatalog;
    const ui = createPlusPermissionUI(document, locale);
    const diagnostics = event => {
        ui.diagnostics(event);
        if (report) report(event);
    };
    // The host owns the retry settings, so only the host can say which attempt of how many this
    // is. The Loader reports the retry it is about to wait for; the attempt it leads to is next.
    const retry = {...DEFAULT_FETCH_RETRY, ...fetchRetry};
    const onRetry = ({url, attempt, delayMs}) => diagnostics({
        type: 'retry',
        attempt: attempt + 1,
        attempts: retry.retries + 1,
        delayMs,
        message: url
    });
    const projectIO = createProjectIO({zip: JSZip, ...archiveOptions});
    const approve = requestApproval || ui.requestApproval;
    const trustProvider = createSessionTrustProvider({hostPolicy,
        // Catalog-listed code is trusted like TurboWarp's official gallery and needs no separate approval.
        requestApproval: async (code, options) =>
            (trusted !== null && await trusted.isTrustedCode(code)) || approve(code, options)});
    const ports = {
        embeddedReader: projectIO.embeddedReader,
        fetcher: createFetchPort(fetchImpl, {...retry, onRetry}),
        cache: cache || createMemoryContentCache(),
        trustProvider,
        registrar: createVMExtensionRegistrar(vm, {vmModules}),
        diagnostics
    };
    const loader = createExtensionLoader(ports, loaderOptions);
    // A player built as a single HTML has no library to add an extension from, so a build that
    // supplies no controller simply runs without one.
    const authoring = typeof createAuthoring === 'function' ?
        createAuthoring(vm, {ports, diagnostics, loaderOptions, archiveOptions}) : null;
    let uninstall;
    try {
        uninstall = installExtensionLoader({vm, projectIO, transactionalRegistration: true,
            onDiagnostic: diagnostics, markFailure: markLoadFailure,
            onProjectLoadStart: authoring ? authoring.projectLoadStarted : undefined}, loader);
    } catch (error) {
        authoring?.dispose();
        ui.dispose();
        trustProvider.revokeAll();
        throw error;
    }
    if (authoring && typeof setAuthoringHost === 'function') setAuthoringHost(vm, authoring);
    let disposal;
    return Object.freeze({
        enabled: true, loader, projectIO, authoring,
        dispose () {
            if (!disposal) {
                if (authoring && typeof setAuthoringHost === 'function') setAuthoringHost(vm, null);
                authoring?.dispose();
                ui.dispose();
                trustProvider.revokeAll();
                disposal = Promise.resolve(uninstall()).then(() => loader.unload());
            }
            return disposal;
        }
    });
}
