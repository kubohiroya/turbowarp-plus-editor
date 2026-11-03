import './styles/preview-reload.css';

/**
 * What this distribution plugs into the GUI's Plus integration socket.
 *
 * The fork keeps an empty `src/lib/tw-plus-integration.js` and the hooks that consult it; this
 * file is what the site build puts in its place, so the family's packages belong to this
 * repository rather than to the fork. The build replaces the module instead of setting a global:
 * a global would have to be written before the GUI mounts, which makes the wiring depend on load
 * order, while a replacement is resolved when the bundle is built.
 *
 * Features move across that boundary one at a time. What is here now is the document editor's
 * wiring (the fork's `tw-document-editor.jsx`), the stage controls an extension registers (its
 * `tw-stage-controls.js`), the runtime controls dock those controls are reached through, what this
 * distribution's catalog makes it trust, the extension
 * host that loads a project's extensions, the library tab that offers them, where a project that
 * uses them goes to be packaged, the review they go through before running, and the form-based
 * block editor.
 */

import {
    mountDocumentEditor, readDocumentEditorFlags, registerDocumentSourceRootHatShape
} from '@kubohiroya/turbowarp-document-editor';

import {attachScriptTransfer, stageTransferMenu, finalizeTransferMenu} from '@kubohiroya/turbowarp-script-transfer';
import {readStartupFeatureFlags} from '../config/feature-flags.ts';

import {plusBlockEditor} from './block-editor/editor.js';
import blockEditorTranslations from './block-editor/translations.json';
import {installEditorExtensionHost} from './extension-host/editor-host.js';
import {plusSecurityReview} from './extension-host/review.js';
import {extensionLoadErrors} from './extension-host/load-errors.js';
import {plusLibraryTab} from './extension-library/tab.js';
import {plusProjectPackager} from './packager/handoff.js';

import {installControlsDock} from './controls-dock.js';
import getStageControls from './stage-controls.js';
import {plusTrustedExtensions} from './trusted-extensions.js';

// Resolved once when the bundle starts, as the fork did: a project cannot enable document editing
// by being opened, and a later URL change cannot turn it on either.
const transferFlags = readStartupFeatureFlags(typeof window === 'undefined' ? '' : window.location.search);
const startupFlags = readDocumentEditorFlags(typeof window === 'undefined' ? '' : window.location.search);

/**
 * Build the integration from what it depends on, so a test can hand in its own. The exported
 * `plusIntegration` is this applied to the real package and the startup flags.
 * @param {object} dependencies `mountEditor` and `flags`.
 * @returns {object} The integration this distribution supplies.
 */
export const createPlusIntegration = ({
    mountEditor,
    flags,
    registerBlockShapes = registerDocumentSourceRootHatShape,
    stageControls = getStageControls,
    trustedExtensions = plusTrustedExtensions,
    installExtensionHost = installEditorExtensionHost,
    libraryTab = plusLibraryTab,
    projectPackager = plusProjectPackager,
    securityReview = plusSecurityReview,
    scriptTransfer = transferFlags.scriptTransfer ? {
        attach: attachScriptTransfer, stageMenu: stageTransferMenu, finalizeMenu: finalizeTransferMenu
    } : null,
    blockEditor = plusBlockEditor
}) => ({
    // Transfer is supplied only when the startup flag explicitly enabled it.
    scriptTransfer,
    /**
     * What this distribution stands behind: an extension its catalog lists loads unsandboxed
     * without a separate review, the way TurboWarp treats its own gallery. The GUI asks; which
     * extensions are trusted that way is a decision about the distribution, so it is made here.
     */
    trustedExtensions,
    /**
     * Install extension loading for one VM: which Loader packages, which cache, how a fetch is
     * retried, what asks the user. The GUI passes in what only it has — its own VM modules, the
     * switch, the archive limits, how a failure is marked and how an authoring controller is made
     * — and disposes of what comes back.
     */
    installExtensionHost,
    /**
     * The tab this distribution adds to the extension library: its tag, its icon and what to
     * render when it is selected. The GUI makes room for one tab it does not own and renders what
     * this returns, so the offer, the catalog behind it and the review are all decided here.
     */
    libraryTab,
    /**
     * Where a project that uses this distribution's extensions goes when the editor's Packager
     * button is pressed: this build's own page rather than packager.turbowarp.org, which would
     * produce an HTML without them. The GUI keeps the upstream protocol and asks this first.
     */
    projectPackager,
    /**
     * The review a project's extensions go through before any of them runs: what it asks, what it
     * shows and what needs no asking because this distribution lists it. The GUI keeps its modal,
     * its lock and the extensions it already trusts, and hands all of that in.
     */
    securityReview,
    extensionLoadErrors,
    /**
     * Whether the editor should leave a key event alone because it happened inside this
     * distribution's own UI. The review is the only such UI, and the class it renders comes from
     * the package this repository depends on, so the fork cannot name it.
     * @param {object} event The key event the GUI received.
     * @returns {boolean} True when the editor should not act on it.
     */
    shouldIgnoreKeyEvent: event => securityReview.ownsKeyEvent(event),
    /**
     * The form-based block editor: the service that edits one VM's blocks, the editors attached to
     * a workspace, and the dialog. The GUI supplies its translations, its workspace, its modal
     * frame and its palette, because those are its own.
     */
    blockEditor,
    translations: blockEditorTranslations,
    themeTokens: {
        light: {'block-editor-error-border': '#c62828', 'block-editor-error-text': '#a61b1b',
            'block-editor-error-tint': 'rgba(198, 40, 40, 0.08)'},
        dark: {'block-editor-error-border': '#ff8a8a', 'block-editor-error-text': '#ffb3b3',
            'block-editor-error-tint': 'rgba(255, 138, 138, 0.12)'}
    },
    /**
     * Register the block shapes this distribution's own blocks need, once ScratchBlocks exists.
     *
     * The document editor's root hat is one: the GUI used to register it itself, which meant the
     * GUI had to depend on the package. It calls this instead, right where it registered it.
     * @param {object} ScratchBlocks The loaded ScratchBlocks.
     * @returns {void}
     */
    registerBlockShapes,
    /**
     * The addons whose startup has to settle before anything reads what they patched.
     *
     * `editor-searchable-dropdowns` replaces protected FieldDropdown methods, and the block editor
     * this distribution mounts reads those methods. Without naming it here the runner would start
     * the next userscript immediately and the block editor could attach to the old methods. The
     * runner owns the running and the waiting; this is only the name.
     */
    awaitStartupAddons: ['editor-searchable-dropdowns'],
    /**
     * The stage controls service for one VM. The fork asks for this from both the controls bar and
     * the `Scratch.gui` API, and both must receive the same service: a control registered through
     * the API has to appear in the bar. Keeping the per-VM map here is what guarantees that.
     * @param {object} vm The VM the controls belong to.
     * @returns {object} The service.
     */
    stageControls: vm => stageControls(vm),
    /**
     * Attach the document editor to a workspace. The fork owns when this runs and disposes of
     * what comes back; errors are left to propagate, because the fork logs them and keeping the
     * editor open matters more than this attachment succeeding.
     * @param {object} context `vm`, `locale`, `document` and `getBlockly` from the fork.
     * @returns {object|null} Something to dispose, or null when document editing is off.
     */
    attachToWorkspace: ({vm, locale, document: hostDocument, getBlockly}) => {
        const attached = [];
        // Say "use the Editor's bar" before any extension asks app-shell for a dock. Without this
        // app-shell builds a floating one and a control registered through it would hover over the
        // stage instead of sitting in the bar.
        attached.push(installControlsDock(hostDocument, stageControls(vm)));
        if (flags.embeddedYamlEditor) {
            attached.push(mountEditor({
                vm,
                document: hostDocument,
                language: locale,
                documentSources: flags.documentSources,
                getScratch: () => ({vm, gui: {getBlockly}})
            }));
        }
        return {
            dispose () {
                // Each attachment is independent, so one that throws must not keep the others
                // from being released.
                const failures = [];
                for (const attachment of attached.reverse()) {
                    try {
                        attachment?.dispose?.();
                    } catch (error) {
                        failures.push(error);
                    }
                }
                if (failures.length) throw failures[0];
            }
        };
    }
});

const integration = createPlusIntegration({mountEditor: mountDocumentEditor, flags: startupFlags});

/**
 * This distribution's integration, read by the fork through the module it replaced.
 * @returns {object} The integration.
 */
export const plusIntegration = () => integration;
