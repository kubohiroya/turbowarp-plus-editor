import assert from 'node:assert/strict';
import {spawn, execFile} from 'node:child_process';
import {once} from 'node:events';
import {access, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, sep} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {promisify} from 'node:util';
import {chromium} from 'playwright';
import {layoutMenu, readUndockButtonsChecked, toggleUndockButtons} from '../fixtures/layout-menu.ts';

const origin = 'http://localhost:15103';
const prefix = process.env.TW151_STAGE3_PREFIX || '/';
const transferMime = 'application/x-turbowarp-editor-transfer';
const lifecycleOnly = process.env.TW_PLUS_NATIVE_INPUT !== '1' || process.env.TW151_STAGE3_LIFECYCLE_ONLY === '1';
const build = resolve(process.env.TW151_STAGE3_BUILD || '/private/tmp/tw151-product23/build');
const profile = await mkdtemp(join(tmpdir(), 'tw151-backpack-'));
const chrome = spawn(process.env.TW151_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--no-first-run', '--disable-popup-blocking',
    '--use-mock-keychain', '--password-store=basic', '--enable-unsafe-swiftshader',
    ...(lifecycleOnly ? ['--headless=new'] : []), 'about:blank'
], {stdio: ['ignore', 'ignore', 'pipe']});
const stopped = once(chrome, 'close');
let stderr = '';
chrome.stderr.on('data', chunk => {stderr = (stderr + chunk).slice(-12000);});
const report: {
    checks: string[];
    errors: string[];
    browser?: string;
    drag?: number[];
    failure?: string;
    stderr?: string;
    parent?: unknown;
    popup?: unknown;
} = {checks: [], errors: []};
let browser;
let page;
let popup;
async function wait(get, label) {
    for (let i = 0; i < 120; i++) {
        const value = await get();
        if (value) return value;
        await sleep(100);
    }
    throw new Error(`Timed out: ${label}`);
}

async function setBounds(context, page, left, top, width, height) {
    const target = await context.newCDPSession(page);
    const {targetInfo} = await target.send('Target.getTargetInfo');
    const session = await browser.newBrowserCDPSession();
    const {windowId} = await session.send('Browser.getWindowForTarget', {targetId: targetInfo.targetId});
    await session.send('Browser.setWindowBounds', {windowId, bounds: {left, top, width, height}});
    await session.detach();
    await target.detach();
}

async function coords(page, locator, x = 0.5) {
    const box = await locator.boundingBox();
    const screen = await page.evaluate(() => ({
        x: screenX + (outerWidth - innerWidth) / 2,
        y: screenY + outerHeight - innerHeight
    }));
    return [screen.x + box.x + box.width * x, screen.y + box.y + box.height / 2];
}

try {
    const endpoint = await wait(() => stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1], 'Chrome');
    browser = await chromium.connectOverCDP(endpoint, {noDefaults: true});
    report.browser = browser.version();
    const context = browser.contexts()[0];
    context.setDefaultTimeout(10000);
    await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin || !url.pathname.startsWith(prefix)) return route.abort();
        const file = resolve(build, decodeURIComponent(url.pathname.slice(prefix.length)));
        if (!file.startsWith(build + sep)) return route.abort();
        try {
            await access(file);
        } catch {
            return route.fulfill({status: 404});
        }
        return route.fulfill({path: file});
    });
    page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    async function start(flag) {
        await page.goto(`${origin}${prefix}editor.html?lang=en&twPlusStandardLayout=0${flag}`);
        await page.waitForFunction(() => window.vm?.editingTarget?.isOriginal &&
            window.ScratchBlocks?.getMainWorkspace());
    }
    const undock = page.getByRole('button', {name: 'Open Backpack in a browser window'});
    const layoutFlag = '&twPlusWindowLayout=1';
    const backpackFlag = '&twPlusBackpackPopout=1';
    const header = target => target.locator('[class*="backpack_backpack-header"]');
    await start(backpackFlag);
    assert.equal(await layoutMenu(page).count(), 0);
    assert.equal(await undock.count(), 0);
    await header(page).waitFor();

    for (const backpackValue of ['', '&twPlusBackpackPopout=0', '&twPlusBackpackPopout=', '&twPlusBackpackPopout=true']) {
        await start(layoutFlag + backpackValue);
        await toggleUndockButtons(page);
        assert.equal(await readUndockButtonsChecked(page), true);
        assert.equal(await undock.count(), 0);
        await header(page).waitFor();
    }
    report.checks.push('Default, disabled and invalid flags retain the real Backpack and independent splitter');

    await start(layoutFlag + backpackFlag);
    assert.equal(await readUndockButtonsChecked(page), false);
    assert.equal(await undock.count(), 0);
    await page.evaluate(() => history.replaceState(null, '', '?lang=en&twPlusWindowLayout=0&twPlusBackpackPopout=0'));
    await toggleUndockButtons(page);
    await undock.waitFor();
    report.checks.push('Startup flags stay fixed and the Backpack control follows the undock button toggle');
    const {a, b} = await page.evaluate(async () => {
        const vm = window.vm;
        const target = vm.editingTarget;
        await vm.duplicateSprite(target.id);
        const other = vm.runtime.targets.find(sprite => sprite.isOriginal && !sprite.isStage && sprite !== target);
        vm.setEditingTarget(target.id);
        const block = (id, opcode, parent, next) => ({id, opcode, parent, next, topLevel: parent === null,
            shadow: false, fields: {}, inputs: {}, x: 30, y: 30});
        const stack = [block('stage3-hide', 'looks_hide', null, 'stage3-show'),
            block('stage3-show', 'looks_show', 'stage3-hide', null)];
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('TW_Backpack', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('backpack',
                {keyPath: 'id', autoIncrement: true});
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        await new Promise((resolve, reject) => {
            const transaction = database.transaction('backpack', 'readwrite');
            transaction.objectStore('backpack').add({
                type: 'script', mime: 'application/json', name: 'Stage 3 stored script',
                bodyData: new TextEncoder().encode(JSON.stringify(vm.exportStandaloneBlocks(stack))).buffer,
                thumbnailData: Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
                    char => char.charCodeAt(0)).buffer
            });
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
        });
        database.close();
        return {a: target.id, b: other.id};
    });
    await header(page).click();
    await page.getByText('Stage 3 stored script', {exact: true}).waitFor();
    await page.evaluate(() => {
        const open = window.open;
        window.open = () => {
            window.open = open;
            return null;
        };
    });
    await undock.click();
    await page.getByRole('status').filter({hasText: 'Could not open Backpack window'}).waitFor();
    await page.getByText('Stage 3 stored script', {exact: true}).waitFor();
    async function openBackpack() {
        // Returning from the layout menu leaves focus outside the Backpack panel.
        await undock.focus();
        const [child] = await Promise.all([page.waitForEvent('popup'), undock.click()]);
        child.on('pageerror', error => report.errors.push(error.message));
        await child.getByText('Stage 3 stored script', {exact: true}).waitFor();
        assert.equal(await header(page).count(), 0);
        return child;
    }
    popup = await openBackpack();
    report.checks.push('Stored item remains on popup refusal and the expanded real Backpack moves to its child');

    // Lifecycle coverage uses DOM events. Native delivery is verified separately below.
    const reference = await popup.getByTestId('backpack-script-drag').evaluate((button, mime) => {
        const dataTransfer = new DataTransfer();
        button.dispatchEvent(new DragEvent('dragstart', {dataTransfer, bubbles: true}));
        return dataTransfer.getData(mime);
    }, transferMime);
    assert.ok(reference);
    await page.evaluate(({mime, reference}) => {
        const originalFetch = window.fetch;
        window.fetch = async (url, options) => {
            if (typeof url === 'string' && url.startsWith('data:application/json;base64,')) {
                options.signal.addEventListener('abort', () => {window.stage3Cancelled = true;}, {once: true});
                await new Promise<void>(resolve => {window.stage3FinishCancelledRead = resolve;});
                window.fetch = originalFetch;
            }
            return originalFetch(url, options);
        };
        const dataTransfer = new DataTransfer();
        dataTransfer.setData(mime, reference);
        window.ScratchBlocks.getMainWorkspace().getParentSvg().dispatchEvent(new DragEvent('drop', {
            dataTransfer, bubbles: true, cancelable: true
        }));
    }, {mime: transferMime, reference});
    await page.waitForFunction(() => typeof window.stage3FinishCancelledRead === 'function');
    await toggleUndockButtons(page);
    assert.ok(!popup.isClosed());
    assert.equal(await page.evaluate(() => Boolean(window.stage3Cancelled)), false);
    await Promise.all([popup.waitForEvent('close'), popup.getByRole('button', {name: 'Dock Backpack'}).click()]);
    await page.waitForFunction(() => window.stage3Cancelled);
    await page.evaluate(() => window.stage3FinishCancelledRead());
    assert.equal(await page.evaluate(id => window.vm.runtime.getTargetById(id).blocks.getScripts().length, a), 0);
    assert.equal(await readUndockButtonsChecked(page), false);
    assert.equal(await undock.count(), 0);
    await page.getByText('Stage 3 stored script', {exact: true}).waitFor();
    await toggleUndockButtons(page);
    popup = await openBackpack();
    const reloaded = popup.waitForEvent('close');
    await popup.reload({waitUntil: 'commit'}).catch(() => {});
    await reloaded;
    await page.getByText('Stage 3 stored script', {exact: true}).waitFor();
    popup = await openBackpack();
    report.checks.push('Hiding the undock controls keeps the popup alive; docking cancels a pending read and reload restores the Backpack');

    if (!lifecycleOnly) {
        const area = await page.evaluate(() => [screen.availLeft, screen.availTop, screen.availWidth, screen.availHeight]);
        await setBounds(context, page, area[0] + 25, area[1] + 45, Math.round(area[2] * 0.65), Math.round(area[3] * 0.8));
        await setBounds(context, popup, area[0] + Math.round(area[2] * 0.69), area[1] + 55,
            Math.round(area[2] * 0.27), 300);
        await page.evaluate(() => {
            const fetch = window.fetch;
            window.fetch = async (url, options) => {
                if (typeof url === 'string' && url.startsWith('data:application/json;base64,')) {
                    window.stage3Reading = true;
                    await new Promise<void>(resolve => {window.stage3Release = resolve;});
                }
                return fetch(url, options);
            };
            document.addEventListener('drop', event => {
                window.stage3Drop = {trusted: event.isTrusted, mime: Array.from(event.dataTransfer.types)};
            }, {capture: true, once: true});
        });
        await popup.bringToFront();
        await wait(() => popup.evaluate(() => document.hasFocus()), 'Backpack focus');
        const source = popup.getByTestId('backpack-script-drag');
        const destination = page.locator('.blocklySvg').first();
        const points = [...await coords(popup, source), ...await coords(page, destination, 0.76)];
        report.drag = points;
        await promisify(execFile)('python3', [join(import.meta.dirname, '../stage2/native-mouse.py'), ...points.map(String)]);
        await page.waitForFunction(() => window.stage3Reading, null, {polling: 50});
        const drop = await page.evaluate(() => window.stage3Drop);
        assert.equal(drop.trusted, true);
        assert.ok(drop.mime.includes(transferMime));
        await page.evaluate(other => {
            window.vm.setEditingTarget(other);
            window.stage3Release();
        }, b);
        await page.waitForFunction(id => window.vm.runtime.getTargetById(id).blocks.getScripts().length === 1, a,
            {polling: 50});
        const targets = await page.evaluate(({a, b}) => [a, b].map(id => {
            const blocks = window.vm.runtime.getTargetById(id).blocks;
            return blocks.getScripts().map(rootId => {
                const block = blocks.getBlock(rootId);
                return [block.opcode, blocks.getBlock(block.next)?.opcode];
            });
        }), {a, b});
        assert.deepEqual(targets, [[['looks_hide', 'looks_show']], []]);
        assert.equal(await page.evaluate(() => window.vm.editingTarget.id), b);
        await page.evaluate(id => window.vm.setEditingTarget(id), a);
        await page.waitForFunction(() => window.ScratchBlocks.getMainWorkspace().getTopBlocks()
            .some(block => block.type === 'looks_hide' && block.getNextBlock()?.type === 'looks_show'), null, {polling: 50});
        await popup.getByText('Stage 3 stored script', {exact: true}).waitFor();
        report.checks.push('Native drag copies the stored stack once; delayed read preserves the drop-time sprite');
    }

    await Promise.all([popup.waitForEvent('close'),
        popup.getByRole('button', {name: 'Dock Backpack'}).click()]);
    await page.getByText('Stage 3 stored script', {exact: true}).waitFor();
    popup = await openBackpack();
    await popup.close({runBeforeUnload: true});
    await undock.waitFor();
    await page.getByText('Stage 3 stored script', {exact: true}).waitFor();
    report.checks.push('Dock button and browser close preserve the expanded Backpack');
    if (!lifecycleOnly) {
        assert.equal(await page.evaluate(id => window.vm.runtime.getTargetById(id).blocks.getScripts().length, a), 1);
        const sb3 = await page.evaluate(async () => {
            const vm = window.vm;
            const archive = await vm.saveProjectSb3();
            const bytes = await archive.arrayBuffer();
            await vm.loadProject(bytes);
            return vm.runtime.targets.filter(target => target.isOriginal && !target.isStage)
                .map(target => target.blocks.getScripts().length).sort();
        });
        assert.deepEqual(sb3, [0, 1]);
        report.checks.push('SB3 save and reload retain the copied script');
    }
    assert.deepEqual(report.errors, []);
} catch (error) {
    report.failure = String(error);
    report.stderr = stderr;
    report.parent = await page?.evaluate(() => ({url: location.href, reading: window.stage3Reading,
        drop: window.stage3Drop, text: document.body.innerText.slice(-700)})).catch(() => null);
    report.popup = await popup?.evaluate(() => ({url: location.href, focus: document.hasFocus(),
        text: document.body.innerText.slice(-400)})).catch(() => null);
    console.error(error.stack);
    process.exitCode = 1;
} finally {
    console.log(JSON.stringify(report, null, 2));
    if (chrome.exitCode === null && chrome.signalCode === null) {
        chrome.kill();
        if (!await Promise.race([stopped.then(() => true), sleep(4000, false, {ref: false})])) chrome.kill('SIGKILL');
    }
    await stopped;
    if (browser) await browser.close();
    await rm(profile, {recursive: true, force: true});
}
