import './styles/preview-reload.css';

/**
 * This distribution's features, consumed by its own GUI bridge.
 * The build injects site/gui-integration/index.ts through the existing GUI addon hooks module.
 * The fork contains no additional source files, views, tools, documents or tests.
 * No global is assigned: webpack resolves the optional value when it builds the bundle.
 */

import {
    mountDocumentEditor, registerDocumentSourceRootHatShape
} from '@kubohiroya/turbowarp-document-editor';
import {getDocumentWorkspace} from '@kubohiroya/turbowarp-plus-editor-layout/sprite-tabs';

import {attachScriptTransfer, stageTransferMenu, finalizeTransferMenu} from '@kubohiroya/turbowarp-script-transfer';

import {plusBlockEditor} from './block-editor/editor.ts';
import blockEditorTranslations from './block-editor/translations.json' with {type: 'json'};
import {installProjectToolsHost, projectToolsOwnKeyEvent} from './project-tools/index.ts';
import {plusSecurityReview} from './extension-host/review.ts';
import {extensionLoadErrors} from './extension-host/load-errors.ts';
import {plusLibraryTab} from './extension-library/tab.ts';
import {plusProjectPackager} from './packager/handoff.ts';

import {installControlsDock} from './controls-dock.ts';
import getStageControls from './stage-controls.ts';
import {plusTrustedExtensions} from './trusted-extensions.ts';
import {readWebStartupFeatureFlags} from '../config/web-startup-feature-flags.ts';
import {installHorizontalBlockPalette} from './horizontal-block-palette/index.ts';
import {attachAssetContextMenuIcons, installBlockContextMenuIcons} from './context-menu-icons/index.ts';
import {installPaletteDeletePreview} from './palette-delete-preview/index.ts';
import {attachWorkspaceNavigation} from './workspace-minimap/index.ts';

const {paletteDeletePreview, paletteCategoryReorder, horizontalBlockPalette, standardLayout, workspaceMinimap} =
    readWebStartupFeatureFlags(typeof window === 'undefined' ? '' : window.location.search);

export const BLOCK_EDITOR_MODAL = 'blockEditorModal';

/**
 * Build the integration from what it depends on, so a test can hand in its own. The exported
 * `plusIntegration` is this applied to the real package.
 * @param {object} dependencies `mountEditor` and the services below.
 * @returns {object} The integration this distribution supplies.
 */
export const createPlusIntegration = ({
    mountEditor,
    registerBlockShapes = registerDocumentSourceRootHatShape,
    stageControls = getStageControls,
    trustedExtensions = plusTrustedExtensions,
    installExtensionHost = installProjectToolsHost,
    libraryTab = plusLibraryTab,
    projectPackager = plusProjectPackager,
    securityReview = plusSecurityReview,
    scriptTransfer = {
        attach: attachScriptTransfer, stageMenu: stageTransferMenu, finalizeMenu: finalizeTransferMenu
    },
    blockEditor = plusBlockEditor
}) => ({
    // Transfer is always supplied: there is no startup switch, and rollback reverts the integration.
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
    shouldIgnoreKeyEvent: event => projectToolsOwnKeyEvent(event) || securityReview.ownsKeyEvent(event),
    /**
     * The form-based block editor: the service that edits one VM's blocks, the editors attached to
     * a workspace, and the dialog. The GUI supplies its translations, its workspace, its modal
     * frame and its palette, because those are its own.
     */
    blockEditor,
    attachWorkspaceMinimap: workspaceMinimap || standardLayout ?
        (workspace, ScratchBlocks) => attachWorkspaceNavigation(workspace, ScratchBlocks, {
            horizontalZoom: standardLayout, minimap: workspaceMinimap
        }) : undefined,
    modals: blockEditor ? [BLOCK_EDITOR_MODAL] : [],
    translations: {
        en: {...blockEditorTranslations.en, 'gui.extensionLibrary.chooseAnExtension': 'Add Extensions to the Project'},
        ja: {...blockEditorTranslations.ja, 'gui.extensionLibrary.chooseAnExtension': '機能拡張を作品に追加する'},
        'ja-hira': {'gui.extensionLibrary.chooseAnExtension': 'かくちょうきのうをさくひんについかする'}
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
     *
     * There is no startup switch: the editor is always mounted, and a hat gets its file icon only
     * when a registered provider owns its document, so a project without one looks like upstream.
     * Rollback reverts this integration.
     * @param {object} context The VM, document, locale and accessors for Blockly and current messages.
     * @returns {object} Something to dispose.
     */
    attachToWorkspace: ({vm, locale, document: hostDocument, getBlockly, getMessages}) => {
        const attached = [];
        // Say "use the Editor's bar" before any extension asks app-shell for a dock. Without this
        // app-shell builds a floating one and a control registered through it would hover over the
        // stage instead of sitting in the bar.
        attached.push(installControlsDock(hostDocument, stageControls(vm)));
        attached.push(attachAssetContextMenuIcons(hostDocument, getMessages));
        const workspace = getDocumentWorkspace(vm);
        const documents = mountEditor({
            vm,
            document: hostDocument,
            language: locale,
            openPanel: request => workspace.open(request),
            getScratch: () => ({vm, gui: {getBlockly}})
        });
        attached.push(documents);
        if (documents?.getPanelRequest && documents.subscribePanelRequests) {
            attached.push({dispose: workspace.connectSource(documents)});
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

const integration = createPlusIntegration({
    mountEditor: mountDocumentEditor,
    registerBlockShapes (ScratchBlocks) {
        registerDocumentSourceRootHatShape(ScratchBlocks);
        if (paletteDeletePreview) installPaletteDeletePreview(ScratchBlocks);
        if (horizontalBlockPalette || standardLayout || paletteCategoryReorder) {
            installHorizontalBlockPalette(ScratchBlocks, {
                allowManualToggle: horizontalBlockPalette, allowCategoryReorder: paletteCategoryReorder
            });
        }
        installBlockContextMenuIcons(ScratchBlocks);
    }
});

/**
 * This distribution's integration, read by the fork through the module it replaced.
 * @returns {object} The integration.
 */
export const plusIntegration = () => integration;
