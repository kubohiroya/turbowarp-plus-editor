import './block-argument-text.css';

/**
 * Long text in a block argument.
 *
 * The vertical renderer sets `MAX_DISPLAY_LENGTH` to Infinity, so a text argument draws every
 * character and the block grows until it covers its neighbours. This caps what a text argument
 * shows, and edits a value that no longer fits in a dialog instead of the one-line inline editor.
 */

/** Display budget in half-width columns. A wide character, such as a kanji, takes two. */
export const ARGUMENT_TEXT_COLUMNS = 30;

const wide = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|[\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u;
const lineBreak = /[\r\n]/;

/**
 * Where a value's display is cut, in UTF-16 units, or undefined when it shows in full.
 * The cut leaves one column for the ellipsis and never splits a line break or a surrogate pair.
 * @param {string} text The value.
 * @param {number} columns The display budget.
 * @returns {number | undefined} The number of leading units shown before the ellipsis.
 */
export const argumentTextCut = (text: string, columns = ARGUMENT_TEXT_COLUMNS): number | undefined => {
    let used = 0;
    let index = 0;
    let fit: number | undefined;
    for (const character of text) {
        if (lineBreak.test(character)) return fit ?? index;
        used += wide.test(character) ? 2 : 1;
        if (used > columns - 1 && fit === undefined) fit = index;
        if (used > columns) return fit;
        index += character.length;
    }
    return undefined;
};

/**
 * True when a value is edited in the dialog: it is cut on the block, or it spans lines.
 * @param {string} text The value.
 * @returns {boolean} Whether the dialog edits it.
 */
export const editsInDialog = (text: string) => argumentTextCut(text) !== undefined;

const text = (locale: string) => /^ja(?:-|$)/i.test(locale) ? {
    title: 'テキストを編集', cancel: 'キャンセル', save: '保存'
} : {
    title: 'Edit text', cancel: 'Cancel', save: 'Save'
};

/**
 * Show the dialog for one value.
 * @param {Document} document The editor's document.
 * @param {string} value The current value.
 * @param {string} locale The editor's language.
 * @param {(value: string) => void} save Called with the edited value when the dialog is saved.
 * @returns {HTMLDialogElement} The open dialog.
 */
export const openArgumentTextDialog = (document: Document, value: string, locale: string,
    save: (value: string) => void) => {
    const labels = text(locale);
    const dialog = document.createElement('dialog');
    dialog.className = 'twPlusArgumentTextDialog';
    dialog.setAttribute('aria-label', labels.title);
    const form = document.createElement('form');
    form.method = 'dialog';
    const heading = document.createElement('h2');
    heading.textContent = labels.title;
    const area = document.createElement('textarea');
    area.value = value;
    area.spellcheck = false;
    area.setAttribute('aria-label', labels.title);
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = labels.cancel;
    cancel.dataset.dialogAction = 'cancel';
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = labels.save;
    submit.dataset.dialogAction = 'confirm';
    const footer = document.createElement('footer');
    footer.className = 'tw-plus-dialog-actions';
    footer.append(cancel, submit);
    form.append(heading, area, footer);
    dialog.append(form);

    let open = true;
    const close = () => {
        if (!open) return;
        open = false;
        if (dialog.open) dialog.close();
        dialog.remove();
    };
    cancel.addEventListener('click', close);
    dialog.addEventListener('cancel', event => {
        event.preventDefault();
        close();
    });
    form.addEventListener('submit', event => {
        event.preventDefault();
        const next = area.value;
        close();
        save(next);
    });
    area.addEventListener('keydown', event => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
            event.preventDefault();
            form.requestSubmit(submit);
        }
    });

    document.body.append(dialog);
    dialog.showModal();
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
    return dialog;
};

const installed = new WeakSet<object>();

/**
 * Cap text arguments and route long values to the dialog.
 * Only plain text inputs open the dialog: number, text-with-menu and procedure-name fields keep
 * their own editors, and a field an extension gave its own `showEditor_` keeps that one.
 * @param {object} ScratchBlocks The loaded ScratchBlocks.
 */
export const installBlockArgumentText = ScratchBlocks => {
    const FieldTextInput = ScratchBlocks?.FieldTextInput;
    const field = FieldTextInput?.prototype;
    if (!field?.showEditor_ || !field.getDisplayText_ || installed.has(field)) return;
    installed.add(field);

    const {getDisplayText_: displayText, showEditor_: showEditor} = field;
    field.getDisplayText_ = function (...args) {
        const value = this.text_;
        const cut = typeof value === 'string' ? argumentTextCut(value) : undefined;
        if (cut === undefined) return displayText.apply(this, args);
        // The inherited code still handles empty values, spacing and right-to-left text.
        this.text_ = `${value.slice(0, cut)}…`;
        try {
            return displayText.apply(this, args);
        } finally {
            this.text_ = value;
        }
    };

    field.showEditor_ = function (quietInput, readOnly, ...rest) {
        const block = this.sourceBlock_;
        const document = block?.workspace?.getInjectionDiv?.()?.ownerDocument;
        if (Object.getPrototypeOf(this) !== field || readOnly || !document ||
            typeof this.text_ !== 'string' || !editsInDialog(this.text_)) {
            return showEditor.call(this, quietInput, readOnly, ...rest);
        }
        ScratchBlocks.WidgetDiv?.hide?.();
        ScratchBlocks.DropDownDiv?.hideWithoutAnimation?.();
        const locale = ScratchBlocks.ScratchMsgs?.currentLocale_ ?? document.documentElement.lang ?? 'en';
        openArgumentTextDialog(document, this.text_, locale, value => {
            if (this.sourceBlock_ !== block || !block.workspace) return;
            const validated = this.callValidator(value);
            if (validated === null) return;
            const events = ScratchBlocks.Events;
            events?.setGroup?.(true);
            try {
                // Same path as the inline editor's save: one change event, then the render.
                this.setText(validated);
                this.onFinishEditing_?.(validated);
            } finally {
                events?.setGroup?.(false);
            }
            if (block.rendered) block.render();
        });
    };
};
