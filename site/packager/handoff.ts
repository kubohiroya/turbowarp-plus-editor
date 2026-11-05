/**
 * Handing the editor's project to this distribution's own builder page.
 *
 * TurboWarp's editor has a Packager button that opens packager.turbowarp.org and sends the project
 * there. A project that uses Plus extensions cannot be packaged that way — the result would run
 * without them — so this build intercepts exactly those projects and opens its own page instead.
 *
 * That decision used to live in the GUI's own `tw-packager-integration-hoc.jsx`, which is an
 * upstream file: the fork had added this branch to it. The branch is here now, and the fork calls
 * it through the integration. Which projects are claimed, which page they go to and how the bytes
 * travel are all decided here; the upstream protocol with packager.turbowarp.org stays over there,
 * because it is upstream's.
 */

import {createProjectIO} from '@kubohiroya/turbowarp-extension-loader/project-codec';
import JSZip from '@turbowarp/jszip';

import {extensionProjectArchiveOptions} from '../extension-host/config.ts';
import {PLUS_EXTENSION_LOADER_ENABLED} from '../extension-library/flags.ts';
import {saveProjectForPackager} from '../project-payloads/host.ts';

/** This build's own builder page, under whatever prefix the site was built for. */
const pageURL = () => new URL(`${process.env.ROOT || './'}plus-packager.html`, location.href).href;

/**
 * Whether a project carries a Plus manifest, which is what makes it ours to package.
 * @param {ArrayBuffer} buffer The project's SB3 bytes.
 * @returns {Promise<boolean>} True when the project declares Plus extensions.
 */
const usesPlusExtensions = async buffer => {
    const {manifest} = await createProjectIO({zip: JSZip, ...extensionProjectArchiveOptions}).prepare(buffer);
    return manifest !== null;
};

/**
 * Build the handoff, so a test can supply its own reader and page.
 * @param {object} [parts] `enabled`, `readProject` and `page` for tests; the defaults are real.
 * @returns {object|null} `open`, `claim` and `handleMessage`, or null when this build packages
 * nothing itself.
 */
export const createProjectPackager = ({
    enabled = PLUS_EXTENSION_LOADER_ENABLED,
    readProject = usesPlusExtensions,
    page = pageURL
} = {}) => {
    if (!enabled) return null;
    // The window being handed to, the bytes it has not asked for yet, and how to name them. The
    // name is read when the page asks, so it is the project's title at that moment.
    let pending = null;
    return Object.freeze({
        /**
         * Take over a window the editor opened for the Packager button.
         *
         * The window is opened by the GUI during the user's gesture, before anything is serialized,
         * because a popup opened later would be blocked. A project that is not ours goes on to the
         * upstream Packager through the same window.
         * @param {object} context `popup`, `vm`, `name()` and `fallbackURL` from the GUI.
         * @returns {Promise<void>} Resolves once the window has been sent somewhere.
         */
        async open ({popup, vm, name, fallbackURL}) {
            try {
                const buffer = await saveProjectForPackager(vm);
                if (popup.closed) return;
                if (!await readProject(buffer)) {
                    popup.location.href = fallbackURL;
                    return;
                }
                pending = {window: popup, buffer, name};
                popup.location.href = page();
            } catch (error) {
                popup.close();
                console.error(error);
                // eslint-disable-next-line no-alert
                window.alert(`Plus HTML出力を開始できませんでした: ${error.message}`);
            }
        },
        /**
         * Claim a window that is already talking to the upstream Packager, when the project it
         * asked to import turns out to be ours.
         * @param {object} context `source`, `buffer`, `name()` and `cancelImport()` from the GUI.
         * @returns {Promise<boolean>} True when this window was taken over.
         */
        async claim ({source, buffer, name, cancelImport}) {
            if (!await readProject(buffer)) return false;
            // Tell the upstream Packager first: it is showing a loading screen for an import that
            // is not going to arrive.
            cancelImport();
            pending = {window: source, buffer, name};
            source.location.href = page();
            return true;
        },
        /**
         * Answer the builder page when it says it is ready for the project.
         * @param {object} event The message event the GUI received.
         * @returns {boolean} True when this was the builder page's message and it was answered.
         */
        handleMessage (event) {
            const message = event.data && event.data.twPlusPackage;
            if (event.origin !== location.origin || !pending || event.source !== pending.window) return false;
            if (!message || message.type !== 'ready' || !pending.buffer) return false;
            const {buffer, name} = pending;
            // The bytes are transferred, so they are no longer ours to send again.
            pending = {...pending, buffer: null};
            event.source.postMessage({twPlusPackage: {type: 'project', bytes: buffer, name: name()}},
                location.origin, [buffer]);
            return true;
        }
    });
};

export const plusProjectPackager = createProjectPackager();

/** Keep the live project getters on the host side of the native Packager protocol. */
export const connectProjectPackager = (packager, getVM, getTitle) => {
    if (!packager) return null;
    const name = () => `${getTitle()}.sb3`;
    return {
        open: (popup, fallbackURL) => packager.open({popup, fallbackURL, vm: getVM(), name}),
        claim: (source, buffer, cancelImport) => packager.claim({source, buffer, cancelImport, name}),
        handleMessage: event => packager.handleMessage(event)
    };
};
