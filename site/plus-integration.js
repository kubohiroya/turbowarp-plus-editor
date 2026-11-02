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
 * wiring (the fork's `tw-document-editor.jsx`) and the stage controls an extension registers
 * (its `tw-stage-controls.js`).
 */

import {mountDocumentEditor, readDocumentEditorFlags} from '@kubohiroya/turbowarp-document-editor';

import getStageControls from './stage-controls.js';

// Resolved once when the bundle starts, as the fork did: a project cannot enable document editing
// by being opened, and a later URL change cannot turn it on either.
const startupFlags = readDocumentEditorFlags(typeof window === 'undefined' ? '' : window.location.search);

/**
 * Build the integration from what it depends on, so a test can hand in its own. The exported
 * `plusIntegration` is this applied to the real package and the startup flags.
 * @param {object} dependencies `mountEditor` and `flags`.
 * @returns {object} The integration this distribution supplies.
 */
export const createPlusIntegration = ({mountEditor, flags, stageControls = getStageControls}) => ({
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
        if (!flags.embeddedYamlEditor) return null;
        return mountEditor({
            vm,
            document: hostDocument,
            language: locale,
            documentSources: flags.documentSources,
            getScratch: () => ({vm, gui: {getBlockly}})
        });
    }
});

const integration = createPlusIntegration({mountEditor: mountDocumentEditor, flags: startupFlags});

/**
 * This distribution's integration, read by the fork through the module it replaced.
 * @returns {object} The integration.
 */
export const plusIntegration = () => integration;
