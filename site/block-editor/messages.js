export const fixedMessages = intl => ({
    reset: intl.formatMessage({id: 'tw.blockEditor.fixed.reset',
        defaultMessage: 'Reset',
        description: 'Reset one fixed input to its declared reset value'}),
    readOnly: intl.formatMessage({id: 'tw.blockEditor.fixed.readOnly',
        defaultMessage: 'This input cannot be edited safely.',
        description: 'A fixed input is read only'}),
    unverified: intl.formatMessage({id: 'tw.blockEditor.fixed.unverified',
        defaultMessage: 'The expression is retained without evaluation. Its runtime validity has not been checked.',
        description: 'A retained reporter expression is not evaluated by the editor'}),
    currentValue: intl.formatMessage({id: 'tw.blockEditor.fixed.currentValue',
        defaultMessage: 'Current value',
        description: 'The raw captured value of a fixed input'}),
    colorPicker: intl.formatMessage({id: 'tw.blockEditor.fixed.colorPicker',
        defaultMessage: 'color picker',
        description: 'Accessible name of a fixed color picker'}),
    invalidValue: intl.formatMessage({id: 'tw.blockEditor.fixed.invalidValue',
        defaultMessage: 'Check this value before saving.',
        description: 'A fixed input is invalid'}),
    inactiveDraft: intl.formatMessage({id: 'tw.blockEditor.fixed.inactiveDraft',
        defaultMessage: 'Hidden edits are retained in this dialog and will not be saved while hidden.',
        description: 'A hidden fixed input has unsaved edits'})
});

export const dialogMessages = intl => ({
        title: intl.formatMessage({
            id: 'tw.blockEditor.title', defaultMessage: 'Edit block', description: 'Block editor dialog title'
        }),
        saving: intl.formatMessage({
            id: 'tw.blockEditor.saving', defaultMessage: 'Saving…', description: 'Block editor save is pending'
        }),
        cancel: intl.formatMessage({
            id: 'tw.blockEditor.cancel', defaultMessage: 'Cancel', description: 'Cancel block editing'
        }),
        save: intl.formatMessage({
            id: 'tw.blockEditor.save', defaultMessage: 'Save', description: 'Save block editing'
        }),
        saveAll: intl.formatMessage({
            id: 'tw.blockEditor.saveAll', defaultMessage: 'Save all', description: 'Save all block forms'
        }),
        structureError: intl.formatMessage({
            id: 'tw.blockEditor.structureError',
            defaultMessage: 'This hierarchy is invalid or exceeds 500 blocks or 32 levels. No blocks were saved.',
            description: 'A hierarchy cannot be opened safely'
        }),
        conflict: intl.formatMessage({
            id: 'tw.blockEditor.conflict',
            defaultMessage: 'This block changed. Close this dialog and open it again.',
            description: 'Block editor conflict message'
        }),
        failed: intl.formatMessage({
            id: 'tw.blockEditor.failed',
            defaultMessage: 'The block could not be edited. Close this dialog and try again.',
            description: 'Block editor failure message'
        }),
        invalidInput: intl.formatMessage({
            id: 'tw.blockEditor.fixed.invalidValue',
            defaultMessage: 'Check this value before saving.',
            description: 'A fixed input is invalid'
        }),
        structuralNode: intl.formatMessage({
            id: 'tw.blockEditor.structuralNode',
            defaultMessage: 'No form for this block; its nested blocks are included.',
            description: 'An intermediate structural block without an editor'
        })
    });
