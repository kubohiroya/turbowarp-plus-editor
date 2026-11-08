import styles from '../project-tools/dialog.css';

/** Ask before sending an SB3-provided URL any request, including for non-cacheable data. */
export function approveProjectPayloads(document, locale, urls, cacheable, signal) {
    if (!document?.body || signal?.aborted) return Promise.resolve(undefined);
    const ja = (locale || document.documentElement.lang).startsWith('ja');
    return new Promise(resolve => {
        const dialog = document.createElement('dialog');
        const title = document.createElement('h2');
        title.textContent = ja ? '作品のデータを取得する' : 'Load Project Data';
        dialog.setAttribute('aria-label', title.textContent);
        dialog.setAttribute('data-project-tools', '');
        // Share the project tools' themed frame so this dialog follows the editor's theme too.
        dialog.className = styles.dialog;
        dialog.style.overflowWrap = 'anywhere';
        const list = document.createElement('ul');
        for (const url of urls) {
            const row = document.createElement('li');
            row.textContent = url;
            list.append(row);
        }
        const finish = answer => {
            signal?.removeEventListener('abort', cancel);
            dialog.remove();
            resolve(answer);
        };
        const cancel = () => finish(undefined);
        const button = (label, answer) => {
            const node = document.createElement('button');
            node.type = 'button';
            node.textContent = label;
            node.addEventListener('click', () => finish(answer));
            return node;
        };
        dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
        signal?.addEventListener('abort', cancel, {once: true});
        dialog.append(title, list, button(ja ? 'キャンセル' : 'Cancel', undefined),
            button(cacheable ? (ja ? 'キャッシュせずに開く' : 'Open without caching') : (ja ? '開く' : 'Open'), false));
        if (cacheable) dialog.append(button(ja ? 'キャッシュを許可して開く' : 'Allow caching and open', true));
        document.body.append(dialog);
        dialog.showModal();
    });
}
