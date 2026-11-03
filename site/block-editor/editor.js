/** The distribution owns form behavior, messages, compatibility and appearance. */

import {createBlockEditorService} from '@kubohiroya/turbowarp-extension-data-editor/rjsf';
import {BlockEditorDialog} from '@kubohiroya/turbowarp-extension-data-editor/react';
import styles from '@kubohiroya/turbowarp-extension-data-editor/react/styles.css';
import {attachTurboWarpBlockEditors} from '@kubohiroya/turbowarp-extension-data-editor/turbowarp';
import React from 'react';
import theme from './theme.css';
import {fixedMessages, dialogMessages} from './messages.js';
import exposeBlockEditorAPI from './capabilities.js';

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
     * The GUI supplies its current Intl context; the distribution owns the messages and API compatibility.
     * @param {object} context `getIntl`, or legacy `fixedInputMessages` from an older GUI.
     * @returns {object} The service.
     */
    createService: ({getIntl, fixedInputMessages} = {}) => {
        const service = createService({
            commonLayout: true,
            fixedInputs: true,
            fixedInputMessages: fixedInputMessages || (() => {
                const intl = getIntl?.();
                return intl ? fixedMessages(intl) : {};
            })
        });
        return {...service, api: exposeBlockEditorAPI(service.api)};
    },
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
     * Both stylesheets belong to this host and read the GUI's public theme variables.
     * @param {object} props What the GUI passes: messages, frame, session, labels, callbacks.
     * @returns {object} The element to render.
     */
    render: ({intl, ...props}) => React.createElement(dialog, {
        styles,
        ...props,
        className: `${theme.theme || ''} ${theme.commonLayout || ''} ${props.className || ''}`,
        messages: intl ? dialogMessages(intl) : props.messages
    })
});

export const plusBlockEditor = createPlusBlockEditor();
