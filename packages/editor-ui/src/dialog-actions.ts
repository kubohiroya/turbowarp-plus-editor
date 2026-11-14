export type DialogAction = 'cancel' | 'close' | 'confirm' | 'delete';

export function dialogAction(button: HTMLButtonElement, action: DialogAction) {
    button.dataset.dialogAction = action;
    return button;
}

export function dialogActions(document: Document, ...buttons: HTMLButtonElement[]) {
    const footer = document.createElement('div');
    footer.className = 'tw-plus-dialog-actions';
    footer.append(...buttons);
    return footer;
}
