export type FieldAction = {id: string; label: string};
export type FieldActionPanel = {title: string; actions: readonly FieldAction[]};

/** A field editor supplied by a trusted extension. Callbacks run in the parent editor. */
export interface ProgrammaticExtensionField {
    type: 'turbowarp_plus_actions';
    getEditor(value: string): FieldActionPanel;
    applyAction(value: string, actionId: string): string | undefined | Promise<string | undefined>;
}

export function runFieldAction(editor: ProgrammaticExtensionField, value: string, actionId: string,
    complete: (next: string | undefined) => void, onError: (error: unknown) => void) {
    try {
        const next = editor.applyAction(value, actionId);
        if (typeof next === 'string') complete(next);
        else if (next === undefined) complete(undefined);
        else void Promise.resolve(next).then(complete).catch(onError);
    } catch (error) {
        onError(error);
    }
}

export function readFieldActionPanel(editor: ProgrammaticExtensionField, value: string): FieldActionPanel | undefined {
    const panel = editor.getEditor(value);
    if (typeof panel?.title !== 'string' || !Array.isArray(panel.actions) ||
        !panel.actions.length || panel.actions.length > 32) return;
    const actions: FieldAction[] = [];
    const ids = new Set<string>();
    for (const action of panel.actions) {
        if (typeof action?.id !== 'string' || !action.id || typeof action.label !== 'string' || ids.has(action.id)) return;
        ids.add(action.id);
        actions.push({id: action.id, label: action.label});
    }
    return {title: panel.title, actions};
}

export function createFieldActionDialog(document: Document) {
    let current: HTMLDialogElement | undefined;
    const close = () => {
        current?.close();
        current?.remove();
        current = undefined;
    };
    return {close, show(panel: FieldActionPanel, select: (id: string) => void, locale?: string) {
        close();
        const dialog = document.createElement('dialog');
        const title = document.createElement('h2');
        title.textContent = panel.title;
        dialog.setAttribute('aria-label', panel.title);
        dialog.append(title);
        for (const {id, label} of panel.actions) {
            const button = document.createElement('button');
            button.textContent = label;
            button.addEventListener('click', () => {
                close();
                select(id);
            });
            dialog.append(button);
        }
        const cancel = document.createElement('button');
        cancel.textContent = /^ja(?:-|$)/i.test(locale) ? 'キャンセル' : 'Cancel';
        cancel.addEventListener('click', close);
        dialog.append(cancel);
        dialog.addEventListener('cancel', event => {
            event.preventDefault();
            close();
        });
        document.body.append(dialog);
        current = dialog;
        dialog.showModal();
    }};
}
