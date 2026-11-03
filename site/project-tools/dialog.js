import styles from './dialog.css';
import {contactLink, descriptionParts} from './links.js';

const element = (document, tag, text, attributes = {}) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
};

/** Native modal dialogs keep focus and Escape handling in the browser, outside the stage. */
export const createProjectDialogs = (document, properties, history) => {
    let active = null;
    let returnFocus = null;
    let identity = 0;
    const close = () => {
        if (!active) return;
        active.remove(); active = null;
        if (returnFocus?.isConnected) returnFocus.focus();
    };
    const open = (title, locale) => {
        close();
        returnFocus = document.activeElement;
        const dialog = element(document, 'dialog', undefined, {class: styles.dialog,
            'data-project-tools': '', 'aria-labelledby': `project-tools-title-${++identity}`});
        dialog.appendChild(element(document, 'h2', title, {id: `project-tools-title-${identity}`}));
        dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
        dialog.addEventListener('close', close);
        document.body.appendChild(dialog);
        active = dialog;
        return {dialog, label: (ja, en) => locale.startsWith('ja') ? ja : en};
    };
    const unsubscribe = properties.subscribe(() => {
        // A form must never apply an old project's draft to the newly opened project.
        if (properties.loadState().phase === 'loading') close();
    });
    return {
        showProperties(locale = 'en') {
            const {dialog, label} = open(locale.startsWith('ja') ? '作品のプロパティ' : 'Project Properties', locale);
            dialog.setAttribute('data-testid', 'project-properties');
            const value = properties.snapshot();
            const recent = history.snapshot();
            const inputs = {};
            const form = element(document, 'form');
            const field = (key, title, list) => {
                const id = `project-properties-${key}-${identity}`;
                const row = element(document, 'label', title, {for: id});
                const input = element(document, key === 'description' ? 'textarea' : 'input', undefined,
                    {id, name: key});
                input.value = value[key];
                input.disabled = value.readOnly || value.loading;
                if (key === 'title') input.maxLength = 100;
                if (key === 'description') input.rows = 5;
                if (list) {
                    input.setAttribute('list', `${id}-history`);
                    const datalist = element(document, 'datalist', undefined, {id: `${id}-history`});
                    for (const text of list) datalist.appendChild(element(document, 'option', undefined, {value: text}));
                    form.appendChild(datalist);
                }
                row.appendChild(input); form.appendChild(row); inputs[key] = input;
                return input;
            };
            field('title', label('作品タイトル', 'Project title'));
            const description = field('description', label('作品概要', 'Description'));
            const preview = element(document, 'div', undefined, {class: styles.preview,
                'aria-label': label('作品概要のプレビュー', 'Description preview')});
            const renderPreview = () => {
                preview.replaceChildren();
                for (const part of descriptionParts(description.value)) {
                    preview.appendChild(part.href ? element(document, 'a', part.text,
                        {href: part.href, target: '_blank', rel: 'noopener noreferrer'}) : document.createTextNode(part.text));
                }
            };
            description.addEventListener('input', renderPreview); renderPreview(); form.appendChild(preview);
            field('author', label('作者名', 'Author name'), recent.names);
            const contact = field('contact', label('連絡先', 'Contact'), recent.contacts);
            const contactView = element(document, 'div', undefined, {class: styles.preview});
            const renderContact = () => {
                const href = contactLink(contact.value);
                contactView.replaceChildren();
                if (!href) return;
                contactView.appendChild(element(document, 'a', contact.value, {href,
                    ...(href.startsWith('https:') ? {target: '_blank', rel: 'noopener noreferrer'} : {})}));
            };
            contact.addEventListener('input', renderContact); renderContact(); form.appendChild(contactView);
            const dates = element(document, 'dl');
            for (const [key, title] of [['createdAt', label('作成日時', 'Created')],
                ['updatedAt', label('最終更新日時', 'Last updated')]]) {
                dates.appendChild(element(document, 'dt', title));
                const row = element(document, 'dd');
                row.appendChild(value[key] ? element(document, 'time', new Date(value[key]).toLocaleString(locale),
                    {datetime: value[key]}) : document.createTextNode(label('未記録', 'Not recorded')));
                dates.appendChild(row);
            }
            form.appendChild(dates);
            form.appendChild(element(document, 'p', label(
                '作者名・連絡先の候補はこのブラウザに各5件保持します。作品ファイルには今回の入力値を保存します。',
                'This browser remembers five recent names and contacts. Only the current values are saved in the project.')));
            if (value.readOnly) form.appendChild(element(document, 'p', label(
                'この作品情報の形式は未対応です。元の情報を保持し、編集はできません。',
                'This metadata version is unsupported. The original data is preserved and cannot be edited.')));
            const error = element(document, 'p', '', {role: 'alert'});
            form.appendChild(error);
            const actions = element(document, 'div', undefined, {class: styles.actions});
            const cancel = element(document, 'button', label('キャンセル', 'Cancel'), {type: 'button'});
            cancel.addEventListener('click', close);
            const apply = element(document, 'button', label('適用', 'Apply'), {type: 'submit'});
            apply.disabled = value.readOnly || value.loading;
            actions.append(cancel, apply); form.appendChild(actions);
            form.addEventListener('submit', event => {
                event.preventDefault();
                try {
                    const draft = Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value]));
                    properties.apply(draft);
                    history.remember(draft.author, draft.contact);
                    close();
                } catch (failure) {
                    error.textContent = label('作品情報を適用できませんでした。読み込み完了後に開き直してください。',
                        'Could not apply properties. Reopen this dialog after loading has finished.');
                }
            });
            dialog.appendChild(form);
            dialog.showModal(); inputs.title.focus();
        },
        ownsKeyEvent: event => Boolean(event.target?.closest?.('[data-project-tools]')),
        dispose () { unsubscribe(); close(); }
    };
};
