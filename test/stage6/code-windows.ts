import {verifyWebEditor} from '../../scripts/site/editor-revision.ts';
import assert from 'node:assert/strict';
import {stat} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {chromium} from 'playwright';
import {readUndockButtonsChecked, toggleUndockButtons} from '../fixtures/layout-menu.ts';

const origin = 'http://localhost:15107';
const prefix = '/turbowarp-plus-editor/';
const build = resolve(process.argv[2]);
await verifyWebEditor(build);
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

    await page.getByRole('tab', {name: 'Costumes', exact: true}).click();
    await front('CodeCat', 3, 1);
    await tile('CodeDog').click();
    await front('CodeDog', 3, 2);
    await windows.nth(2).getByRole('button', {name: 'Close code window'}).click();
    await front('CodeCat', 2, 1);
    // Sprite deletion confirmation is on by default and asks before deleting.
    page.once('dialog', dialog => dialog.accept());
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
