import assert from 'node:assert/strict';
import {stat} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {chromium} from 'playwright';

const origin = 'http://localhost:15106';
const prefix = process.env.TW151_STAGE5_PREFIX || '/';
const build = resolve(process.argv[2] || '/private/tmp/tw176-targets-web');
const browser = await chromium.launch({executablePath: process.env.TW151_CHROME,
    args: ['--enable-unsafe-swiftshader']});
const context = await browser.newContext({viewport: {width: 1400, height: 900}});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.stack ?? error.message));
context.setDefaultTimeout(10000);
const fixture = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="teal"/></svg>';
const bitmap = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAIAAAUAAQ26InQAAAAASUVORK5CYII=', 'base64');

async function start(params, language = 'en') {
    await page.goto(origin + prefix + 'editor.html?lang=' + language +
        '&twPlusWindowLayout=1&twPlusInternalWindows=1' + params);
    await page.waitForFunction(() => window.vm?.renderer?.canvas && window.vm?.editingTarget?.isOriginal);
}

const count = () => page.evaluate(() => window.vm.runtime.getTargetForStage().sprite.costumes.length);

async function addsBackdrop(action) {
    const expected = await count() + 1;
    await action();
    await page.waitForFunction(value => window.vm.runtime.getTargetForStage().sprite.costumes.length === value, expected);
}

try {
    await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'assets.scratch.mit.edu' || url.hostname === 'cdn.assets.scratch.mit.edu') {
            if (/\.svg(?:\/|$)/.test(url.pathname)) {
                return route.fulfill({body: fixture, contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin': '*'}});
            }
            if (/\.png(?:\/|$)/.test(url.pathname)) {
                return route.fulfill({body: bitmap, contentType: 'image/png', headers: {'Access-Control-Allow-Origin': '*'}});
            }
        }
        if (url.origin !== origin || !url.pathname.startsWith(prefix)) return route.abort();
        const file = resolve(build, decodeURIComponent(url.pathname.slice(prefix.length)));
        if (!file.startsWith(build + sep)) return route.abort();
        if (!(await stat(file).catch(() => null))?.isFile()) return route.fulfill({status: 404});
        return route.fulfill({path: file});
    });

    const mode = page.getByRole('button', {name: 'Show undock buttons', exact: true});
    const grid = page.locator('[data-backdrop-placement]');
    const tile = grid.getByRole('button', {name: 'Backdrops', exact: true});
    const frame = page.getByRole('region', {name: 'Sprite list', exact: true});
    const open = page.getByRole('heading', {name: 'Sprite list', exact: true}).locator('..')
        .getByRole('button', {name: 'Open in another window', exact: true});
    const backdropFooter = page.getByRole('group', {name: 'Add a backdrop', exact: true});
    const legacyStage = page.locator('[class*="stage-selector_stage-selector_"]');

    await start('');
    await mode.click();
    await legacyStage.waitFor();
    assert.equal(await tile.count(), 0);
    assert.equal(await open.count(), 0);

    await start('&twPlusTargetList=1');
    await tile.waitFor();
    assert.equal(await open.count(), 0);
    await mode.click();
    await tile.waitFor();
    assert.equal(await legacyStage.count(), 0);
    assert.equal(await tile.evaluate(node => node.innerText.trim()), 'Backdrops');
    assert.ok(await tile.locator('img').getAttribute('src'));
    assert.equal(await tile.evaluate(node => getComputedStyle(node).borderTopStyle), 'dashed');

    await page.evaluate(async () => {
        const vm = window.vm;
        const id = vm.editingTarget.id;
        for (let i = 0; i < 16; i++) await vm.duplicateSprite(id);
        vm.setEditingTarget(id);
    });
    await grid.locator('[class*="sprite-selector_sprite-wrapper_"]').last().waitFor({state: 'attached'});
    await tile.evaluate(node => {window.originalBackdropTile = node;});
    await open.click();
    await frame.locator('[data-backdrop-placement="top-right"]').waitFor();
    assert.ok(await tile.evaluate(node => node === window.originalBackdropTile));
    const spriteCells = grid.locator('[class*="sprite-selector_sprite-wrapper_"]');
    const topRow = await spriteCells.first().boundingBox();
    const upper = await tile.boundingBox();
    const gridBox = await grid.boundingBox();
    assert.ok(Math.abs(upper.y - topRow.y) < 2);
    assert.ok(upper.x > topRow.x && gridBox.x + gridBox.width - (upper.x + upper.width) < 16);
    assert.ok(Math.abs(upper.width - topRow.width) < 2);

    const grip = frame.getByRole('separator', {name: 'Resize window', exact: true});
    for (let i = 0; i < 7; i++) await grip.press('Shift+ArrowLeft');
    for (let i = 0; i < 6; i++) await grip.press('Shift+ArrowDown');
    await frame.locator('[data-backdrop-placement="bottom-left"]').waitFor();
    const lower = await tile.boundingBox();
    const view = await grid.locator('..').boundingBox();
    assert.ok(lower.x - view.x < 16 && Math.abs(view.y + view.height - lower.y - lower.height) < 16,
        JSON.stringify({lower, view}));
    await tile.focus();
    const scroll = await grid.locator('..').evaluate(node => {
        node.scrollTop = 130;
        return node.scrollTop;
    });
    assert.ok(scroll > 0);
    assert.ok(await tile.evaluate(node => node === document.activeElement));
    const scrolled = await tile.boundingBox();
    assert.ok(Math.abs(view.y + view.height - scrolled.y - scrolled.height) < 16,
        JSON.stringify({scrolled, view}));
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.vm.editingTarget.isStage);
    assert.equal(await tile.getAttribute('aria-pressed'), 'true');

    await page.getByRole('tab', {name: 'Backdrops', exact: true}).click();
    await backdropFooter.waitFor();
    assert.equal(await backdropFooter.getByRole('button').count(), 4);
    assert.ok(await backdropFooter.evaluate(node => node === node.parentElement.lastElementChild));
    assert.equal(await backdropFooter.locator('[class*="action-menu_menu-container_"]').count(), 0);
    const library = backdropFooter.getByRole('button', {name: 'Choose a Backdrop', exact: true});
    const paint = backdropFooter.getByRole('button', {name: 'Paint', exact: true});
    const surprise = backdropFooter.getByRole('button', {name: 'Surprise', exact: true});
    const upload = backdropFooter.getByRole('button', {name: 'Upload Backdrop', exact: true});
    await addsBackdrop(async () => {
        await library.click();
        await page.getByText('Blue Sky', {exact: true}).click();
    });
    await addsBackdrop(() => paint.click());
    await addsBackdrop(() => surprise.click());
    await addsBackdrop(async () => {
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), upload.click()]);
        await chooser.setFiles({name: 'local-test.svg', mimeType: 'image/svg+xml',
            buffer: Buffer.from(fixture.replace('teal', 'orange'))});
    });
    const title = frame.locator('[aria-label="Move window"]');
    for (let i = 0; i < 6; i++) await title.press('Shift+ArrowRight');
    await page.getByText('local-test', {exact: true}).click();
    await page.waitForFunction(() => {
        const stage = window.vm.runtime.getTargetForStage();
        return stage.sprite.costumes[stage.currentCostume].name === 'local-test' &&
            window.originalBackdropTile.querySelector('img').src === stage.sprite.costumes[stage.currentCostume].asset.encodeDataURI();
    });

    await mode.click();
    await frame.waitFor();
    assert.ok(await tile.evaluate(node => node === window.originalBackdropTile));
    await frame.getByRole('button', {name: 'Close and dock', exact: true}).click();
    await frame.waitFor({state: 'hidden'});
    assert.ok(await tile.evaluate(node => node === window.originalBackdropTile));
    assert.equal(await tile.getAttribute('aria-pressed'), 'true');
    await grid.locator('..').evaluate(node => {node.scrollTop = 0;});
    await spriteCells.first().click();
    await page.waitForFunction(() => !window.vm.editingTarget.isStage);
    assert.equal(await tile.getAttribute('aria-pressed'), 'false');
    assert.equal(await legacyStage.count(), 0);
    assert.equal(await open.count(), 0);
    assert.ok(await tile.evaluate(node => node === window.originalBackdropTile));

    await start('&twPlusTargetList=1', 'ja');
    await page.getByRole('button', {name: 'アンドックボタンを表示', exact: true}).click();
    await grid.getByRole('button', {name: '背景', exact: true}).waitFor();
    assert.deepEqual(errors, []);
    console.log('One sticky backdrop tile, four footer actions, live preview, sprite selection and undock/dock passed.');
} catch (error) {
    if (errors.length) console.error(errors);
    throw error;
} finally {
    await browser.close();
}
