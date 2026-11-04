import assert from 'node:assert/strict';
import {stat} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {chromium} from 'playwright';

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
    await page.goto(origin + '/editor.html?lang=en&twPlusWindowLayout=1' + flags);
    await page.waitForFunction(() => window.vm?.editingTarget?.isOriginal && window.ScratchBlocks?.getMainWorkspace());
    await page.getByRole('button', {name: 'Flexible layout mode'}).click();
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
    await start(inAppOnly + '&twPlusBackpackPopout=1');
    await seed();
    await page.locator('[class*="backpack_backpack-header"]').click();
    await page.getByText(itemName, {exact: true}).waitFor();
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
    const [popup] = await Promise.all([page.waitForEvent('popup'), openExternal.click()]);
    await popup.getByText(itemName, {exact: true}).waitFor();
    assert.equal(await frame.count(), 0);
    await Promise.all([popup.waitForEvent('close'), popup.getByRole('button', {name: 'Move into the editor'}).click()]);
    await frame.getByText(itemName, {exact: true}).waitFor();
    await frame.getByRole('button', {name: 'Close and dock'}).click();
    await page.getByText(itemName, {exact: true}).waitFor();
    assert.equal(await frame.count(), 0);
    assert.ok(await launch.evaluate(button => button === document.activeElement));
    await launch.click();
    await frame.getByText(itemName, {exact: true}).waitFor();
    await page.getByRole('button', {name: 'Flexible layout mode'}).click();
    await page.getByText(itemName, {exact: true}).waitFor();
    assert.equal(await frame.count(), 0);
    assert.equal(await launch.count(), 0);

    await start(inAppOnly);
    await page.locator('[class*="backpack_backpack-header"]').click();
    await launch.click();
    await frame.getByText(itemName, {exact: true}).waitFor();
    assert.equal(await frame.getByRole('button', {name: 'Move to browser window'}).count(), 0);
    assert.equal(context.pages().length, 1);
    await page.getByRole('button', {name: 'Return here'}).click();
    await page.getByText(itemName, {exact: true}).waitFor();
    assert.equal(await frame.count(), 0);
    assert.deepEqual(errors, []);
    console.log('Popup refusal, round trip, docking, mode exit and in-app-only operation preserve the item.');
} finally {
    await browser.close();
}
