import styles from './dialog.css';
import snackbarStyles from '../styles/snackbar.css';
import {contactLink, descriptionParts} from './links.ts';
import {diagnosticText} from './diagnostics.ts';
import {renderBundleAssetForm, renderPayloadForm} from '../project-payloads/form.ts';

const element = <Tag extends keyof HTMLElementTagNameMap>(document: Document, tag: Tag, text?: string, attributes: Record<string, string> = {}) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
};

/** Native modal dialogs keep focus and Escape handling in the browser, outside the stage. */
export const createProjectDialogs = (document, properties, history, diagnostics, {
    locale: hostLocale, getLocale
}: {locale?: string; getLocale?: () => string | undefined} = {}) => {
    let active = null;
    let returnFocus = null;
    let identity = 0;
    let disposeView = null;
    let notice = null;
    let noticeReturnFocus = null;
    let notifiedError = '';
    const close = () => {
        if (!active) return;
        disposeView?.(); disposeView = null;
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
    const stopNotice = diagnostics?.subscribe(() => {
        const sessions = diagnostics.snapshot();
        const error = sessions[0]?.events.filter(event => ['error', 'project-error'].includes(event.type)).at(-1);
        const key = error ? `${sessions[0].id}:${error.time}:${error.code}:${error.type}` : '';
        if (!key || key === notifiedError) return;
        notifiedError = key;
        if (!notice?.contains(document.activeElement)) noticeReturnFocus = document.activeElement;
        notice?.remove();
        const locale = getLocale?.() || hostLocale || document.documentElement.lang || 'en';
        const ja = locale.startsWith('ja');
        notice = element(document, 'aside', undefined, {class: snackbarStyles.snackbar, 'data-project-tools': '',
            'data-testid': 'project-diagnostics-snackbar'});
        const message = error.type === 'project-error' ?
            (ja ? '作品を開けませんでした。' : 'Could not open the project.') :
            (ja ? '拡張機能を読み込めませんでした。' : 'Could not load the extension.');
        notice.appendChild(element(document, 'span', message, {role: 'status', 'aria-atomic': 'true'}));
        const show = element(document, 'button', ja ? '詳細ログを表示' : 'View detailed log', {type: 'button'});
        show.addEventListener('click', () => {
            api.showDiagnostics(locale, sessions[0].id);
            returnFocus = noticeReturnFocus;
            notice.remove();
        });
        const dismiss = element(document, 'button', ja ? '閉じる' : 'Dismiss', {type: 'button'});
        dismiss.addEventListener('click', () => {
            const restore = notice.contains(document.activeElement);
            notice.remove();
            if (restore && noticeReturnFocus?.isConnected) noticeReturnFocus.focus();
        });
        notice.append(show, dismiss); document.body.appendChild(notice);
    });
    const api = {
        showView(title: string, locale: string, render: (document: Document, close: () => void) =>
            HTMLElement | {element: HTMLElement; dispose(): void}) {
            const {dialog} = open(title, locale);
            const view = render(document, () => {if (active === dialog) close();});
            if ('element' in view) {
                dialog.append(view.element);
                disposeView = view.dispose;
            } else dialog.append(view);
            dialog.showModal();
        },
        showProperties(locale = 'en', editURI) {
            const {dialog, label} = open(locale.startsWith('ja') ? '作品のプロパティ' : 'Project Properties', locale);
            dialog.setAttribute('data-testid', 'project-properties');
            const value = properties.snapshot();
            const inputs: Record<string, HTMLInputElement | HTMLTextAreaElement> = {};
            const form = element(document, 'form');
            const field = (key: string, title: string, list?: string[]) => {
                const id = `project-properties-${key}-${identity}`;
                const row = element(document, 'label', title, {for: id});
                const input = element(document, key === 'description' ? 'textarea' : 'input', undefined,
                    {id, name: key});
                input.value = value[key];
                input.disabled = value.readOnly || value.loading;
                if (key === 'title') input.maxLength = 100;
                if (key === 'description') (input as HTMLTextAreaElement).rows = 5;
                if (list) {
                    input.setAttribute('list', `${id}-history`);
                    const datalist = element(document, 'datalist', undefined, {id: `${id}-history`});
                    for (const text of list) datalist.appendChild(element(document, 'option', undefined, {value: text}));
                    form.appendChild(datalist);
                }
                row.appendChild(input); form.appendChild(row); inputs[key] = input;
                return input;
            };
            if (history) field('title', label('作品タイトル', 'Project title'));
            let uriInput;
            if (editURI) {
                const id = `project-uri-${identity}`;
                const row = element(document, 'label', label('作品の URI', 'Project URI'), {for: id});
                uriInput = element(document, 'input', undefined, {
                    id, name: 'uri', inputmode: 'url', 'aria-describedby': `${id}-help`
                });
                uriInput.value = editURI.uri;
                uriInput.disabled = value.loading;
                row.appendChild(uriInput);
                const help = element(document, 'p', label(
                    '適用した URI は、次に作品を保存したときに SB3 に記録されます。',
                    'The URI will be recorded in the SB3 the next time you save the project.'), {id: `${id}-help`});
                form.append(row, help);
            }
            if (history) {
                const recent = history.snapshot();
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
            }
            const canApplyMetadata = Boolean(history) && !value.readOnly;
            const error = element(document, 'p', '', {role: 'alert'});
            form.appendChild(error);
            const actions = element(document, 'div', undefined, {class: styles.actions});
            const cancel = element(document, 'button', label('キャンセル', 'Cancel'), {type: 'button'});
            cancel.addEventListener('click', close);
            const apply = element(document, 'button', label('適用', 'Apply'), {type: 'submit'});
            apply.disabled = value.loading || (!canApplyMetadata && !uriInput);
            const diagnosticsButton = element(document, 'button', label('作品の診断…', 'Project Diagnostics…'), {type: 'button'});
            diagnosticsButton.addEventListener('click', () => api.showDiagnostics(locale));
            actions.append(cancel, apply, diagnosticsButton); form.appendChild(actions);
            form.addEventListener('submit', async event => {
                event.preventDefault();
                if (apply.disabled) return;
                apply.disabled = true;
                error.textContent = '';
                const draft = Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value]));
                try {
                    // Validate and apply the URI first so a rejected URI cannot commit the metadata draft.
                    if (uriInput && uriInput.value.trim() !== editURI.uri) await editURI.apply(uriInput.value);
                    if (active !== dialog) return;
                    if (canApplyMetadata) {
                        properties.apply(draft);
                        history.remember(draft.author, draft.contact);
                    }
                    close();
                } catch (failure) {
                    error.textContent = failure.code === 'INVALID_PROJECT_URI' ?
                        label('認証情報やフラグメントを含まない HTTPS URI を入力してください。',
                            'Enter an HTTPS URI without credentials or a fragment.') :
                        label('作品情報を適用できませんでした。読み込み完了後に開き直してください。',
                            'Could not apply properties. Reopen this dialog after loading has finished.');
                    apply.disabled = false;
                    if (failure.code === 'INVALID_PROJECT_URI' && active === dialog) uriInput.focus();
                }
            });
            dialog.appendChild(form);
            dialog.showModal(); (inputs.title || uriInput)?.focus();
        },
        showPayloadFormats(edit, locale = 'en', addAssets?: () => void) {
            const {dialog} = open(locale.startsWith('ja') ? '作品データの形式' : 'Project Data Formats', locale);
            const {form, dispose} = renderPayloadForm(document, edit, locale, close);
            disposeView = dispose;
            if (addAssets) {
                const button = element(document, 'button', locale.startsWith('ja') ?
                    'バンドル素材を作品に追加…' : 'Add Bundle Material to Project…', {type: 'button'});
                button.onclick = addAssets;
                form.prepend(button);
            }
            dialog.append(form);
            dialog.showModal();
        },
        showBundleAssetConversion(conversion, locale = 'en') {
            const {dialog} = open(locale.startsWith('ja') ? 'バンドル素材を作品に追加' : 'Add Bundle Material to Project', locale);
            const {form, dispose} = renderBundleAssetForm(document, conversion, locale, close);
            disposeView = dispose;
            dialog.append(form);
            dialog.showModal();
        },
        showDiagnostics(locale = 'en', initialSession?: number) {
            const {dialog, label} = open(locale.startsWith('ja') ? '作品の診断' : 'Project Diagnostics', locale);
            dialog.setAttribute('data-testid', 'project-diagnostics');
            const selectorLabel = element(document, 'label', label('読み込みの記録', 'Load attempt'));
            const selector = element(document, 'select', undefined, {'aria-label': label('読み込みの記録', 'Load attempt')});
            selectorLabel.appendChild(selector); dialog.appendChild(selectorLabel);
            const content = element(document, 'div'); dialog.appendChild(content);
            const status = element(document, 'p', '', {role: 'status'}); dialog.appendChild(status);
            const actions = element(document, 'div', undefined, {class: styles.actions});
            const copy = element(document, 'button', label('診断をコピー', 'Copy diagnostics'), {type: 'button'});
            const done = element(document, 'button', label('閉じる', 'Close'), {type: 'button'});
            done.addEventListener('click', close); actions.append(copy, done); dialog.appendChild(actions);
            let selected = initialSession;
            let exported = '';
            const states = {
                loading: label('読み込み中', 'Loading'), loaded: label('読み込み完了', 'Loaded'),
                failed: label('読み込み失敗・キャンセル', 'Failed or cancelled'),
                verified: label('内容を検証済み', 'Content verified'), authorized: label('実行を許可済み', 'Execution approved'),
                review: label('実行許可を確認中', 'Reviewing execution permission'),
                retry: label('接続を再試行中', 'Retrying connection'), error: label('読み込みを拒否', 'Loading rejected'),
                'project-error': label('作品を開けませんでした', 'Could not open project')
            };
            const render = () => {
                const sessions = diagnostics?.snapshot() || [];
                const session = sessions.find(value => value.id === selected) || sessions[0];
                selected = session?.id;
                selector.replaceChildren(...sessions.map(value => element(document, 'option',
                    `${new Date(value.startedAt).toLocaleString(locale)} · ${value.title || label('タイトル未設定', 'Untitled')} · ${states[value.phase] || value.phase}`,
                    {value: value.id})));
                if (session) selector.value = String(session.id);
                selector.disabled = sessions.length < 2; copy.disabled = !session;
                exported = diagnosticText(session); content.replaceChildren();
                if (!session || !session.events.length) {
                    content.appendChild(element(document, 'p', label('診断イベントはまだありません。', 'No diagnostic events have been recorded.')));
                }
                if (!session) return;
                for (const extension of session.extensions) {
                    const details = element(document, 'details');
                    details.appendChild(element(document, 'summary', extension.id));
                    details.appendChild(element(document, 'pre', [extension.source, extension.execution,
                        `SHA-256: ${extension.sha256}`].filter(Boolean).join('\n')));
                    content.appendChild(details);
                }
                const list = element(document, 'ol');
                for (const event of session.events) {
                    const details = element(document, 'details');
                    details.appendChild(element(document, 'summary',
                        [states[event.type] || event.type, event.id, event.ids?.join(', '), event.code].filter(Boolean).join(' · ')));
                    details.appendChild(element(document, 'pre', JSON.stringify(event, null, 2)));
                    const item = element(document, 'li'); item.appendChild(details); list.appendChild(item);
                }
                content.appendChild(list);
            };
            selector.addEventListener('change', () => { selected = Number(selector.value); render(); });
            copy.addEventListener('click', async () => {
                try {
                    await document.defaultView.navigator.clipboard.writeText(exported);
                    status.textContent = label('コピーしました。', 'Copied.');
                } catch (error) {
                    // Clipboard permissions differ by browser; offer selectable text without opening a new window.
                    const text = element(document, 'textarea', undefined, {readonly: '',
                        'aria-label': label('コピーする診断内容', 'Diagnostics to copy')});
                    text.value = exported; content.replaceChildren(text); text.focus(); text.select();
                    status.textContent = label('選択した内容をコピーしてください。', 'Copy the selected text.');
                }
            });
            disposeView = diagnostics?.subscribe(render);
            render(); dialog.showModal(); done.focus();
        },
        ownsKeyEvent: event => Boolean(event.target?.closest?.('[data-project-tools]')),
        dispose () { unsubscribe(); stopNotice?.(); notice?.remove(); close(); }
    };
    return api;
};
