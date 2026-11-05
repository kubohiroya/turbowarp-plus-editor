// @ts-nocheck -- Migrated test fixture with dynamic host mocks.
import assert from 'node:assert/strict';
import {stat} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {chromium} from 'playwright';
import {toggleUndockButtons} from '../fixtures/layout-menu.ts';

const origin = 'http://localhost:15104';
const build = resolve(process.env.TW151_STAGE4_BUILD || '/private/tmp/tw151-stage4-build');
const itemName = 'Stage 4 stored script';
const browser = await chromium.launch({executablePath: process.env.TW151_CHROME, args: ['--enable-unsafe-swiftshader']});
const context = await browser.newContext({viewport: {width: 1400, height: 900}});
context.setDefaultTimeout(10000);
const errors = [];
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
const page = await context.newPage();

async function start(flags) {
    await page.goto(origin + '/editor.html?lang=en&twPlusStandardLayout=0&twPlusWindowLayout=1' + flags);
    await page.waitForFunction(() => window.vm?.editingTarget?.isOriginal && window.ScratchBlocks?.getMainWorkspace());
    await toggleUndockButtons(page);
}

async function seed() {
    await page.evaluate(async name => {
        const vm = window.vm;
        const stack = vm.exportStandaloneBlocks([{
            id: 'stage4-show', opcode: 'looks_show', parent: null, next: null, topLevel: true,
            shadow: false, fields: {}, inputs: {}, x: 30, y: 30
        }]);
        const db = await new Promise((resolve, reject) => {
            const open = indexedDB.open('TW_Backpack', 1);
            open.onupgradeneeded = () => open.result.createObjectStore('backpack', {keyPath: 'id', autoIncrement: true});
            open.onsuccess = () => resolve(open.result);
            open.onerror = () => reject(open.error);
        });
        await new Promise((resolve, reject) => {
            const tx = db.transaction('backpack', 'readwrite');
            tx.objectStore('backpack').add({name, type: 'script', mime: 'application/json',
                bodyData: new TextEncoder().encode(JSON.stringify(stack)).buffer,
                thumbnailData: Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
                    character => character.charCodeAt(0)).buffer});
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    }, itemName);
}

try {
    await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        const file = resolve(build, '.' + decodeURIComponent(url.pathname));
        if (url.origin !== origin || !file.startsWith(build + sep)) return route.abort();
        if (!(await stat(file).catch(() => null))?.isFile()) return route.fulfill({status: 404});
        return route.fulfill({path: file});
    });
    const launch = page.getByRole('button', {name: 'Undock Backpack', exact: true});
    const frame = page.getByRole('region', {name: 'Backpack', exact: true});
    const workspace = page.locator('.blocklySvg').first();
    const inAppOnly = '&twPlusInternalWindows=1';
    await start('');
    assert.equal(await launch.count(), 0);
    const fullScreen = page.getByRole('button', {name: 'Full-screen editor', exact: true});
    assert.equal(await fullScreen.count(), 0);
    await start(inAppOnly + '&twPlusBackpackPopout=1');
    await seed();
    const header = page.locator('[class*="backpack_backpack-header_"]');
    await header.click();
    await page.getByText(itemName, {exact: true}).waitFor();
    await toggleUndockButtons(page);
    const beforeLaunch = await header.boundingBox();
    await toggleUndockButtons(page);
    await launch.focus();
    const [heading, icon] = await Promise.all([header.boundingBox(), launch.boundingBox()]);
    assert.equal(heading.y, beforeLaunch.y);
    assert.ok(icon.y >= heading.y && icon.y + icon.height <= heading.y + heading.height + 1);
    assert.ok(heading.x + heading.width - icon.x - icon.width <= 8);
    await launch.click();
    await frame.getByText(itemName, {exact: true}).waitFor();
    assert.equal(context.pages().length, 1);
    assert.equal(await page.getByText(itemName, {exact: true}).count(), 1);

    const title = frame.locator('[aria-label="Move window"]');
    const before = await frame.boundingBox();
    const handle = await title.boundingBox();
    await page.mouse.move(handle.x + 40, handle.y + 12);
    await page.mouse.down();
    await page.mouse.move(handle.x + 124, handle.y + 52, {steps: 5});
    await page.mouse.up();
    const moved = await frame.boundingBox();
    assert.ok(moved.x > before.x && moved.y > before.y);
    await title.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal((await frame.boundingBox()).x, moved.x + 10);
    const grip = frame.getByRole('separator', {name: 'Resize window'});
    await grip.focus();
    const oldWidth = (await frame.boundingBox()).width;
    await page.keyboard.press('Shift+ArrowRight');
    assert.equal((await frame.boundingBox()).width, oldWidth + 40);
    const beforeMax = await frame.boundingBox();
    await frame.getByRole('button', {name: 'Maximize', exact: true}).click();
    const desktop = await page.locator('.tw-window-desktop').boundingBox();
    const maximized = await frame.boundingBox();
    assert.deepEqual(maximized, desktop);
    assert.ok(maximized.y > 0);
    await frame.getByRole('button', {name: 'Restore size'}).click();
    assert.deepEqual(await frame.boundingBox(), beforeMax);
    await frame.getByRole('button', {name: 'Minimize'}).click();
    await frame.waitFor({state: 'hidden'});
    const windows = page.getByRole('button', {name: 'Windows', exact: true});
    await windows.click();
    await page.getByRole('button', {name: 'Backpack', exact: true}).click();
    await frame.waitFor();
    await page.waitForFunction(() => document.activeElement?.classList.contains('tw-desktop-window'));
    assert.deepEqual(await frame.boundingBox(), beforeMax);
    console.log('In-app default, pointer movement, keyboard move and resize, maximize, restore, minimize and list passed.');

    const drop = await workspace.boundingBox();
    await page.evaluate(() => {
        window.stage4Drops = [];
        document.addEventListener('drop', event => window.stage4Drops.push({trusted: event.isTrusted,
            mime: Array.from(event.dataTransfer.types)}), true);
    });
    await frame.getByTestId('backpack-script-drag').dragTo(workspace, {targetPosition: {
        x: Math.round(drop.width * 0.77), y: Math.round(drop.height * 0.75)
    }});
    await page.waitForFunction(() => window.vm.editingTarget.blocks.getScripts().length === 1);
    const [event] = await page.evaluate(() => window.stage4Drops);
    assert.equal(event.trusted, true);
    assert.ok(event.mime.includes('application/x-turbowarp-editor-transfer'));
    assert.equal(await frame.getByText(itemName, {exact: true}).count(), 1);
    console.log('Trusted in-app Backpack drag copied the stored script once into the real code workspace.');

    const openExternal = frame.getByRole('button', {name: 'Move to browser window'});
    await page.evaluate(() => {
        const open = window.open;
        window.open = () => {window.open = open; return null;};
    });
    await openExternal.click();
    await frame.getByText(itemName, {exact: true}).waitFor();
    assert.equal(context.pages().length, 1);
    assert.deepEqual(await frame.boundingBox(), beforeMax);
    for (let cycle = 0; cycle < 2; cycle++) {
        const [popup] = await Promise.all([page.waitForEvent('popup'), openExternal.click()]);
        await popup.getByText(itemName, {exact: true}).waitFor();
        assert.equal(await frame.count(), 0);
        await Promise.all([popup.waitForEvent('close'), popup.getByRole('button', {name: 'Move into the editor'}).click()]);
        await frame.getByText(itemName, {exact: true}).waitFor();
        assert.equal(await page.getByText(itemName, {exact: true}).count(), 1);
        assert.equal(context.pages().length, 1);
        assert.deepEqual(await frame.boundingBox(), beforeMax);
    }
    await frame.getByRole('button', {name: 'Close and dock'}).click();
    await page.getByText(itemName, {exact: true}).waitFor();
    assert.equal(await frame.count(), 0);
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Undock Backpack');
    await launch.click();
    await frame.getByText(itemName, {exact: true}).waitFor();
    await toggleUndockButtons(page);
    await frame.getByText(itemName, {exact: true}).waitFor();
    assert.equal(await launch.count(), 0);
    await page.getByRole('button', {name: 'Windows', exact: true}).waitFor();
    await frame.getByRole('button', {name: 'Close and dock'}).click();
    await page.getByText(itemName, {exact: true}).waitFor();
    assert.equal(await launch.count(), 0);

    await start(inAppOnly);
    await page.locator('[class*="backpack_backpack-header"]').click();
    await launch.click();
    await frame.getByText(itemName, {exact: true}).waitFor();
    assert.equal(await frame.getByRole('button', {name: 'Move to browser window'}).count(), 0);
    assert.equal(context.pages().length, 1);

    const menu = page.locator('[class*="menu-bar_menu-bar_"]').first();
    const openCode = page.getByRole('button', {name: 'Open in another window', exact: true});
    const code = page.getByRole('region', {name: 'Code', exact: true});
    const windowsList = page.getByRole('button', {name: 'Windows', exact: true});
    const actionOpacity = () => openCode.evaluate(node => getComputedStyle(node.parentElement).opacity);
    await windowsList.focus();
    assert.equal(await actionOpacity(), '0');
    const workspacePoint = await workspace.evaluate(svg => {
        const {left, top, width, height} = svg.getBoundingClientRect();
        for (const y of [0.8, 0.6, 0.3]) {
            for (const x of [0.8, 0.6, 0.4]) {
                const point = {x: left + x * width, y: top + y * height};
                if (svg.contains(document.elementFromPoint(point.x, point.y))) return point;
            }
        }
        return null;
    });
    assert.ok(workspacePoint);
    await page.mouse.click(workspacePoint.x, workspacePoint.y);
    assert.equal(await actionOpacity(), '1');
    assert.equal(await openCode.getAttribute('title'), 'Open in another window');
    assert.equal(await openCode.locator('span').isVisible(), false);
    const [actionBounds, tabBounds] = await Promise.all([
        openCode.boundingBox(), page.getByRole('tablist').boundingBox()
    ]);
    assert.ok(actionBounds.x >= tabBounds.x + tabBounds.width);
    await openCode.click();
    await code.locator('.blocklySvg').first().waitFor();
    const getOrder = window => window.evaluate(node => Number(node.style.zIndex));
    assert.ok(await getOrder(code) > await getOrder(frame));
    await windowsList.click();
    await page.getByRole('button', {name: 'Backpack', exact: true}).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Backpack');
    assert.ok(await getOrder(frame) > await getOrder(code));

    const placement = await frame.boundingBox();
    await fullScreen.click();
    await page.waitForFunction(() => document.fullscreenElement === document.documentElement);
    await fullScreen.and(page.locator('[aria-pressed="true"]')).waitFor();
    await menu.waitFor();
    await frame.getByText(itemName, {exact: true}).waitFor();
    await code.locator('.blocklySvg').first().waitFor();
    await fullScreen.click();
    await page.waitForFunction(() => !document.fullscreenElement);
    assert.deepEqual(await frame.boundingBox(), placement);
    await page.evaluate(() => {
        const request = document.documentElement.requestFullscreen;
        document.documentElement.requestFullscreen = function () {
            this.requestFullscreen = request;
            return Promise.reject(new DOMException('Denied', 'NotAllowedError'));
        };
    });
    await fullScreen.click();
    await page.getByText('Could not change full-screen mode', {exact: true}).waitFor();
    assert.equal(await fullScreen.getAttribute('aria-pressed'), 'false');
    assert.deepEqual(await frame.boundingBox(), placement);
    await windowsList.click();
    await page.getByRole('button', {name: 'Code', exact: true}).click();
    await code.getByRole('button', {name: 'Minimize', exact: true}).click();
    await code.waitFor({state: 'hidden'});

    await frame.locator('[aria-label="Move window"]').focus();
    for (let step = 0; step < 18; step++) await page.keyboard.press('Shift+ArrowRight');
    const far = await frame.boundingBox();
    await page.setViewportSize({width: 1080, height: 710});
    await page.waitForFunction(() => {
        const rect = document.querySelector('.tw-desktop-window').getBoundingClientRect();
        return rect.right <= innerWidth;
    });
    const clamped = await frame.boundingBox();
    assert.ok(clamped.x < far.x);
    await windowsList.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', {name: 'Bring windows into view'}).click();
    await page.setViewportSize({width: 1400, height: 900});
    assert.equal((await frame.boundingBox()).x, clamped.x);
    assert.equal(await code.isVisible(), false);
    await frame.getByText(itemName, {exact: true}).waitFor();
    await windowsList.click();
    await page.getByRole('button', {name: 'Code', exact: true}).click();
    await code.getByRole('button', {name: 'Close and dock'}).click();

    await page.getByRole('button', {name: 'Return here'}).click();
    await page.getByText(itemName, {exact: true}).waitFor();
    assert.equal(await frame.count(), 0);
    assert.deepEqual(errors, []);
    console.log('Round trips, stacking, fullscreen, denial and window recovery preserve the open editors.');
} finally {
    await browser.close();
}
