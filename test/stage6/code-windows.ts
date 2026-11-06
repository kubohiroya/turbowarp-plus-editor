import assert from 'node:assert/strict';
import {stat} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {chromium} from 'playwright';
import {readUndockButtonsChecked, toggleUndockButtons} from '../fixtures/layout-menu.ts';

const origin = 'http://localhost:15107';
const prefix = '/turbowarp-plus-editor/';
const build = resolve(process.argv[2]);
const chrome = process.env.TW151_CHROME;
const browser = await chromium.launch({
    executablePath: chrome, headless: true, args: ['--enable-unsafe-swiftshader']
});
const context = await browser.newContext({viewport: {width: 1500, height: 940}});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.stack ?? error.message));
page.setDefaultTimeout(12000);
const flags = '&twPlusWindowLayout=1&twPlusInternalWindows=1&twPlusTargetList=1';
// Both title bar layouts expose the code window title as its accessible name.
const windows = page.locator('.tw-desktop-window[aria-label^="Code · "]');
const tile = name => page.locator('[class*="sprite-selector_sprite-wrapper"]')
    .locator('[class*="sprite-selector-item_sprite-selector-item"]').filter({hasText: name});
const selected = () => page.locator('[class*="sprite-selector_sprite-wrapper"] [class*="sprite-selector-item_is-selected"] ' +
    '[class*="sprite-selector-item_sprite-name"]').allTextContents();

await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || !url.pathname.startsWith(prefix)) return route.abort();
    const file = resolve(build, decodeURIComponent(url.pathname.slice(prefix.length)));
    if (!file.startsWith(build + sep)) return route.abort();
    if (!(await stat(file).catch(() => null))?.isFile()) return route.fulfill({status: 404});
    return route.fulfill({path: file});
});

async function start(extra = '', language = 'en', standardLayout = false) {
    const layout = standardLayout ? '&twPlusDockview=0' : '&twPlusStandardLayout=0';
    await page.goto(origin + prefix + 'editor.html?lang=' + language + flags + layout + extra);
    await page.waitForFunction(() => window.vm?.editingTarget?.isOriginal && window.ScratchBlocks?.getMainWorkspace());
}

async function open(name, label = 'Open') {
    await tile(name).click({button: 'right'});
    const menu = page.locator('.react-contextmenu--visible');
    assert.equal(await menu.getByRole('menuitem').first().textContent(), label);
    await menu.getByRole('menuitem', {name: label, exact: true}).click();
}

const active = () => windows.filter({has: page.locator('.tw-dockable-panel--floating')});

async function front(name, count, index) {
    assert.equal(await windows.count(), count);
    const view = windows.nth(index);
    await view.locator('.tw-dockable-panel--floating .blocklySvg').first().waitFor();
    assert.equal(await active().count(), 1);
    assert.equal(await page.evaluate(() => window.vm.editingTarget.getName()), name);
    assert.deepEqual(await selected(), [name]);
    const z = await windows.evaluateAll(nodes => nodes.map(node => Number(getComputedStyle(node).zIndex)));
    assert.equal(z[index], Math.max(...z));
}

const waitBlocks = (id, count) => page.waitForFunction(({id, count}) =>
    window.vm.runtime.getTargetById(id).blocks.getScripts().length === count, {id, count});

async function seedBackpack() {
    await page.evaluate(async () => {
        const {vm} = window;
        const block = (id, opcode, parent, next) => ({
            id, opcode, parent, next, topLevel: parent === null, shadow: false, inputs: {}, fields: {}, x: 0, y: 0
        });
        const script = vm.exportStandaloneBlocks([
            block('drop-root', 'looks_show', null, 'drop-child'),
            block('drop-child', 'looks_hide', 'drop-root', null),
            {...block('drop-other-root', 'motion_movesteps', null, null),
                inputs: {STEPS: {name: 'STEPS', block: 'drop-shadow', shadow: 'drop-shadow'}}},
            {...block('drop-shadow', 'math_number', 'drop-other-root', null), shadow: true,
                fields: {NUM: {name: 'NUM', value: 15}}}
        ]);
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('TW_Backpack', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('backpack',
                {keyPath: 'id', autoIncrement: true});
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        await new Promise((resolve, reject) => {
            const tx = db.transaction('backpack', 'readwrite');
            tx.objectStore('backpack').add({
                name: 'Stage 6 stored script', type: 'script', mime: 'application/json',
                bodyData: new TextEncoder().encode(JSON.stringify(script)).buffer,
                thumbnailData: Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
                    character => character.charCodeAt(0)).buffer
            });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    });
}

async function moveWindow(frame, dx, dy) {
    const handle = await frame.locator('[aria-label="Move window"]').boundingBox();
    await page.mouse.move(handle.x + 55, handle.y + 12);
    await page.mouse.down();
    await page.mouse.move(handle.x + 55 + dx, handle.y + 12 + dy, {steps: 8});
    await page.mouse.up();
}

try {
    await start();
    const original = await page.evaluate(() => window.vm.editingTarget.getName());
    await tile(original).click({button: 'right'});
    const nativeMenu = page.locator('.react-contextmenu--visible');
    assert.equal(await nativeMenu.getByRole('menuitem', {name: 'Open', exact: true}).count(), 0);
    await page.keyboard.press('Escape');
    assert.equal(await windows.count(), 0);
    assert.deepEqual(await selected(), [original]);

    await start('&twPlusSpriteCodeWindows=1');
    const {a, b} = await page.evaluate(async () => {
        const {vm} = window;
        const a = vm.editingTarget;
        vm.renameSprite(a.id, 'CodeCat');
        await vm.duplicateSprite(a.id);
        const b = vm.editingTarget;
        vm.renameSprite(b.id, 'CodeDog');
        return {a: a.id, b: b.id};
    });
    assert.deepEqual(await selected(), []);
    await tile('CodeCat').click();
    await front('CodeCat', 1, 0);
    await tile('CodeCat').click();
    await front('CodeCat', 1, 0);
    await open('CodeCat');
    await front('CodeCat', 2, 1);
    await open('CodeDog');
    await front('CodeDog', 3, 2);
    await tile('CodeCat').click();
    await front('CodeCat', 3, 1);
    await windows.nth(0).locator('[aria-label="Move window"]').press('ArrowLeft');
    await front('CodeCat', 3, 0);
    await tile('CodeDog').click();
    await front('CodeDog', 3, 2);
    await tile('CodeCat').click();
    await front('CodeCat', 3, 0);
    await windows.nth(0).getByRole('button', {name: 'Minimize'}).click();
    await page.locator('.tw-desktop-window').first().waitFor({state: 'hidden'});
    assert.deepEqual(await selected(), ['CodeDog']);
    await tile('CodeCat').click();
    await front('CodeCat', 3, 0);
    console.log('Window creation, most-recent reuse, menu order, focus, minimize and selection passed.');

    await page.evaluate(() => {
        const {ScratchBlocks: blocks} = window;
        const workspace = blocks.getMainWorkspace();
        const xml = blocks.Xml.textToDom('<xml><block type="looks_show" id="stage6-test" x="20" y="30"/></xml>');
        blocks.Xml.domToWorkspace(xml, workspace);
    });
    await waitBlocks(a, 1);
    await waitBlocks(b, 0);
    await windows.nth(1).locator('.blocklySvg .blocklyBlockCanvas [data-id="stage6-test"]').waitFor();
    await tile('CodeDog').click();
    await front('CodeDog', 3, 2);
    await windows.nth(1).locator('[aria-label="Move window"]').press('ArrowLeft');
    await front('CodeCat', 3, 1);
    await page.evaluate(() => window.ScratchBlocks.getMainWorkspace().undo(false));
    await waitBlocks(a, 0);
    await waitBlocks(b, 0);
    await page.evaluate(() => window.ScratchBlocks.getMainWorkspace().undo(true));
    await waitBlocks(a, 1);
    await page.evaluate(async () => {window.stage6Snapshot = await window.vm.saveProjectSb3();});
    console.log('Real ScratchBlocks, isolated sprite writes, backing view refresh and shared native Undo/Redo passed.');

    await tile('CodeDog').click();
    await front('CodeDog', 3, 2);
    await moveWindow(windows.nth(2), 240, 20);
    await page.evaluate(() => {
        const {ScratchBlocks: blocks, vm} = window;
        blocks.Xml.domToWorkspace(blocks.Xml.textToDom(
            '<xml><block type="motion_turnright" id="dog-existing" x="20" y="30"/></xml>'),
        blocks.getMainWorkspace());
        const original = vm.shareBlocksToTargetWithReceipt;
        window.stage6Receipts = [];
        vm.shareBlocksToTargetWithReceipt = async function (...args) {
            const receipt = await original.apply(this, args);
            window.stage6Receipts.push(receipt);
            return receipt;
        };
    });
    await waitBlocks(b, 1);
    await tile('CodeCat').click();
    await front('CodeCat', 3, 1);
    await seedBackpack();
    await toggleUndockButtons(page);
    await page.locator('[class*="backpack_backpack-header"]').click();
    await page.getByText('Stage 6 stored script', {exact: true}).waitFor();
    await page.getByRole('button', {name: 'Undock Backpack', exact: true}).click();
    const backpack = page.getByRole('region', {name: 'Backpack', exact: true});
    const handle = backpack.getByTestId('backpack-script-drag');
    await handle.waitFor();
    await moveWindow(backpack, 710, 350);
    const destination = windows.nth(2).locator('[data-code-preview]');
    await destination.locator('.blocklySvg').waitFor();
    await page.evaluate(() => {
        window.stage6Drop = null;
        const listen = event => {
            if (!Array.from(event.dataTransfer.types).includes('application/x-turbowarp-editor-transfer')) return;
            window.stage6Drop = {trusted: event.isTrusted, editingTarget: window.vm.editingTarget.id};
            document.removeEventListener('drop', listen, true);
        };
        document.addEventListener('drop', listen, true);
    });
    await handle.dragTo(destination, {targetPosition: {x: 405, y: 95}});
    await waitBlocks(b, 3);
    await waitBlocks(a, 1);
    await front('CodeCat', 3, 1);
    const {drop, receipt, rootIds, allIds} = await page.evaluate(id => {
        const {blocks} = window.vm.runtime.getTargetById(id);
        return {drop: window.stage6Drop, receipt: window.stage6Receipts[0],
            rootIds: blocks.getScripts(), allIds: Object.keys(blocks._blocks)};
    }, b);
    assert.deepEqual(drop, {trusted: true, editingTarget: a});
    assert.deepEqual(rootIds, ['dog-existing', ...receipt.rootBlockIds]);
    assert.equal(receipt.blockIds.length, 4);
    assert.deepEqual(new Set(allIds), new Set(['dog-existing', ...receipt.blockIds]));
    await destination.locator(`[data-id="${receipt.rootBlockIds[0]}"]`).waitFor({state: 'attached'});
    await page.evaluate(() => {
        const {vm} = window;
        const original = vm._loadExtensions;
        vm._loadExtensions = function (...args) {
            vm._loadExtensions = original;
            return new Promise((resolve, reject) => {
                window.stage6ReleaseDrop = () => original.apply(vm, args).then(resolve, reject);
            });
        };
    });
    await handle.dragTo(destination, {targetPosition: {x: 405, y: 85}});
    await page.waitForFunction(() => Boolean(window.stage6ReleaseDrop));
    await windows.nth(2).getByRole('button', {name: 'Close code window'}).click();
    await page.evaluate(() => window.stage6ReleaseDrop());
    await page.waitForFunction(() => window.stage6Receipts.length === 2);
    assert.equal(await page.evaluate(() => window.stage6Receipts[1]), null);
    await waitBlocks(b, 3);
    await front('CodeCat', 2, 1);
    await windows.nth(0).locator('[aria-label="Move window"]').press('ArrowLeft');
    await moveWindow(windows.nth(0), 35, 255);
    await windows.nth(1).locator('[aria-label="Move window"]').press('ArrowRight');
    await front('CodeCat', 2, 1);
    await handle.dragTo(windows.nth(0).locator('[data-code-preview]'), {targetPosition: {x: 195, y: 115}});
    await waitBlocks(a, 3);
    await front('CodeCat', 2, 1);
    await page.evaluate(() => window.ScratchBlocks.getMainWorkspace().undo(false));
    await waitBlocks(a, 1);
    await waitBlocks(b, 3);
    await backpack.getByRole('button', {name: 'Close and dock', exact: true}).click();
    await open('CodeDog');
    await front('CodeDog', 3, 2);
    await windows.nth(2).locator('[aria-label="Move window"]').focus();
    await page.keyboard.press('ControlOrMeta+z');
    await waitBlocks(b, 1);
    assert.deepEqual(await page.evaluate(id => Object.keys(window.vm.runtime.getTargetById(id).blocks._blocks), b),
        ['dog-existing']);
    await waitBlocks(a, 1);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await waitBlocks(b, 3);
    assert.deepEqual(new Set(await page.evaluate(id =>
        Object.keys(window.vm.runtime.getTargetById(id).blocks._blocks), b)), new Set(allIds));
    await tile('CodeCat').click();
    await front('CodeCat', 3, 1);
    console.log('A trusted Backpack drop kept CodeCat active. Exact IDs, a closed destination, same-sprite views, grouped Undo, and Redo passed.');

    await page.getByRole('tab', {name: 'Costumes', exact: true}).click();
    await front('CodeCat', 3, 1);
    await tile('CodeDog').click();
    await front('CodeDog', 3, 2);
    await windows.nth(2).getByRole('button', {name: 'Close code window'}).click();
    await front('CodeCat', 2, 1);
    await page.evaluate(id => window.vm.deleteSprite(id), a);
    await windows.first().waitFor({state: 'detached'});
    assert.deepEqual(await selected(), []);

    await tile('CodeDog').click();
    await front('CodeDog', 1, 0);
    await page.evaluate(async () => {
        const {vm} = window;
        await vm.loadProject(await window.stage6Snapshot.arrayBuffer());
    });
    await windows.first().waitFor({state: 'detached'});
    assert.deepEqual(await selected(), []);
    const savedBlocks = await page.evaluate(() => {
        const target = window.vm.runtime.targets.find(item => item.getName() === 'CodeCat');
        return target.blocks.getScripts().map(id => target.blocks.getBlock(id).opcode);
    });
    assert.deepEqual(savedBlocks, ['looks_show']);
    console.log('Tab switching, close, sprite deletion, and saving and reopening a project passed.');

    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    if (!await readUndockButtonsChecked(page)) await toggleUndockButtons(page);
    await page.getByRole('tablist').locator('..')
        .getByRole('button', {name: 'Open in another window', exact: true}).press('Enter');
    const basicTarget = await page.evaluate(() => window.vm.editingTarget.getName());
    await front(basicTarget, 1, 0);
    console.log('The existing tab-row action opens the selected sprite code window.');

    await start('&twPlusSpriteCodeWindows=1', 'ja');
    const japaneseName = await page.evaluate(() => window.vm.editingTarget.getName());
    await open(japaneseName, '開く');
    await page.getByRole('region', {name: japaneseName + 'のコード', exact: true}).locator('.blocklySvg').first().waitFor();
    assert.deepEqual(await selected(), [japaneseName]);
    console.log('Japanese menu and code window title passed.');

    await start('&twPlusSpriteCodeWindows=1', 'en', true);
    const anchor = page.getByRole('button', {name: 'TurboWarp Plus layout', exact: true});
    assert.equal(await anchor.count(), 0);
    await toggleUndockButtons(page);
    await page.getByRole('tablist').locator('..')
        .getByRole('button', {name: 'Open in another window', exact: true}).press('Enter');
    const plusTarget = await page.evaluate(() => window.vm.editingTarget.getName());
    await front(plusTarget, 1, 0);
    await toggleUndockButtons(page);
    await front(plusTarget, 1, 0);
    assert.deepEqual(errors, []);
    console.log('The Plus layout menu opens code windows, which stay open when undock buttons are hidden.');
} finally {
    if (errors.length) console.error(errors);
    await browser.close();
}
