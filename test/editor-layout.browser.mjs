import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium, expect} from '@playwright/test';

const types = {
    '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
    '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm'
};
const origin = 'http://layout.test';
const build = process.env.E2E_GUI_ROOT && path.resolve(process.env.E2E_GUI_ROOT, 'build');
const bareBuild = process.env.E2E_LAYOUT_BARE_BUILD;

async function openBrowser(t, root, fileForRequest) {
    const browser = await chromium.launch({args: ['--enable-unsafe-swiftshader']});
    t.after(() => browser.close());
    const context = await browser.newContext({viewport: {width: 1360, height: 900}});
    await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        const pathname = decodeURIComponent(url.pathname);
        const filename = fileForRequest?.(pathname) ?? path.resolve(root, '.' + pathname);
        if (!fileForRequest && !filename.startsWith(root + path.sep)) return route.abort();
        try {
            const body = await readFile(filename);
            return route.fulfill({body, contentType: types[path.extname(filename)] || 'application/octet-stream'});
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            return route.fulfill({status: 404});
        }
    });
    return context.newPage();
}

test('the real editor resizes both dividers and preserves editing and stage input', {timeout: 90_000}, async t => {
    assert.ok(build, 'Set E2E_GUI_ROOT to a locally built GUI checkout.');
    const page = await openBrowser(t, build);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const start = async query => {
        await page.goto(origin + '/editor.html?lang=en' + query);
        await expect(page.getByRole('button', {name: 'Add Extension', exact: true})).toBeVisible();
        await expect.poll(() => page.evaluate(() => Boolean(window.ScratchBlocks?.getMainWorkspace() &&
            window.vm?.editingTarget))).toBe(true);
    };
    const anchor = page.getByRole('button', {name: 'Flexible layout mode'});
    const stage = page.locator('[data-gui-stage] canvas').first();
    const columns = page.getByRole('separator', {name: 'Editor and stage column width'});
    const rows = page.getByRole('separator', {name: 'Stage and target pane height'});
    const position = divider => divider.getAttribute('aria-valuenow').then(Number);
    await start('');
    await expect(anchor).toHaveCount(0);
    await page.evaluate(() => history.replaceState(null, '', '?lang=en&twPlusWindowLayout=1'));
    await expect(anchor).toHaveCount(0);
    const originalStage = await stage.boundingBox();
    await start('&twPlusWindowLayout=1');
    await expect(anchor).toHaveAttribute('aria-pressed', 'false');
    await expect(columns).toHaveCount(0);
    const before = await page.evaluate(() => window.vm.toJSON());
    await anchor.click();
    await expect(anchor).toHaveAttribute('aria-pressed', 'true');
    const first = await position(columns);
    const initialSvgWidth = await page.locator('.blocklySvg').first().getAttribute('width').then(parseFloat);
    const divider = await columns.boundingBox();
    await page.mouse.move(divider.x + divider.width / 2, divider.y + 90);
    await page.mouse.down();
    await page.mouse.move(divider.x + 64, divider.y + 90, {steps: 6});
    await page.mouse.up();
    assert.ok(await position(columns) > first);
    await expect.poll(() => page.locator('.blocklySvg').first().getAttribute('width').then(parseFloat))
        .toBeGreaterThan(initialSvgWidth);
    const moved = await position(columns);
    await columns.press('ArrowLeft');
    assert.equal(await position(columns), moved - 16);
    const saved = await position(columns);
    await rows.press('Home');
    assert.equal(await position(rows), Number(await rows.getAttribute('aria-valuemin')));
    await rows.press('Enter');
    assert.ok(await position(rows) > Number(await rows.getAttribute('aria-valuemin')));
    assert.equal(await page.evaluate(() => window.vm.toJSON()), before);

    await page.evaluate(() => vm.setStageSize(480, 300));
    await expect.poll(async () => {
        const bounds = await stage.boundingBox();
        return Math.abs(bounds.width / bounds.height - 1.6);
    }).toBeLessThan(0.01);
    const currentStage = await stage.boundingBox();
    await page.mouse.click(currentStage.x + currentStage.width * 0.75, currentStage.y + currentStage.height / 2);
    const mouseX = await page.evaluate(() => vm.runtime.ioDevices.mouse.getScratchX());
    assert.ok(Math.abs(mouseX - 120) < 3, 'stage input follows the resized canvas');
    await page.keyboard.down('Space');
    assert.ok(await page.evaluate(() => vm.runtime.ioDevices.keyboard.getKeyIsDown('space')));
    await page.keyboard.up('Space');

    await page.evaluate(() => {
        vm.editingTarget.blocks.createBlock({id: 'layout-script', opcode: 'event_whenflagclicked',
            fields: {}, inputs: {}, shadow: false, topLevel: true, parent: null, next: null, x: 210, y: 80});
        vm.refreshWorkspace();
    });
    await expect.poll(() => page.evaluate(() => Boolean(
        ScratchBlocks.getMainWorkspace().getBlockById('layout-script')?.getSvgRoot()))).toBe(true);
    const block = await page.evaluate(() => {
        const {x, y, width, height} = ScratchBlocks.getMainWorkspace().getBlockById('layout-script')
            .getSvgRoot().getBoundingClientRect();
        return {x, y, width, height};
    });
    await page.mouse.move(block.x + block.width / 2, block.y + block.height / 2);
    await page.mouse.down();
    await page.mouse.move(block.x + block.width / 2 + 52, block.y + block.height / 2 + 30, {steps: 8});
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => vm.editingTarget.blocks.getBlock('layout-script').x)).toBeGreaterThan(220);
    const scrollX = await page.evaluate(() => ScratchBlocks.getMainWorkspace().scrollX);
    const scrollHandle = await page.locator('.blocklyScrollbarHorizontal .blocklyScrollbarHandle').first().boundingBox();
    await page.mouse.move(scrollHandle.x + scrollHandle.width / 2, scrollHandle.y + scrollHandle.height / 2);
    await page.mouse.down();
    await page.mouse.move(scrollHandle.x + scrollHandle.width / 2 + 25, scrollHandle.y + scrollHandle.height / 2, {steps: 5});
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => ScratchBlocks.getMainWorkspace().scrollX)).not.toBe(scrollX);
    await page.getByRole('tab', {name: 'Costumes'}).click();
    await page.getByRole('tab', {name: 'Code'}).click();
    await expect.poll(() => page.evaluate(() => ScratchBlocks.getMainWorkspace().isVisible())).toBe(true);

    await page.evaluate(() => vm.setStageSize(480, 360));
    await page.setViewportSize({width: 1050, height: 660});
    await expect.poll(async () => (await columns.boundingBox()).x).toBeLessThan(1050);
    await page.setViewportSize({width: 1360, height: 900});
    await expect.poll(() => position(columns)).toBe(saved);
    await anchor.click();
    await expect(columns).toHaveCount(0);
    await expect.poll(async () => (await stage.boundingBox()).width).toBe(originalStage.width);
    await anchor.click();
    assert.equal(await position(columns), saved);
    await start('&twPlusWindowLayout=1');
    await expect(columns).toHaveCount(0);
    await anchor.click();
    assert.equal(await position(columns), saved);
    await page.getByRole('button', {name: 'Switch to small stage', exact: true}).click();
    await expect.poll(async () => (await stage.boundingBox()).width).toBe(240);
    await start('&twPlusWindowLayout=0');
    await expect(anchor).toHaveCount(0);
    await expect(columns).toHaveCount(0);
    assert.deepEqual(errors, []);
});


test('the standalone layout host accepts drag and keyboard input without an Editor', {timeout: 30_000}, async t => {
    const root = path.resolve('packages/editor-layout');
    const page = await openBrowser(t, root, pathname => {
        if (pathname === '/node_modules/react/umd/react.development.js' ||
            pathname === '/node_modules/react-dom/umd/react-dom.development.js') return path.resolve('.' + pathname);
        const filename = path.resolve(root, '.' + pathname);
        return filename.startsWith(root + path.sep) ? filename : path.join(root, 'not-found');
    });
    await page.goto(origin + '/example/index.html');
    const columns = page.getByRole('separator', {name: 'Editor width'});
    const rows = page.getByRole('separator', {name: 'Stage height'});
    const position = divider => divider.getAttribute('aria-valuenow').then(Number);
    const initial = await position(columns);
    await columns.press('ArrowLeft');
    assert.equal(await position(columns), initial - 16);
    const divider = await rows.boundingBox();
    await page.mouse.move(divider.x + 30, divider.y + divider.height / 2);
    await page.mouse.down();
    await page.mouse.move(divider.x + 30, divider.y + 50, {steps: 5});
    await page.mouse.up();
    assert.ok(await position(rows) > 180);
    await page.getByRole('button', {name: 'Split layout'}).click();
    await expect(columns).toHaveCount(0);
    await page.getByRole('button', {name: 'Split layout'}).click();
    assert.equal(await position(columns), initial - 16);
});

test('the GUI keeps its original editor without a host connection', {skip: !bareBuild, timeout: 30_000}, async t => {
    const page = await openBrowser(t, path.resolve(bareBuild));
    await page.goto(origin + '/editor.html?lang=en&twPlusWindowLayout=1');
    await expect(page.getByRole('button', {name: 'Add Extension', exact: true})).toBeVisible();
    await expect(page.locator('[data-gui-stage] canvas').first()).toBeVisible();
    await expect(page.getByRole('button', {name: 'Flexible layout mode'})).toHaveCount(0);
    await expect(page.getByRole('separator')).toHaveCount(0);
});
