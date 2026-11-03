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

import ScratchCommon from 'scratch-vm/src/extension-support/tw-extension-api-common.js';
import createTranslate from 'scratch-vm/src/extension-support/tw-l10n.js';
import staticFetch from 'scratch-vm/src/util/tw-static-fetch.js';
import dispatch from 'scratch-vm/src/dispatch/central-dispatch.js';

import {markExtensionLoadFailure} from './tw-plus-extension-load-failure.js';
import {
    hostExtensionLoadErrors, hostIntegration, hostSecurityReview, hostTrustedCatalog, installHostExtensionHost
} from './tw-plus-integration-points.js';

// Snapshot before any project is opened; later URL changes cannot toggle this host.
const startupSearch = globalThis.location ? globalThis.location.search : '';

/**
 * Ask the distributing host to install extension loading for this VM.
 * @param {object} vm The editor VM.
 * @param {object} [options] What the caller knows: locale, document, diagnostics, policy.
 * @param {object} [integration] The host's integration; taken as an argument so a test can hand
 * one in, as every other point in `tw-plus-integration-points.js` is.
 * @returns {object} The installed host, or a disabled one when this build has no loader.
 */
export function startupPlusExtensionHost (vm, options = {}, integration = hostIntegration()) {
    return installHostExtensionHost(vm, {
        // The query as it was before any project was opened, so a later URL change cannot turn
        // loading on. What that query means, and what limits a project is read with, are the
        // host's: its own Packager wiring reads the same two, and both are stated there now.
        search: options.search === undefined ? startupSearch : options.search,
        vmModules: {ScratchCommon, createTranslate, staticFetch, dispatch},
        trustedCatalog: hostTrustedCatalog(integration),
        markLoadFailure: markExtensionLoadFailure,
        ...options
    }, integration);
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
