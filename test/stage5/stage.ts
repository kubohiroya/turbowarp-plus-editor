// @ts-nocheck -- Migrated test fixture with dynamic host mocks.
import assert from 'node:assert/strict';
import {stat} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {chromium} from 'playwright';
import {readUndockButtonsChecked, toggleUndockButtons} from '../fixtures/layout-menu.ts';

const origin = 'http://localhost:15105';
const prefix = process.env.TW151_STAGE5_PREFIX || '/';
const build = resolve(process.argv[2] || '/private/tmp/tw151-stage5-stage-web');
const browser = await chromium.launch({executablePath: process.env.TW151_CHROME,
    args: ['--enable-unsafe-swiftshader']});
const context = await browser.newContext({viewport: {width: 1400, height: 900}});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
context.setDefaultTimeout(10000);

async function start(search, standardLayout = '0') {
    await page.goto(origin + prefix + 'editor.html?lang=en&twPlusWindowLayout=1&twPlusInternalWindows=1' +
        '&twPlusStandardLayout=' + standardLayout + search);
    await page.waitForFunction(() => window.vm?.renderer?.canvas && window.vm?.editingTarget?.isOriginal);
}

try {
    await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin || !url.pathname.startsWith(prefix)) return route.abort();
        const file = resolve(build, decodeURIComponent(url.pathname.slice(prefix.length)));
        if (!file.startsWith(build + sep)) return route.abort();
        if (!(await stat(file).catch(() => null))?.isFile()) return route.fulfill({status: 404});
        return route.fulfill({path: file});
    });
    const action = page.locator('[class*="stage-action-slot_"]').getByRole('button', {
        name: 'Open in another window', exact: true
    });
    const stage = page.getByRole('region', {name: 'Stage', exact: true});
    const canvas = page.locator('[data-gui-stage] canvas').first();
    const display = page.getByRole('button', {name: 'Stage display', exact: true});
    await start('');
    assert.equal(await display.count(), 0);
    await toggleUndockButtons(page);
    assert.equal(await action.count(), 0);

    await start('&twPlusStagePanel=1');
    await canvas.waitFor();
    assert.equal(await action.count(), 0);
    await toggleUndockButtons(page);
    await canvas.evaluate(node => {
        window.stage5Canvas = node;
        window.stage5Renderer = window.vm.renderer;
        const greenFlag = window.vm.greenFlag.bind(window.vm);
        window.stage5Runs = 0;
        window.vm.greenFlag = () => {
            window.stage5Runs++;
            greenFlag();
        };
    });
    const opacity = () => action.evaluate(node => getComputedStyle(node.parentElement).opacity);
    const editor = page.getByRole('tab', {name: 'Code', exact: true});
    await editor.focus();
    assert.equal(await opacity(), '0');
    await canvas.hover();
    assert.equal(await opacity(), '0');
    await canvas.click({position: {x: 30, y: 30}});
    assert.equal(await opacity(), '1');
    assert.equal(await action.getAttribute('title'), 'Open in another window');
    assert.equal(await action.locator('span').isVisible(), false);
    const button = await action.boundingBox();
    const canvasBox = await canvas.boundingBox();
    assert.ok(button.y + button.height < canvasBox.y, JSON.stringify({button, canvasBox}));
    await action.click({trial: true});
    await editor.focus();
    assert.equal(await opacity(), '0');
    await action.focus();
    await page.keyboard.press('Enter');
    await stage.locator('[data-gui-stage] canvas').waitFor();
    await page.locator('img[class*="green-flag_green-flag_"]').first().click();
    assert.equal(await page.evaluate(() => window.stage5Runs), 1);
    assert.equal(await readUndockButtonsChecked(page), true);
    assert.ok(await canvas.evaluate(node => node === window.stage5Canvas && window.vm.renderer === window.stage5Renderer));

    const original = await canvas.boundingBox();
    const grip = stage.getByRole('separator', {name: 'Resize window', exact: true});
    await grip.press('Shift+ArrowDown');
    await grip.press('Shift+ArrowDown');
    await page.waitForFunction(width => document.querySelector('[data-gui-stage] canvas').getBoundingClientRect().width > width,
        original.width);
    const beforeMove = await stage.boundingBox();
    const title = stage.locator('[aria-label="Move window"]');
    await title.press('Shift+ArrowRight');
    await title.press('Shift+ArrowDown');
    const box = await canvas.boundingBox();
    const [width, height] = await page.evaluate(() => window.vm.renderer.getNativeSize());
    assert.ok(Math.abs(box.width / box.height - width / height) < 0.015);
    const moved = await stage.boundingBox();
    assert.ok(moved.x > beforeMove.x && moved.y > beforeMove.y);
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.25);
    const [x, y] = await page.evaluate(() => {
        const mouse = window.vm.runtime.ioDevices.mouse;
        return [mouse.getScratchX(), mouse.getScratchY()];
    });
    assert.ok(Math.abs(x - width / 4) <= 2 && Math.abs(y - height / 4) <= 2, JSON.stringify({x, y}));

    await stage.getByRole('button', {name: 'Close and dock', exact: true}).click();
    await stage.waitFor({state: 'hidden'});
    assert.ok(await canvas.evaluate(node => node === window.stage5Canvas));
    await action.focus();
    await page.keyboard.press('Enter');
    await stage.waitFor();
    await toggleUndockButtons(page);
    await stage.waitFor();
    assert.equal(await action.count(), 0);
    await stage.getByRole('button', {name: 'Close and dock', exact: true}).click();
    await stage.waitFor({state: 'hidden'});
    assert.equal(await action.count(), 0);
    assert.ok(await canvas.evaluate(node => node === window.stage5Canvas));
    const menu = page.getByRole('menu', {name: 'Stage display', exact: true});
    const undock = menu.getByRole('menuitem', {name: 'Undock stage'});
    const dock = menu.getByRole('menuitem', {name: 'Dock stage'});
    await start('&twPlusStageDisplayMenu=1');
    await display.click();
    assert.equal(await undock.getAttribute('aria-disabled'), 'true');

    await start('&twPlusStagePanel=1&twPlusStageDisplayMenu=1');
    await canvas.evaluate(node => { window.stage5Canvas = node; });
    await display.press('ArrowDown');
    const small = menu.getByRole('menuitemradio', {name: 'Switch to small stage'});
    const full = menu.getByRole('menuitemradio', {name: 'Switch to full stage'});
    assert.equal(await menu.getByRole('menuitemradio').count() + await menu.getByRole('menuitem').count(), 4);
    assert.equal(await small.evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Enter');
    await menu.waitFor({state: 'hidden'});
    await display.click();
    assert.equal(await small.getAttribute('aria-checked'), 'true');
    await full.click();
    await display.click();
    assert.equal(await full.getAttribute('aria-checked'), 'true');
    await page.keyboard.press('Escape');
    await menu.waitFor({state: 'hidden'});
    assert.equal(await display.evaluate(node => node === document.activeElement), true);
    await display.click();
    await editor.click();
    await menu.waitFor({state: 'hidden'});

    await display.press('Enter');
    await page.keyboard.press('End');
    assert.equal(await undock.evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Enter');
    await stage.locator('[data-gui-stage] canvas').waitFor();
    assert.equal(await action.count(), 0);
    await display.click();
    await dock.click();
    await stage.waitFor({state: 'hidden'});
    assert.ok(await canvas.evaluate(node => node === window.stage5Canvas));

    await display.click();
    await undock.click();
    await stage.waitFor();
    await display.click();
    await menu.getByRole('menuitem', {name: 'Enter full screen mode'}).click();
    await display.waitFor({state: 'hidden'});
    await page.keyboard.press('Escape');
    await display.waitFor();
    await stage.waitFor({state: 'hidden'});
    await display.click();
    assert.equal(await undock.getAttribute('aria-disabled'), 'false');
    await start('&twPlusStagePanel=1&twPlusStageDisplayMenu=1', '1');
    await display.click();
    await undock.click();
    await stage.waitFor();
    await display.click();
    await dock.click();
    await stage.waitFor({state: 'hidden'});
    assert.deepEqual(errors, []);
    console.log('Stage retains the renderer, canvas, aspect and mouse coordinates when undocked, moved, resized and restored.');
    console.log('Stage display menu handles keyboard, presets, fullscreen and docking in both editor layouts.');
} finally {
    await browser.close();
}
