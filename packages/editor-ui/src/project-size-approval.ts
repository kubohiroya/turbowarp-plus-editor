import {dialogAction, dialogActions} from './dialog-actions.ts';
/**
 * Ask whether to open a project larger than the Editor's standard limit (issue #428).
 *
 * The person sees how large the project is before anything is expanded, and decides for this one
 * load. Nothing is remembered. Without a document to show the question in, or once the load is
 * cancelled, the answer is no.
 */

const MiB = 1024 * 1024;

const formatMiB = (bytes: number) => {
    const value = bytes / MiB;
    return value >= 10 ? Math.round(value).toString() : value.toFixed(1);
};

export interface ProjectSizeQuestion {
    /** The bytes the project expands to. */
    bytes: number;
    /** The standard limit it is over. */
    limit: number;
}

export function confirmLargeProject(document: Document | undefined, locale: string | undefined,
    {bytes, limit}: ProjectSizeQuestion, {className, signal}: {className?: string; signal?: AbortSignal} = {}):
    Promise<boolean> {
    if (!document?.body || signal?.aborted) return Promise.resolve(false);
    const ja = (locale || document.documentElement.lang || '').startsWith('ja');
    return new Promise(resolve => {
        const dialog = document.createElement('dialog');
        if (typeof dialog.showModal !== 'function') {
            resolve(false);
            return;
        }
        const title = document.createElement('h2');
        title.textContent = ja ? '大きな作品を開く' : 'Open a Large Project';
        dialog.setAttribute('aria-label', title.textContent);
        dialog.setAttribute('data-project-size-approval', '');
        if (className) dialog.className = className;
        const message = document.createElement('p');
        message.textContent = ja ?
            `この作品は展開すると約 ${formatMiB(bytes)} MiB になり、標準の上限（${formatMiB(limit)} MiB）を超えています。` +
            '開くと大量のメモリを使い、このタブが応答しなくなったり閉じたりすることがあります。' :
            `This project expands to about ${formatMiB(bytes)} MiB, over the standard limit of ${formatMiB(limit)} MiB. ` +
            'Opening it uses a lot of memory and may make this tab stop responding or close.';
        const advice = document.createElement('p');
        advice.textContent = ja ?
            '作成者や入手元に心当たりがない場合は、開かないでください。' :
            'Do not open it unless you know who made it or where it came from.';
        const finish = (answer: boolean) => {
            signal?.removeEventListener('abort', cancel);
            if (dialog.open) dialog.close();
            dialog.remove();
            resolve(answer);
        };
        const cancel = () => finish(false);
        const button = (label: string, answer: boolean) => {
            const node = document.createElement('button');
            node.type = 'button';
            node.textContent = label;
            node.addEventListener('click', () => finish(answer));
            return node;
        };
        const decline = button(ja ? '開かない' : 'Don’t Open', false);
        dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
        signal?.addEventListener('abort', cancel, {once: true});
        dialog.append(title, message, advice, dialogActions(document, dialogAction(decline, 'cancel'),
            dialogAction(button(ja ? '開く' : 'Open', true), 'confirm')));
        document.body.append(dialog);
        dialog.showModal();
        // The safe answer has the focus, so Enter alone does not open the project.
        decline.focus();
    });
}
