import {readFile, stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {chromium, expect} from '@playwright/test';
import {lock} from './prepare.mjs';

export {expect};
export async function environment(build, directory) {
    const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
        '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav', '.wasm': 'application/wasm'};
    const server = createServer(async (request, response) => {
        try {
            const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
                .replace(/^\/turbowarp-plus-editor\//, '');
            if (pathname === 'perf-overview.js') {response.writeHead(200, {'Content-Type':'text/javascript'});response.end(await readFile(path.join(directory,'overview.js')));return;}
            const filename = path.resolve(build, pathname);
            if (!filename.startsWith(path.resolve(build) + path.sep)) throw new Error('Invalid path');
            const body = await readFile(filename);
            response.writeHead(200, {'Content-Type': mime[path.extname(filename)] || 'application/octet-stream'});
            response.end(body);
        } catch { response.writeHead(404); response.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}/turbowarp-plus-editor/`;
    const args = ['--enable-experimental-web-platform-features', '--enable-unsafe-swiftshader'];
    if (process.platform === 'darwin') args.push('--single-process', '--no-zygote', '--disable-crash-reporter');
    let browser;
    try { browser = await chromium.launch({headless: true, args}); }
    catch (error) {server.close(); throw error;}
    return {base, browser, close: async () => {await browser.close(); await new Promise(r => server.close(r));},
        context: async () => {
            const context = await browser.newContext({viewport: {width: 1360, height: 900}, locale: 'en-US', serviceWorkers: 'block'});
            // Routing intentionally removes HTTP caching. "warm" means the same application session, not a warm HTTP cache.
            await context.route('**/*', async route => {
                const url = route.request().url();
                if (url.startsWith(base) || url.startsWith('blob:') || url.startsWith('data:')) return route.continue();
                const extension = lock.extensions.find(e => e.url === url);
                if (!extension) return route.abort();
                return route.fulfill({body: await readFile(path.join(directory, 'extensions', `${extension.id}.js`)),
                    contentType: 'application/javascript', headers: {'Access-Control-Allow-Origin': '*'}});
            });
            await context.addInitScript(() => {
                delete window.showOpenFilePicker;
                delete window.showSaveFilePicker;
                window.showDirectoryPicker = async () => window.__directory;
                for (const type of ['dragenter', 'dragover', 'drop']) window.addEventListener(type, async event => {
                    if (window.__directory) return;
                    event.preventDefault(); event.stopImmediatePropagation();
                    if (type === 'drop') window.__directory = await event.dataTransfer.items[0].getAsFileSystemHandle();
                }, {capture: true});
                window.__paint = async (activate, complete) => {
                    const start = performance.now();
                    activate();
                    while (!complete()) {
                        if (performance.now() - start > 30000) throw Error('Measurement completion timeout: '+JSON.stringify({status:document.querySelector('[data-project-folder-status]')?.textContent,dialogs:[...document.querySelectorAll('[role=dialog]')].map(e=>e.textContent.slice(0,500)),layout:document.querySelector('.tw-script-view-surface')?.getAttribute('aria-label'),scripts:document.querySelectorAll('.tw-script-view-surface [data-script-view-block]').length,rows:document.querySelectorAll('.tw-sprite-variables__references a').length,history:document.querySelectorAll('.twgit-history-view [data-oid]').length}));
                        await new Promise(requestAnimationFrame);
                    }
                    await new Promise(requestAnimationFrame);
                    await new Promise(requestAnimationFrame);
                    return performance.now() - start;
                };
                window.__tab = name => {
                    const toolbar = document.querySelector('.tw-plus-sprite-toolbar[data-active-group="true"]');
                    const tab = [...toolbar.querySelectorAll('[role="tab"]')].find(e => e.getAttribute('aria-label') === name);
                    if (!tab) throw Error(`Missing tab ${name}`);
                    tab.click();
                };
                window.__digests = [];
                const digest = crypto.subtle.digest.bind(crypto.subtle);
                crypto.subtle.digest = async function(algorithm, bytes) {
                    const start = performance.now();
                    const result = await digest(algorithm, bytes);
                    const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
                    if (name.toUpperCase() === 'SHA-256') window.__digests.push({start, end:performance.now(), bytes:bytes.byteLength,
                        sha256:[...new Uint8Array(result)].map(b=>b.toString(16).padStart(2,'0')).join('')});
                    return result;
                };
                const read = File.prototype.arrayBuffer;
                File.prototype.arrayBuffer = function (...args) {
                    if (this.name === 'kamishibai-3.2.sb3') window.__loadStart ??= performance.now();
                    return Reflect.apply(read, this, args);
                };
            });
            context.setDefaultTimeout(30000);
            return context;
        }};
}

export async function ready(page) {
    await page.waitForFunction(() => {
        const workspace=globalThis.ScratchBlocks?.getMainWorkspace();
        const target=globalThis.vm?.editingTarget;
        const scripts=target?.blocks.getScripts();
        return globalThis.vm?.runtime.targets.length===8 && scripts?.length>0 &&
            workspace?.getTopBlocks(false).length===scripts.length && scripts.every(id=>workspace.getBlockById(id));
    });
    await page.evaluate(async () => {await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
        window.__readyEvidence={target:vm.editingTarget.getName(),vmScripts:vm.editingTarget.blocks.getScripts().length,workspaceScripts:ScratchBlocks.getMainWorkspace().getTopBlocks(false).length};});
}
export async function approval(page) {
    const allow = page.getByRole('button', {name: 'Enable all and run', exact: true});
    await Promise.race([allow.waitFor(), page.waitForFunction(() => globalThis.vm?.runtime.targets.length === 8)]);
    if (await allow.isVisible()) await allow.click();
    await ready(page);
}
export async function shell(context, base) {
    const page = await context.newPage();
    await page.goto(base + 'editor.html?lang=en');
    await page.waitForFunction(() => globalThis.vm?.editingTarget && globalThis.ScratchBlocks?.getMainWorkspace());
    return page;
}
export async function openFile(original, input) {
    const context = original.context();
    await original.getByText('File', {exact: true}).click();
    const chooser = original.waitForEvent('filechooser');
    const popup = context.waitForEvent('page');
    await original.getByRole('button', {name: 'Open SB3 File…', exact: true}).click();
    await (await chooser).setFiles(input);
    const page = await popup;
    await approval(page);
    const ms = await page.evaluate(() => {
        if (!Number.isFinite(window.__loadStart)) throw Error('Missing file read start');
        return performance.now() - window.__loadStart;
    });
    return {page, ms, readyEvidence:await page.evaluate(()=>window.__readyEvidence)};
}
export async function openFolder(original, folder) {
    const context = original.context();
    await original.getByText('File', {exact: true}).click();
    const popup = context.waitForEvent('page');
    await original.getByRole('button', {name: 'Open Folder…', exact: true}).click();
    const page = await popup;
    const choose = page.getByRole('button', {name: 'Choose a folder', exact: true});
    await choose.waitFor();
    const cdp = await context.newCDPSession(page);
    for (const type of ['dragEnter', 'dragOver', 'drop']) await cdp.send('Input.dispatchDragEvent',
        {type, x: 100, y: 100, data: {items: [], files: [folder], dragOperationsMask: 1}});
    await cdp.detach();
    await page.waitForFunction(() => window.__directory?.kind === 'directory');
    await page.evaluate(() => document.addEventListener('pointerdown', () => {window.__loadStart=performance.now();}, {once:true,capture:true}));
    await choose.click();
    await approval(page);
    const ms = await page.evaluate(() => performance.now() - window.__loadStart);
    await expect(page.locator('[data-project-folder-status]')).toHaveText('Project folder opened.');
    return {page, ms, readyEvidence:await page.evaluate(()=>window.__readyEvidence)};
}
