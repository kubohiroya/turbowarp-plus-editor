/**
 * The form-based block editor this distribution ships.
 *
 * `@kubohiroya/turbowarp-extension-data-editor` turns an extension's declared schema into a form,
 * attaches an icon to the blocks that have one, and edits a block without touching the workspace's
 * own editing. All three of its entry points are here, because the package is this distribution's.
 *
 * What stays in the GUI is what only the GUI has. Its translations above all: the dialog's text
 * goes through the GUI's own message extraction, with community translations against those ids, so
 * the strings arrive from there rather than being restated here. So do the workspace, ScratchBlocks,
 * its modal frame and its palette — `src/components/block-editor/block-editor.css` builds the
 * dialog's colours out of the GUI's own stylesheet variables at build time, which only the GUI's
 * build can resolve.
 */

import {createBlockEditorService} from '@kubohiroya/turbowarp-extension-data-editor/rjsf';
import {BlockEditorDialog} from '@kubohiroya/turbowarp-extension-data-editor/react';
import styles from '@kubohiroya/turbowarp-extension-data-editor/react/styles.css';
import {attachTurboWarpBlockEditors} from '@kubohiroya/turbowarp-extension-data-editor/turbowarp';
import React from 'react';

/**
 * Build the wiring, so a test can hand in its own package entry points.
 * @param {object} [parts] `createService`, `attach` and `dialog` for tests; the defaults are real.
 * @returns {object} `createService`, `attach` and `render`.
 */
export const createPlusBlockEditor = ({
    createService = createBlockEditorService,
    attach = attachTurboWarpBlockEditors,
    dialog = BlockEditorDialog
} = {}) => Object.freeze({
    /**
     * The editing service for one VM.
     *
     * Which kinds of form this build supports is its own decision; the GUI supplies only the text
     * for the inputs it cannot name itself, because those strings are its translations.
     * @param {object} context `fixedInputMessages`, a callback returning the GUI's strings.
     * @returns {object} The service.
     */
    createService: ({fixedInputMessages}) => createService({
        commonLayout: true,
        fixedInputs: true,
        fixedInputMessages
    }),
    /**
     * Put the editors on a workspace: the icon on every block that has a form, and the opening.
     *
     * Everything about the workspace comes from the GUI — ScratchBlocks, the workspace itself, the
     * VM, the service, the icon's tooltip, whether opening is allowed right now, and what to do
     * when one opens. What this adds is that this build has editors at all, and that they cover
     * nested blocks and fixed inputs.
     * @param {object} context What the GUI knows about its workspace.
     * @returns {object} A bridge to dispose of when the workspace goes away.
     */
    attach: context => attach({enabled: true, descendants: true, ...context}),
    /**
     * Render the dialog inside the GUI's own modal frame, which arrives as `ModalComponent`.
     *
     * The package's own stylesheet is added here; the `className` the GUI passes carries its
     * palette, which is built from the GUI's variables and so can only come from there.
     * @param {object} props What the GUI passes: messages, frame, session, labels, callbacks.
     * @returns {object} The element to render.
     */
    render: props => React.createElement(dialog, {styles, ...props})
});

export const plusBlockEditor = createPlusBlockEditor();
