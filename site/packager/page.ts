/**
 * The page that builds a single HTML out of a project.
 *
 * Moved from the fork's `src/playground/plus-packager.js`. Its markup (`site/plus-packager.html`)
 * and its bundle (`scripts/site/build-plus-packager.cts`) were already this repository's; only the
 * entry was still over there. Nothing of the GUI is left in it: the catalog, the trust it implies,
 * the dialog that asks and the limits it accepts are all read from this side.
 */

import {createFetchPort} from '@kubohiroya/turbowarp-extension-loader';
import {prepareOfflinePackage} from '@kubohiroya/turbowarp-extension-loader/packager';
import {createProjectIO} from '@kubohiroya/turbowarp-extension-loader/project-codec';
import {createSessionTrustProvider} from '@kubohiroya/turbowarp-extension-loader/session-trust';
import JSZip from '@turbowarp/jszip';
import Packager from '@turbowarp/packager-web';
import {withWaitCursor, withoutWaitCursor} from '@kubohiroya/turbowarp-plus-editor-ui/busy-cursor';

import {extensionProjectArchiveOptions} from '../extension-host/config.ts';
import {createPlusPermissionUI} from '../extension-host/permission-ui.ts';
import {plusTrustedExtensions} from '../trusted-extensions.ts';
import {packagePlusHTML} from './html.ts';

const bundledAssets = __TW_PLUS_PACKAGER_ASSETS__;
const bundledRuntime = __TW_PLUS_EXTENSION_RUNTIME__;
const ui = createPlusPermissionUI(document, 'ja');
const status = document.querySelector('[data-testid="plus-package-status"]');
const file = document.querySelector<HTMLInputElement>('[data-testid="plus-package-file"]');
const generate = document.querySelector<HTMLButtonElement>('[data-testid="plus-package-generate"]');
const resources = document.querySelector<HTMLInputElement>('[data-testid="plus-package-resources"]');
const download = document.querySelector<HTMLAnchorElement>('[data-testid="plus-package-download"]');
let input;
let title = 'TurboWarp-Plus';
let currentURL;
let pending = false;
const setInput = (bytes, name) => {
    if (pending) return;
    input = bytes;
    title = String(name || 'TurboWarp-Plus').replace(/\.sb3$/i, '');
    status.textContent = `${title}: 外部依存がないことを確認してからHTMLを生成してください。`;
    generate.disabled = false;
    download.hidden = true;
};
file.addEventListener('change', async () => {
    const selected = file.files[0];
    if (!selected || pending) return;
    generate.disabled = true;
    download.hidden = true;
    try {
        // The core checks Blob.size before reading or inflating the selected file.
        await withWaitCursor([document], () => createProjectIO({zip: JSZip, ...extensionProjectArchiveOptions}).prepare(selected));
        if (file.files[0] === selected) setInput(selected, selected.name);
    } catch (error) {
        if (file.files[0] !== selected) return;
        input = null;
        status.textContent = `作品を読み込めませんでした: ${error.code || ''} ${error.message}`;
    }
});
window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== window.opener) return;
    const data = event.data && event.data.twPlusPackage;
    if (!data || data.type !== 'project' || !(data.bytes instanceof ArrayBuffer)) return;
    setInput(new Uint8Array(data.bytes), data.name);
});
if (window.opener) window.opener.postMessage({twPlusPackage: {type: 'ready'}}, location.origin);

generate.addEventListener('click', async () => {
    if (!input || pending || !resources.checked) {
        status.textContent = '作品を選び、外部依存がないことを確認してください。';
        return;
    }
    pending = true;
    generate.disabled = true;
    download.hidden = true;
    try {
        await withWaitCursor([document], generateHTML);
    } finally {
        pending = false;
        generate.disabled = false;
    }
});

async function generateHTML() {
    // What the host's catalog lists is trusted like TurboWarp's official gallery, as in the Editor.
    const trusted = plusTrustedExtensions.catalog;
    const trustProvider = createSessionTrustProvider({requestApproval: async (code, options) =>
        await trusted.isTrustedCode(code) || withoutWaitCursor(document, () => ui.requestApproval(code, options))});
    try {
        status.textContent = '作品と拡張のバイト列を検証しています…';
        const io = createProjectIO({zip: JSZip, ...extensionProjectArchiveOptions});
        const prepared = await io.prepare(input);
        if (!prepared.manifest) throw new Error('Plus Manifestがありません。通常の作品には標準Packagerを使用してください。');
        const resourceDependencies = Object.fromEntries(prepared.manifest.extensions.map(spec => [spec.id, [] as never[]]));
        // A transient failure is retried for a few seconds; say so instead of looking stuck. How
        // many attempts there are in all comes from the Loader, so this page does not have to know
        // the retry settings to say "2 of 3".
        const onRetry = ({url, attempt, attempts, delayMs}) => {
            status.textContent = `接続できませんでした。再試行しています（${attempt + 1}/${attempts}）: ${url}`;
            ui.diagnostics({
                type: 'retry',
                attempt: attempt + 1,
                attempts,
                delayMs,
                message: url
            });
        };
        const compiled = await prepareOfflinePackage(input, {
            fetcher: createFetchPort(fetch, {onRetry}), trustProvider, diagnostics: ui.diagnostics
        }, {zip: JSZip, archiveOptions: extensionProjectArchiveOptions, resourceDependencies});
        const runtimeBundle = bundledRuntime;
        const trustedDigests = await plusTrustedExtensions.listDigests(compiled.manifest);
        const packager = new Packager();
        packager.options.app.windowTitle = title;
        const result = await packagePlusHTML(packager, compiled,
            {runtimeBundle, scaffoldingAssets: bundledAssets, trustedDigests});
        if (currentURL) URL.revokeObjectURL(currentURL);
        currentURL = URL.createObjectURL(new Blob([result.data], {type: 'text/html'}));
        download.href = currentURL;
        download.download = `${title}.html`;
        download.hidden = false;
        status.textContent = trustedDigests.length === compiled.manifest.extensions.length ?
            'HTMLを生成しました。拡張はすべてカタログに載っているので、このHTMLを開いても許可の確認は出ません。' :
            'HTMLを生成しました。カタログにない拡張があるので、このHTMLを開くたびに、その拡張を許可するか確認します。';
    } catch (error) {
        status.textContent = `生成を拒否しました: ${error.code || ''} ${error.message}`;
        ui.diagnostics({type: 'error', code: error.code, message: error.message});
    } finally {
        trustProvider.revokeAll();
    }
}
