import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium, expect} from '@playwright/test';
import JSZip from '@turbowarp/jszip';
import pinnedGui from './pinned-gui.cjs';

const types = {
    '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
    '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm'
};
const origin = 'http://layout.test';
const buildPrefix = process.env.E2E_PATH_PREFIX || '/';
const bareBuild = process.env.E2E_LAYOUT_BARE_BUILD;

async function openBrowser(t, root, prefix = '/') {
    const browser = await chromium.launch({args: ['--enable-unsafe-swiftshader']});
    t.after(() => browser.close());
    const context = await browser.newContext({viewport: {width: 1360, height: 900}});
    await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin || !url.pathname.startsWith(prefix)) return route.abort();
        const pathname = decodeURIComponent(url.pathname.slice(prefix.length));
        const filename = path.resolve(root, pathname);
        if (!filename.startsWith(root + path.sep)) return route.abort();
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
    const build = path.join(pinnedGui(), 'build');
    const page = await openBrowser(t, build, buildPrefix);
    await page.addInitScript(() => {
        const getItem = Storage.prototype.getItem;
        window.layoutReads = 0;
        Storage.prototype.getItem = function (key) {
            if (key === 'twPlusEditorLayout') window.layoutReads++;
            return getItem.call(this, key);
        };
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const start = async query => {
        await page.goto(origin + buildPrefix + 'editor.html?lang=en&twPlusStandardLayout=0' + query);
        await expect(page.getByRole('button', {name: 'Add Extension', exact: true})).toBeVisible();
        await expect.poll(() => page.evaluate(() => Boolean(window.ScratchBlocks?.getMainWorkspace() &&
            window.vm?.editingTarget))).toBe(true);
    };
    const anchor = page.getByRole('button', {name: 'Show undock buttons'});
    const stage = page.locator('[data-gui-stage] canvas').first();
    const columns = page.getByRole('separator', {name: 'Editor and stage column width'});
    const rows = page.getByRole('separator', {name: 'Stage and target pane height'});
    const position = divider => divider.getAttribute('aria-valuenow').then(Number);
    for (const query of ['&twPlusWindowLayout=0', '&twPlusWindowLayout=', '&twPlusWindowLayout=true', '']) {
        await start(query);
        await expect(anchor).toHaveCount(0);
        await expect(columns).toBeVisible();
        await expect(rows).toBeVisible();
    }
    await page.evaluate(() => history.replaceState(null, '', '?lang=en&twPlusWindowLayout=1'));
    await expect(anchor).toHaveCount(0);
    await start('&twPlusWindowLayout=1');
    await expect(anchor).toHaveAttribute('aria-pressed', 'false');
    const themeColor = property => page.evaluate(token => {
        const sample = document.createElement('span');
        sample.style.color = `var(${token})`;
        document.body.append(sample);
        const color = getComputedStyle(sample).color;
        sample.remove();
        return color;
    }, property);
    const checkDividerColor = async () => {
        await columns.hover();
        await expect(columns).toHaveCSS('background-color', await themeColor('--looks-secondary'));
    };
    const originalAccent = await themeColor('--looks-secondary');
    await checkDividerColor();
    await page.getByText('Settings', {exact: true}).click();
    await page.getByText('Accent', {exact: true}).click();
    await page.getByText('Blue', {exact: true}).click();
    assert.notEqual(await themeColor('--looks-secondary'), originalAccent);
    await checkDividerColor();
    await anchor.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', {name: 'Switch to small stage', exact: true})).toBeFocused();
    await page.evaluate(() => history.replaceState(null, '', '?lang=en&twPlusWindowLayout=0'));
    await expect(columns).toBeVisible();
    const before = await page.evaluate(() => window.vm.toJSON());
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
    await anchor.click();
    await expect(anchor).toHaveAttribute('aria-pressed', 'true');
    await expect(anchor).toHaveCSS('border-top-color', await themeColor('--looks-secondary'));
    assert.equal(await position(columns), moved);
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

    await page.evaluate(() => vm.setStageSize(480, 360));
    await page.setViewportSize({width: 1050, height: 660});
    await expect.poll(async () => (await columns.boundingBox()).x).toBeLessThan(1050);
    await page.setViewportSize({width: 1360, height: 900});
    await expect.poll(() => position(columns)).toBe(saved);
    await anchor.click();
    await expect(anchor).toHaveAttribute('aria-pressed', 'false');
    assert.equal(await position(columns), saved);
    await expect(rows).toBeVisible();
    const scriptX = () => page.evaluate(() => vm.editingTarget.blocks.getBlock('layout-script').x);
    const editedX = await scriptX();
    await page.evaluate(() => ScratchBlocks.getMainWorkspace().undo(false));
    await expect.poll(scriptX).toBe(210);
    await page.evaluate(() => ScratchBlocks.getMainWorkspace().undo(true));
    await expect.poll(scriptX).toBe(editedX);

    await page.getByRole('tab', {name: 'Costumes'}).click();
    await page.getByRole('tab', {name: 'Code'}).click();
    await expect.poll(() => page.evaluate(() => ScratchBlocks.getMainWorkspace().isVisible())).toBe(true);

    await page.getByText('File', {exact: true}).click();
    const pending = page.waitForEvent('download');
    await page.getByRole('listitem').filter({hasText: /^(Save as\.\.\.|Save to your computer)$/}).click();
    const archive = await readFile(await (await pending).path());
    const zip = await JSZip.loadAsync(archive, {checkCRC32: true});
    const json = await zip.file('project.json').async('string');
    assert.ok(!json.includes('twPlusEditorLayout'));
    const project = JSON.parse(json);
    assert.ok(project.targets.some(target => Object.values(target.blocks)
        .some(block => block.opcode === 'event_whenflagclicked' && block.x > 220)));

    await start('&twPlusWindowLayout=1');
    await expect(anchor).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => position(columns)).toBe(saved);
    await page.getByRole('button', {name: 'Switch to small stage', exact: true}).click();
    await expect.poll(async () => (await stage.boundingBox()).width).toBe(240);
    const projectURL = origin + '/roundtrip.sb3';
    await page.context().route(projectURL, route => route.fulfill({
        body: archive, contentType: 'application/octet-stream'
    }));
    await start('&twPlusWindowLayout=0&twPlusSplitter=0&project_url=' + encodeURIComponent(projectURL));
    await expect(anchor).toHaveCount(0);
    await expect(columns).toHaveCount(0);
    assert.equal(await page.evaluate(() => window.layoutReads), 0);
    await expect.poll(() => page.evaluate(() => window.ScratchBlocks?.getMainWorkspace()?.getAllBlocks()
        .some(block => block.type === 'event_whenflagclicked' && block.getRelativeToSurfaceXY().x > 220)))
        .toBe(true);
    assert.deepEqual(errors, []);
});


test('the GUI keeps its original editor without a host connection', {skip: !bareBuild, timeout: 30_000}, async t => {
    const page = await openBrowser(t, path.resolve(bareBuild));
    await page.goto(origin + '/editor.html?lang=en&twPlusWindowLayout=1');
    await expect(page.getByRole('button', {name: 'Add Extension', exact: true})).toBeVisible();
    await expect(page.locator('[data-gui-stage] canvas').first()).toBeVisible();
    await expect(page.getByRole('button', {name: 'Show undock buttons'})).toHaveCount(0);
    await expect(page.getByRole('separator')).toHaveCount(0);
});

test('the anchor switches layouts without replacing the workspace or stopping the hidden stage', {timeout: 90_000}, async t => {
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const start = query => page.goto(origin + buildPrefix + 'editor.html?lang=en' + query);
    const anchor = page.getByRole('button', {name: 'TurboWarp Plus layout'});
    const stageToggle = page.getByRole('button', {name: 'Show stage', exact: true});
    const stage = page.locator('[data-gui-stage] canvas').first();
    const grid = page.locator('[data-fixed-columns="2"]');
    const toolbox = page.locator('.blocklyToolboxDiv').first();
    await start('&twPlusStandardLayout=0');
    await expect(stage).toBeVisible();
    await expect(anchor).toHaveCount(0);
    await expect(toolbox).not.toHaveAttribute('data-horizontal-block-palette');
    await start('&twPlusWindowLayout=1');
    await expect(anchor).toHaveAttribute('aria-pressed', 'true');
    await expect(toolbox).toHaveAttribute('data-horizontal-block-palette', '');
    await expect(stage).toBeVisible();
    await expect(grid).toBeVisible();
    const columns = await grid.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' '));
    assert.equal(columns.length, 2);
    const gridBounds = await grid.boundingBox();
    const editorBounds = await page.locator('.blocklySvg').first().boundingBox();
    const stageBounds = await stage.boundingBox();
    assert.ok(gridBounds.x < editorBounds.x && stageBounds.x > editorBounds.x);
    assert.ok(stageBounds.x + stageBounds.width <= 1360 && stageBounds.y < 200);
    assert.equal(await stage.evaluate(canvas => {
        const rect = canvas.getBoundingClientRect();
        return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === canvas;
    }), true);
    await expect(page.getByText('Sprite properties', {exact: true})).toBeVisible();
    await expect(page.getByRole('textbox', {name: 'Sprite name'})).toBeHidden();

    await expect.poll(() => page.evaluate(() => Boolean(vm.editingTarget))).toBe(true);
    const spriteId = await page.evaluate(async () => {
        const id = vm.editingTarget.id;
        for (let index = 0; index < 16; index++) await vm.duplicateSprite(id);
        vm.setEditingTarget(id);
        window.layoutWorkspace = ScratchBlocks.getMainWorkspace();
        window.layoutCanvas = document.querySelector('[data-gui-stage] canvas');
        return id;
    });
    await expect.poll(() => grid.evaluate(node => node.parentElement.scrollHeight > node.parentElement.clientHeight))
        .toBe(true);
    await grid.evaluate(node => { node.parentElement.scrollTop = node.parentElement.scrollHeight; });
    assert.ok(await grid.evaluate(node => node.parentElement.scrollTop > 0));
    await expect(page.getByRole('button', {name: 'Choose a Sprite', exact: true}).first()).toBeVisible();

    await toolbox.locator('.scratchCategoryId-motion').click();
    const source = page.locator('.blocklyFlyout .blocklyDraggable')
        .filter({has: page.getByText('move', {exact: true})});
    await expect(source).toBeVisible();
    const from = await source.boundingBox();
    await page.mouse.move(from.x + 12, from.y + 12);
    await page.mouse.down();
    await page.mouse.move(from.x + 12, from.y + 34, {steps: 4});
    await page.mouse.move(editorBounds.x + 340, editorBounds.y + 300, {steps: 14});
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => Object.values(vm.editingTarget.blocks._blocks)
        .some(block => block.opcode === 'motion_movesteps'))).toBe(true);

    await page.evaluate(() => {
        const blocks = vm.editingTarget.blocks;
        const startBlock = {id: 'layout-start', opcode: 'event_whenflagclicked', fields: {}, inputs: {}, shadow: false,
            topLevel: true, parent: null, next: 'layout-loop', x: 160, y: 140};
        const loop = {id: 'layout-loop', opcode: 'control_forever', fields: {}, inputs: {}, shadow: false,
            topLevel: false, parent: 'layout-start', next: null};
        blocks.createBlock(startBlock);
        blocks.createBlock(loop);
        vm.refreshWorkspace();
        vm.greenFlag();
    });
    const running = () => page.evaluate(() => vm.runtime.threads.some(thread => thread.topBlock === 'layout-start'));
    await expect.poll(running).toBe(true);
    await stageToggle.click();
    await expect(stage).toBeHidden();
    await expect(anchor).toBeVisible();
    await expect.poll(running).toBe(true);

    const costumes = page.getByRole('tab', {name: 'Costumes'});
    await costumes.click();
    await anchor.click();
    await expect(costumes).toHaveAttribute('aria-selected', 'true');
    await expect(anchor).toHaveAttribute('aria-pressed', 'false');
    await expect(stage).toBeVisible();
    await expect(grid).toHaveCount(0);
    await expect(toolbox).not.toHaveAttribute('data-horizontal-block-palette');
    await page.getByLabel('Layout options').click();
    await page.getByRole('button', {name: 'Show undock buttons'}).click();
    await anchor.click();
    await expect(stage).toBeHidden();
    await expect(costumes).toHaveAttribute('aria-selected', 'true');
    await stageToggle.click();
    await expect(stage).toBeVisible();
    await page.getByRole('tab', {name: 'Code'}).click();
    assert.deepEqual(await page.evaluate(() => ({
        sameWorkspace: window.layoutWorkspace === ScratchBlocks.getMainWorkspace(),
        sameCanvas: window.layoutCanvas === document.querySelector('[data-gui-stage] canvas'),
        target: vm.editingTarget.id,
        addedBlock: Object.values(vm.editingTarget.blocks._blocks).some(block => block.opcode === 'motion_movesteps')
    })), {sameWorkspace: true, sameCanvas: true, target: spriteId, addedBlock: true});
    await expect.poll(running).toBe(true);
    await page.setViewportSize({width: 1050, height: 660});
    await expect(anchor).toBeInViewport();
    await expect(stage).toBeInViewport({ratio: 1});
    assert.equal(await grid.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length), 2);

    await page.getByRole('button', {name: 'Backdrops', exact: true}).click();
    await page.getByRole('tab', {name: 'Backdrops', exact: true}).click();
    const backdropActions = page.getByRole('group', {name: 'Add a backdrop', exact: true});
    await expect(backdropActions).toBeVisible();
    await anchor.click();
    await expect(backdropActions).toHaveCount(0);
    assert.deepEqual(errors, []);
});
