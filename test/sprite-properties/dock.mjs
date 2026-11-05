import assert from 'node:assert/strict';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {toggleUndockButtons} from '../fixtures/layout-menu.mjs';

const build = process.argv[2];
assert.ok(path.isAbsolute(build), 'Pass the absolute Editor webpack output directory');
const origin = 'http://localhost:15175';
const prefix = process.env.SPRITE_PROPERTIES_PREFIX || '/';
const browser = await chromium.launch({executablePath: process.env.SPRITE_PROPERTIES_CHROME});
const context = await browser.newContext({viewport: {width: 1280, height: 850}});
await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || !url.pathname.startsWith(prefix)) return route.abort();
    const file = path.resolve(build, decodeURIComponent(url.pathname.slice(prefix.length)));
    if (!file.startsWith(build + path.sep)) return route.abort();
    if (!(await stat(file).catch(() => null))?.isFile()) return route.fulfill({status: 404});
    return route.fulfill({path: file});
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));

async function start(search = '') {
    await page.goto(`${origin}${prefix}editor.html?lang=en&twPlusStandardLayout=0${search}`);
    await page.waitForFunction(() => window.vm?.editingTarget?.isOriginal && window.ScratchBlocks?.getMainWorkspace());
}

const panel = page.getByRole('region', {name: 'Sprite properties'});
const input = label => panel.getByRole('textbox', {name: label, exact: true});
const number = label => panel.getByRole('spinbutton', {name: label, exact: true});
async function edit(field, value) {
    await field.fill(String(value));
    await field.press('Enter');
}

try {
    await start();
    assert.equal(await panel.count(), 0);
    const nativeX = page.getByPlaceholder('x', {exact: true});
    await edit(nativeX, 11);
    assert.equal(await page.evaluate(() => window.vm.editingTarget.x), 11);
    await page.evaluate(() => history.replaceState(null, '', '?lang=en&twPlusSpriteProperties=1'));
    assert.equal(await panel.count(), 0);

    await start('&twPlusSpriteProperties=1&twPlusWindowLayout=1');
    await panel.waitFor();
    assert.equal(await panel.evaluate(element => getComputedStyle(element).containerType), 'inline-size');
    const ids = await page.evaluate(async () => {
        const vm = window.vm;
        const first = vm.editingTarget.id;
        await vm.duplicateSprite(first);
        const second = vm.editingTarget.id;
        vm.setEditingTarget(first);
        return {first, second, stage: vm.runtime.getTargetForStage().id};
    });
    assert.notEqual(ids.first, ids.second);
    await edit(input('Sprite name'), 'Updated cat');
    await edit(number('x'), -34);
    await edit(number('y'), 12);
    await panel.getByLabel('Visibility').selectOption('false');
    await edit(number('Size'), 90);
    await edit(number('Direction'), -35);
    await panel.getByLabel('Rotation style').selectOption('left-right');
    const changed = await page.evaluate(() => {
        const {x, y, visible, size, direction, rotationStyle} = window.vm.editingTarget;
        return {name: window.vm.editingTarget.getName(), x, y, visible, size, direction, rotationStyle};
    });
    assert.deepEqual(changed, {name: 'Updated cat', x: -34, y: 12, visible: false, size: 90, direction: -35,
        rotationStyle: 'left-right'});

    await input('Sprite name').fill('Uncommitted');
    await page.evaluate(id => window.vm.setEditingTarget(id), ids.second);
    assert.notEqual(await input('Sprite name').inputValue(), 'Uncommitted');
    await page.evaluate(() => {
        window.vm.editingTarget.setXY(37, 25);
        window.vm.emitTargetsUpdate(false);
    });
    assert.equal(await number('x').inputValue(), '37');
    assert.equal(await page.evaluate(id => window.vm.runtime.getTargetById(id).getName(), ids.first), 'Updated cat');

    await page.evaluate(id => window.vm.setEditingTarget(id), ids.stage);
    assert.equal(await input('Sprite name').isDisabled(), true);
    assert.equal(await number('x').isDisabled(), true);
    await page.evaluate(id => window.vm.setEditingTarget(id), ids.first);
    assert.equal(await input('Sprite name').inputValue(), 'Updated cat');
    await toggleUndockButtons(page);
    await page.getByRole('separator', {name: 'Editor and stage column width'}).press('End');
    await page.getByRole('separator', {name: 'Stage and target pane height'}).press('End');
    const compactDock = await panel.evaluate(element => {
        const list = element.nextElementSibling.getBoundingClientRect();
        return {
            formScrolls: element.scrollHeight > element.clientHeight && element.clientHeight > 0,
            listHeight: list.height,
            listBottom: list.bottom,
            viewportBottom: window.innerHeight
        };
    });
    assert.equal(compactDock.formScrolls, true, JSON.stringify(compactDock));
    assert.ok(compactDock.listHeight >= 60, JSON.stringify(compactDock));
    assert.ok(compactDock.listBottom <= compactDock.viewportBottom, JSON.stringify(compactDock));
    await start('&twPlusSpriteProperties=1&twPlusWindowLayout=1&twPlusInternalWindows=1');
    const float = page.getByRole('region', {name: 'Sprite', exact: true});
    const action = page.getByRole('heading', {name: 'Sprite', exact: true}).locator('..')
        .getByRole('button', {name: 'Open in another window', exact: true});
    assert.equal(await action.count(), 0);
    await toggleUndockButtons(page);
    await input('Sprite name').evaluate(node => {window.originalSpriteNameInput = node;});
    await action.press('Enter');
    await float.getByRole('region', {name: 'Sprite properties'}).waitFor();
    assert.equal(await panel.count(), 1);
    assert.ok(await input('Sprite name').evaluate(node => node === window.originalSpriteNameInput));
    await edit(input('Sprite name'), 'Floating cat');
    await edit(number('x'), 41);
    await edit(number('y'), -22);
    await panel.getByLabel('Visibility').selectOption('false');
    await edit(number('Size'), 84);
    await edit(number('Direction'), 64);
    await panel.getByLabel('Rotation style').selectOption('left-right');
    assert.deepEqual(await page.evaluate(() => {
        const {x, y, visible, size, direction, rotationStyle} = window.vm.editingTarget;
        return {name: window.vm.editingTarget.getName(), x, y, visible, size, direction, rotationStyle};
    }), {name: 'Floating cat', x: 41, y: -22, visible: false, size: 84, direction: 64, rotationStyle: 'left-right'});

    const resize = float.getByRole('separator', {name: 'Resize window'});
    const columns = () => panel.locator('.tw-sprite-properties__fields').evaluate(element =>
        getComputedStyle(element).gridTemplateColumns.split(' ').length);
    await resize.focus();
    for (let step = 0; step < 8; step++) await resize.press('Shift+ArrowLeft');
    assert.equal(await columns(), 1);
    for (let step = 0; step < 17; step++) await resize.press('Shift+ArrowRight');
    assert.equal(await columns(), 6);

    await float.getByRole('button', {name: 'Close and dock', exact: true}).click();
    await float.waitFor({state: 'hidden'});
    assert.ok(await input('Sprite name').evaluate(node => node === window.originalSpriteNameInput));
    assert.equal(await input('Sprite name').inputValue(), 'Floating cat');
    await action.press('Enter');
    await float.waitFor();
    await toggleUndockButtons(page);
    await float.waitFor();
    assert.equal(await action.count(), 0);
    await float.getByRole('button', {name: 'Close and dock', exact: true}).click();
    await float.waitFor({state: 'hidden'});
    assert.equal(await number('x').inputValue(), '41');

    await start('&twPlusWindowLayout=1&twPlusInternalWindows=1');
    assert.equal(await panel.count(), 0);
    await page.getByPlaceholder('x', {exact: true}).waitFor();
    assert.deepEqual(errors, []);
    console.log('The same form edits the real VM in the dock and in-app window, reflows from one column to one row, stays open with its undock button hidden and restores on close, and respects the startup flag.');
} finally {
    await browser.close();
}
