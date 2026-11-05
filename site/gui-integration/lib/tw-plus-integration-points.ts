/**
 * How this fork consults the integration the distributing host supplied.
 *
 * The distribution owns the integration and these helpers. Each takes what the GUI already has and what the host supplied
 * and merges them, and each takes the integration as an argument rather than reading it, so a test
 * can hand one in and every call site stays a single line.
 *
 * Every point is optional. With nothing supplied each helper returns its input unchanged, which is
 * what makes opening a point safe on its own: the GUI keeps doing exactly what it did, and the
 * implementation moves across later, one at a time.
 */

import {plusIntegration} from '../../plus-integration.ts';
import {connectProjectPackager} from '../../packager/handoff.ts';

/**
 * What the host supplied, or an empty integration.
 * @returns {object} The integration, never null.
 */
export const hostIntegration = () => plusIntegration() || {};

/**
 * Extra modal names the host owns.
 * @param {object} [integration] The host's integration.
 * @returns {string[]} The names, empty when the host supplied none.
 */
export const hostModalNames = integration => [...(integration?.modals || [])];

/**
 * Those names as closed modals, to merge into the reducer's initial state.
 * @param {object} [integration] The host's integration.
 * @returns {object} A name to false map, empty when the host supplied none.
 */
export const hostModalDefaults = integration =>
    Object.fromEntries(hostModalNames(integration).map(name => [name, false]));

/**
 * The host's messages for one locale. Locales match in lower case, as tw translations do.
 * @param {string} locale The locale being filled.
 * @param {object} [integration] The host's integration.
 * @returns {object} The messages, empty when the host has none for this locale.
 */
export const hostTranslationsFor = (locale, integration) =>
    integration?.translations?.[String(locale).toLowerCase()] || {};

/**
 * Let the host register its own block shapes once ScratchBlocks exists.
 * @param {object} ScratchBlocks The loaded ScratchBlocks.
 * @param {object} [integration] The host's integration.
 * @returns {void}
 */
export const registerHostBlockShapes = (ScratchBlocks, integration) => {
    integration?.registerBlockShapes?.(ScratchBlocks);
};

/**
 * Whether a key event belongs to host UI and must not reach the stage. Anything but true leaves
 * the event to the GUI, so a host that answers badly cannot swallow input.
 * @param {object} event The keyboard event.
 * @param {object} [integration] The host's integration.
 * @returns {boolean} True only when the host claimed the event.
 */
export const hostIgnoresKeyEvent = (event, integration) => integration?.shouldIgnoreKeyEvent?.(event) === true;

/**
 * Let the host attach to the workspace once a VM exists. The host receives the VM, the current
 * locale, the document and a way to reach ScratchBlocks, and returns something to dispose; the
 * fork owns when that happens and never looks inside.
 * @param {object} context What the host needs to attach: vm, locale, document, getBlockly.
 * @param {object} [integration] The host's integration.
 * @returns {object|null} A disposable, or null when the host attached nothing.
 */
export const attachHostToWorkspace = (context, integration) => integration?.attachToWorkspace?.(context) || null;

/**
 * Return to the default project, which is what this fork does when no host decides otherwise.
 * @param {object} initialState The reducer's initial state.
 * @param {string} defaultProjectId The id of the default project.
 * @param {object} loadingStates The reducer's LoadingState map.
 * @returns {object} The next project state.
 */
const defaultCancelSecurityLoad = (initialState, defaultProjectId, loadingStates) =>
    Object.assign({}, initialState, {
        loadingState: loadingStates.FETCHING_NEW_DEFAULT,
        projectId: defaultProjectId
    });

/**
 * What cancelling a load leaves behind.
 *
 * The host cannot import the reducer's `initialState`, `LoadingState` or `defaultProjectId`, so
 * they are handed in. That is what makes a point like this possible: the reducer keeps the values
 * and the host may keep the decision. With nothing supplied the default below runs, so the fork
 * behaves on its own exactly as it did.
 * @param {object} initialState The reducer's initial state.
 * @param {string} defaultProjectId The id of the default project.
 * @param {object} loadingStates The reducer's LoadingState map.
 * @param {object} [integration] The host's integration.
 * @returns {object} The next project state.
 */
export const createCancelSecurityLoad = (initialState, defaultProjectId, loadingStates, integration) =>
    (integration?.createCancelSecurityLoad || defaultCancelSecurityLoad)(
        initialState, defaultProjectId, loadingStates);

/**
 * The stage controls an extension registered, as a service the host owns per VM.
 *
 * Both the controls bar and the `Scratch.gui` API ask for this, and both must receive the same
 * service for a VM or a control registered through the API would never appear. Keeping that
 * identity in the host is why this takes the VM rather than returning a singleton.
 * @param {object} vm The VM the controls belong to.
 * @param {object} [integration] The host's integration.
 * @returns {object|null} The service, or null when the host supplied none.
 */
export const hostStageControls = (vm, integration) => integration?.stageControls?.(vm) || null;

/**
 * The addon ids whose startup must finish before anything reads what they patched.
 *
 * An addon that patches shared editor internals has to settle before the next userscript runs, and
 * before a host attaches to the workspace. Which addon that is depends on what the host does, not
 * on the runner: the runner keeps the running and the waiting, the host names the ids.
 * @param {object} [integration] The host's integration.
 * @returns {string[]} The ids, empty when the host named none.
 */
export const hostAwaitedAddonIds = integration => [...(integration?.awaitStartupAddons || [])];

/**
 * Trust nothing, which is what this fork stands behind on its own: no extension is the fork's, so
 * every one is reviewed. A host that distributes a catalog answers the two points below instead.
 */
const trustsNothing = Object.freeze({
    isTrustedURL: () => Promise.resolve(false),
    isTrustedCode: () => Promise.resolve(false)
});

/**
 * What the host's build stands behind.
 *
 * TurboWarp loads an extension from its own gallery unsandboxed without asking, because the
 * gallery is TurboWarp's. Which extensions a distribution vouches for that way is the same kind of
 * decision and belongs to whoever ships the editor, so this fork asks instead of deciding. It
 * still owns the asking: an extension that is not trusted reaches the review dialog as before.
 * @param {object} [integration] The host's integration.
 * @returns {object} `isTrustedURL(url)` and `isTrustedCode(code)`, trusting nothing by default.
 */
export const hostTrustedCatalog = integration => integration?.trustedExtensions?.catalog || trustsNothing;

/** No loader at all, which is what this fork does on its own: nothing is installed. */
const noExtensionHost = Object.freeze({enabled: false, dispose: async () => {}});

/**
 * Install the host that loads a project's extensions.
 *
 * The whole implementation is the distributor's, down to which switch turns it on, so this fork
 * hands over what only it knows — the startup query, what it trusts, how a failure is marked and
 * how an authoring controller is made — and keeps nothing but the disposal.
 * @param {object} vm The VM to install on.
 * @param {object} settings What this fork knows, passed through unchanged.
 * @param {object} [integration] The host's integration.
 * @returns {object} The installed host, or a disabled one when the host installs none.
 */
export const installHostExtensionHost = (vm, settings, integration) =>
    integration?.installExtensionHost?.(vm, settings) || noExtensionHost;

/**
 * The one library tab the host may add beside this fork's own.
 *
 * The extension library makes room for a tag it does not own and renders what the tab returns when
 * that tag is selected. What the tab offers, what it is called, what it looks like and what it asks
 * before anything runs are all the distributor's, so this fork takes a description and renders it.
 * With none supplied the library is exactly the one upstream ships.
 * @param {object} [integration] The host's integration.
 * @returns {object|null} `tagProps`, optional layout `classes` and
 * `render(filterQuery, context, onBusyChange)`, or null.
 */
export const hostLibraryTab = integration => integration?.libraryTab || null;

/**
 * Where a project goes when the Packager button is pressed, if the host packages some itself.
 *
 * Upstream's integration opens packager.turbowarp.org and sends the project there. A build that
 * distributes extensions of its own cannot let every project take that path — the result would run
 * without them — so it may claim the ones it recognises and open its own page instead. Which
 * projects those are, and where they go, is the distributor's; the protocol with the upstream
 * Packager stays here, because it is upstream's.
 * @param {Function} getVM The current editor VM.
 * @param {Function} getTitle The current project title.
 * @param {object} [integration] The host's integration.
 * @returns {object|null} `open`, `claim` and `handleMessage`, or null when the host claims none.
 */
export const hostProjectPackager = (getVM, getTitle, integration = hostIntegration()) =>
    connectProjectPackager(integration?.['projectPackager'], getVM, getTitle);

/**
 * The review a project's extensions go through before any of them runs.
 *
 * Upstream asks about one unknown extension at a time. A distribution may ship a review of its own
 * that asks about all of them together, and may already stand behind some of them; both are
 * decisions about what is distributed. This fork keeps its modal, its lock and the extensions it
 * trusts itself, and hands those over.
 * @param {object} [integration] The host's integration.
 * @returns {object|null} `installBatchLoader`, `render` and `isCancelled`, or null.
 */
export const hostSecurityReview = integration => integration?.securityReview || null;

/**
 * The form-based block editor the host ships, if it ships one.
 *
 * An extension may declare a schema for one of its blocks, and a distribution may turn that into a
 * form: an icon on the block, a dialog, and a service that edits it without disturbing the
 * workspace's own editing. All of that is the distributor's. What this fork hands over is its
 * workspace, its ScratchBlocks, its modal frame, its palette and its translations.
 * @param {object} [integration] The host's integration.
 * @returns {object|null} `createService`, `attach` and `render`, or null when none is shipped.
 */
export const hostBlockEditor = integration => integration?.blockEditor || null;

/**
 * The host classifies its own loader failures and formats their explanations.
 * @param {object} [integration] The host integration.
 * @returns {object|null} Failure classifiers and formatter, or null.
 */
export const hostExtensionLoadErrors = integration => integration?.extensionLoadErrors || null;
