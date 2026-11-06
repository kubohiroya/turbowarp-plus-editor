/**
 * Where a project's extensions are loaded, and who decides how.
 *
 * None of that is this fork's: which Loader packages are used, what the archive limits are, what
 * asks the user, which switch turns the loader on and what counts as already trusted are all
 * decisions about a distribution. The distributing host answers the socket; what comes back is
 * disposed of here, and with no host there is simply no Plus extension loading.
 *
 * What is handed over is what only this fork has. Marking an error as an extension failure goes as
 * a function, because the project-error paths read it back. The VM modules the registration needs
 * go as this fork's own
 * module instances: `central-dispatch` is a singleton, and a copy resolved anywhere else would not
 * be the one the VM uses. The startup query goes as a value; what it means is the host's to decide.
 */

/* global __TW_PLUS_FILE_UPLOADER__ */
import {loadCostume} from 'scratch-vm/src/import/load-costume.js';
import {loadSound} from 'scratch-vm/src/import/load-sound.js';
import ScratchCommon from 'scratch-vm/src/extension-support/tw-extension-api-common.js';
import createTranslate from 'scratch-vm/src/extension-support/tw-l10n.js';
import staticFetch from 'scratch-vm/src/util/tw-static-fetch.js';
import dispatch from 'scratch-vm/src/dispatch/central-dispatch.js';
import defaultExtensionURLs from 'scratch-vm/src/extension-support/tw-default-extension-urls.js';

import {markExtensionLoadFailure} from './tw-plus-extension-load-failure.ts';
import {setPlusHostPolicy} from './tw-plus-extension-permissions.ts';
import {
    hostExtensionLoadErrors, hostIntegration, hostSecurityReview, hostTrustedCatalog, installHostExtensionHost
} from './tw-plus-integration-points.ts';

// Snapshot before any project is opened; later URL changes cannot toggle this host.
const startupSearch = globalThis.location ? globalThis.location.search : '';

/**
 * Ask the distributing host to install extension loading for this VM.
 * @param {object} vm The editor VM.
 * @param {object} [options] What the caller knows: locale, document, diagnostics, policy.
 * @param {object} [integration] The host's integration; taken as an argument so a test can hand
 * one in, as every other point in `tw-plus-integration-points.ts` is.
 * @returns {object} The installed host, or a disabled one when this build has no loader.
 */
export function startupPlusExtensionHost (vm, options: {search?: string; [key: string]: unknown} = {}, integration = hostIntegration()) {
    return installHostExtensionHost(vm, {
        // The query as it was before any project was opened, so a later URL change cannot turn
        // loading on. What that query means, and what limits a project is read with, are the
        // host's: its own Packager wiring reads the same two, and both are stated there now.
        search: options.search === undefined ? startupSearch : options.search,
        vmModules: {ScratchCommon, createTranslate, staticFetch, dispatch, loadCostume, loadSound,
            assetUploads: typeof __TW_PLUS_FILE_UPLOADER__ === 'undefined' ? undefined : __TW_PLUS_FILE_UPLOADER__},
        trustedCatalog: hostTrustedCatalog(integration),
        markLoadFailure: markExtensionLoadFailure,
        ...options
    }, integration);
}

/**
 * Mount the review beneath the project loader. The GUI has already installed its native policy
 * and supplies a modal queue, its trusted sources and the built-in library metadata.
 */
type SecurityHostOptions = Parameters<typeof attachSecurityHost>[1];
const mountedHosts = new WeakMap<object, {
    options: SecurityHostOptions | null;
    pending?: Promise<void>;
    dispose: ReturnType<typeof attachSecurityHost>;
}>();

export function installSecurityHost (vm, options: SecurityHostOptions, integration = hostIntegration()) {
    let mounted = mountedHosts.get(vm);
    if (mounted?.options) throw new Error('The security host is already mounted');
    if (!mounted) {
        mounted = {options, dispose: attachSecurityHost(vm, options, () => mounted?.options ?? null, integration)};
        mountedHosts.set(vm, mounted);
    } else {
        mounted.options = options;
        mounted.pending = undefined;
    }
    let disposal: Promise<void>;
    return () => {
        if (disposal) return disposal;
        mounted.options = null;
        // A locale change replaces the GUI in one React commit while keeping the VM.
        // Let the new view take over before unloading the project's extensions.
        mounted.pending = disposal = Promise.resolve().then(() => {
            if (mounted.pending !== disposal) return;
            mountedHosts.delete(vm);
            return mounted.dispose();
        });
        return disposal;
    };
}

function attachSecurityHost (vm, {
    securityManager, locale, projectState, extensionLibrary, isTrusted, DialogFrame, requestModal
}, getMount: () => {locale: typeof locale; DialogFrame: typeof DialogFrame; requestModal: typeof requestModal} | null, integration) {
    const security = vm.extensionManager.securityManager;
    const {canLoadExtensionFromProject, getSandboxMode} = securityManager;
    const review = hostSecurityReview(integration);
    const hostPolicy: {canLoadExtensionFromProject?: typeof canLoadExtensionFromProject; getSandboxMode?: typeof getSandboxMode} = {};
    if (canLoadExtensionFromProject) {
        hostPolicy.canLoadExtensionFromProject = canLoadExtensionFromProject.bind(security);
    }
    if (getSandboxMode) hostPolicy.getSandboxMode = getSandboxMode.bind(security);

    let active = true;
    let restoreBatchLoader;
    let host;
    setPlusHostPolicy(security, canLoadExtensionFromProject);
    try {
        // Custom policies keep their native loading path.
        if (review && !canLoadExtensionFromProject && !getSandboxMode) {
            restoreBatchLoader = review.installBatchLoader({
                vm, defaultURLs: defaultExtensionURLs, isTrusted,
                bannerFor: ({ids, url}) => extensionLibrary.find(item => ids.includes(item.extensionId) ||
                    (item.extensionURL && item.extensionURL === url))?.iconURL,
                showReview: (entries, initialChoices) => {
                    const mount = getMount();
                    return active && mount ? mount.requestModal(
                        (onComplete, currentLocale) => review.render({
                            entries, initialChoices, locale: currentLocale, DialogFrame: mount.DialogFrame, onComplete
                        }), null
                    ) : null;
                }
            });
        }
        host = startupPlusExtensionHost(vm, {locale, getLocale: () => getMount()?.locale ?? locale, projectState, hostPolicy}, integration);
    } catch (error) {
        active = false;
        setPlusHostPolicy(security, null);
        restoreBatchLoader?.();
        throw error;
    }

    let disposal;
    return () => {
        if (disposal) return disposal;
        active = false;
        setPlusHostPolicy(security, null);
        disposal = (async () => {
            try {
                // The project tools can be installed even with the Plus loader switched off.
                await host.dispose();
            } finally {
                restoreBatchLoader?.();
            }
        })();
        return disposal;
    };
}

/**
 * Whether a failed load was declined rather than broken: the project-error paths show nothing for
 * a refusal and return to the editor instead.
 *
 * Only the distributing host can classify a loader refusal or a cancelled review.
 * @param {object} error The rejection from loading a project.
 * @param {object} [integration] The host's integration.
 * @returns {boolean} True when nothing is broken and nobody needs telling.
 */
export const isPlusPermissionDenied = (error, integration = hostIntegration()) =>
    Boolean(error) && (hostExtensionLoadErrors(integration)?.isCancelled?.(error) === true ||
        hostSecurityReview(integration)?.isCancelled?.(error) === true);
