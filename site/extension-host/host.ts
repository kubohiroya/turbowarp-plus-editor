/**
 * The wiring that makes an extension load happen, and what it is made of.
 *
 * Moved from the fork's `src/lib/tw-plus-extension-host.js`. Every choice in here is this
 * distribution's: which Loader packages are used, what the archive limits are, which cache, how
 * often a fetch is retried, what asks the user, and what counts as already trusted. The GUI keeps
 * none of it — it calls the socket and disposes of what comes back.
 *
 * Marking an error as an extension failure arrives as a function from the GUI, because its
 * project-error paths read that back. The authoring controller arrives as a factory from whoever
 * installs this — the editor's entry supplies one, a built HTML's does not — which is what keeps it
 * out of the bundle that does not use it. The same goes for the editor's persistent cache and the
 * address a project is given when first saved: `cache`, `onProjectURI` and `addressProject` arrive
 * from the editor's entry, and a built HTML passes none. Whether the loader runs at all, and the
 * archive limits, arrive as values: the fork's own UI reads the same switch and the same limits, so
 * they are defined in one place there and a built HTML carries them in its bootstrap. The VM
 * modules the registrar needs arrive the same way, from whoever bundled the VM: see `registrar.ts`
 * for why they cannot be imported here.
 */

import JSZip from '@turbowarp/jszip';
import {createExtensionLoader, createFetchPort} from '@kubohiroya/turbowarp-extension-loader';
import {createMemoryContentCache} from '@kubohiroya/turbowarp-extension-loader/memory-cache';
import {createProjectIO} from '@kubohiroya/turbowarp-extension-loader/project-codec';
import {createSessionTrustProvider} from '@kubohiroya/turbowarp-extension-loader/session-trust';

import type {FetchRetryOptions, LoaderOptions, LoaderPorts, ResolvedCode} from '@kubohiroya/turbowarp-extension-loader';
import type {HostDiagnostic} from './permission-ui.ts';
import type {createExtensionAuthoringController, setExtensionAuthoringHost} from './authoring.ts';
import type {createProjectPayloadHost} from '../project-payloads/host.ts';
import type {createProjectAddresser} from './project-address.ts';

import {createPlusPermissionUI} from './permission-ui.ts';
import {installExtensionLoader} from './project-loader.ts';
import {createVMExtensionRegistrar} from './registrar.ts';
import {closePlusReview, openPlusReview} from './review-channel.ts';

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

interface TrustCatalog {
    isTrustedURL(url: string): Promise<boolean>;
    isTrustedCode(code: ResolvedCode): Promise<boolean>;
}
export interface ExtensionHostOptions {
    enabled?: boolean;
    document?: Document;
    locale?: string;
    fetchImpl?: typeof fetch;
    cache?: LoaderPorts['cache'];
    requestApproval?: ReturnType<typeof createPlusPermissionUI>['requestApproval'];
    diagnostics?: (event: HostDiagnostic) => void;
    loaderOptions?: LoaderOptions;
    hostPolicy?: Parameters<typeof createSessionTrustProvider>[0]['hostPolicy'];
    trustedCatalog?: TrustCatalog;
    trustedDigests?: string[];
    fetchRetry?: FetchRetryOptions;
    markLoadFailure?: (error: unknown) => unknown;
    archiveOptions?: Parameters<typeof createProjectIO>[0];
    vmModules?: typeof import('./vm-modules.ts');
    createAuthoring?: typeof createExtensionAuthoringController;
    setAuthoringHost?: typeof setExtensionAuthoringHost;
    onProjectURI?: (uri: string | undefined) => void;
    addressProject?: ReturnType<typeof createProjectAddresser>;
    onProjectManifest?: (manifest: unknown) => void;
    createPayloads?: (ports: {fetch: typeof fetch; cache: LoaderPorts['cache'];
        validate: ReturnType<typeof createProjectIO>['prepare']}) => ReturnType<typeof createProjectPayloadHost>;
    showDiagnostics?: boolean;
}

/** Host-controlled wiring shared by the Editor and the bundled HTML runtime. */
export function installPlusExtensionHost (vm, {
    enabled = false, document = globalThis.document, locale = 'ja', fetchImpl = globalThis.fetch,
    cache, requestApproval, diagnostics: report, loaderOptions, hostPolicy, trustedCatalog = null, trustedDigests,
    fetchRetry, markLoadFailure, archiveOptions = {}, vmModules, createAuthoring, setAuthoringHost,
    onProjectURI, addressProject, onProjectManifest, createPayloads, showDiagnostics = true
}: ExtensionHostOptions = {}) {
    if (enabled !== true) return Object.freeze({enabled: false, dispose: async () => {}});
    // A single HTML has no catalog to read; its build embeds the digests the catalog listed.
    const trusted = trustedCatalog === null && Array.isArray(trustedDigests) ?
        digestTrustedCatalog(trustedDigests) : trustedCatalog;
    const ui = createPlusPermissionUI(document, locale, {showDiagnostics, onDiagnostic: report});
    const diagnostics = event => {
        ui.diagnostics(event);
    };
    // The Loader reports the retry it is about to wait for, and how many attempts this fetch can
    // make in all; the attempt the wait leads to is the next one. Counting them here from the retry
    // settings is what this used to do, and it was wrong whenever a caller passed its own.
    const onRetry = ({url, attempt, attempts, delayMs}) => diagnostics({
        type: 'retry',
        attempt: attempt + 1,
        attempts,
        delayMs,
        message: url
    });
    const projectIO = createProjectIO({zip: JSZip, ...archiveOptions});
    const approve = requestApproval || ui.requestApproval;
    // What the open review answered for the load in progress. The Loader asks about each row only
    // after the review has, so its approval is read from here instead of being put to the person a
    // second time; a row the review did not answer still gets the dialog.
    let reviewed = null;
    const answered = code => {
        const decision = reviewed && reviewed.get(code.id);
        if (!decision) return undefined;
        if (decision.execution === 'deny') return false;
        // The Loader runs a row the way its author asked. In the sandbox is within either answer;
        // outside it only within an answer that allows that, so a person who chose the sandbox for
        // a row its author runs outside does not have it run there.
        return code.execution === 'sandboxed' || decision.execution === 'unsandboxed';
    };
    const sessionTrust = createSessionTrustProvider({hostPolicy,
        // Catalog-listed code is trusted like TurboWarp's official gallery and needs no separate approval.
        requestApproval: async (code, options) => {
            if (trusted !== null && await trusted.isTrustedCode(code)) return true;
            const answer = answered(code);
            return answer === undefined ? approve(code, options) : answer;
        }});
    // The session remembers an approval for the rest of the visit, but what the person answers on
    // this load's review is newer than anything it remembers: a refusal there is a refusal now,
    // even for code an earlier load was allowed to run.
    const trustProvider = Object.freeze({
        ...sessionTrust,
        authorize: (code, options) => (answered(code) === false ?
            Promise.resolve(Object.freeze({allowed: false})) : sessionTrust.authorize(code, options))
    });
    /**
     * Put a load's Plus rows in front of the person on the review that asks about its other
     * extensions, and turn the answer into what the Loader takes.
     * @param {object} manifest The project's Plus manifest.
     * @param {Function} run Loads the project's other extensions, which is when the review asks.
     * @returns {Promise<object>} `declineCaching` for `load()`, and `release` once it settles.
     */
    const review = async (manifest, run) => {
        const channel = openPlusReview(vm, manifest);
        try {
            await run();
        } finally {
            closePlusReview(vm, channel);
        }
        const decisions = channel.decisions;
        reviewed = decisions;
        // The opener can only decline a copy the author allowed; any other form stays as written.
        const declineCaching = new Set(decisions ? manifest.extensions
            .filter(spec => spec.source.type === 'remote-cacheable' &&
                decisions.get(spec.id)?.loading === 'remote-non-cacheable')
            .map(spec => spec.id) : []);
        return {declineCaching, release: () => { if (reviewed === decisions) reviewed = null; }};
    };
    const ports = {
        embeddedReader: projectIO.embeddedReader,
        fetcher: createFetchPort(fetchImpl, {...fetchRetry, onRetry}),
        cache: cache || createMemoryContentCache(),
        trustProvider,
        registrar: createVMExtensionRegistrar(vm, {vmModules}),
        diagnostics
    };
    const loader = createExtensionLoader(ports, loaderOptions);
    const payloads = createPayloads?.({fetch: fetchImpl, cache: ports.cache, validate: projectIO.prepare});
    // A player built as a single HTML has no library to add an extension from, so its entry
    // supplies no controller: passing the factory in rather than importing it here is what keeps
    // the controller, and everything it pulls in, out of that bundle.
    const authoring = typeof createAuthoring === 'function' ?
        createAuthoring(vm, {ports, diagnostics, loaderOptions, archiveOptions}) : null;
    let uninstall;
    try {
        uninstall = installExtensionLoader({vm, projectIO, transactionalRegistration: true,
            onDiagnostic: diagnostics, markFailure: markLoadFailure, review, onProjectURI, addressProject, onProjectManifest, payloads,
            onProjectLoadStart: authoring ? authoring.projectLoadStarted : undefined}, loader);
    } catch (error) {
        authoring?.dispose();
        payloads?.dispose();
        ui.dispose();
        trustProvider.revokeAll();
        throw error;
    }
    if (authoring) setAuthoringHost(vm, authoring);
    let disposal;
    return Object.freeze({
        enabled: true, loader, projectIO, authoring, payloads,
        dispose () {
            if (!disposal) {
                if (authoring) setAuthoringHost(vm, null);
                authoring?.dispose();
                payloads?.dispose();
                ui.dispose();
                trustProvider.revokeAll();
                disposal = Promise.resolve(uninstall()).then(() => loader.unload());
            }
            return disposal;
        }
    });
}
