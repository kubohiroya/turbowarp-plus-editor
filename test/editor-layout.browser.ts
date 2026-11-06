import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium, expect} from '@playwright/test';
import JSZip from '@turbowarp/jszip';
import pinnedGui from './pinned-gui.ts';
import {layoutMenu, readUndockButtonsChecked, toggleUndockButtons, undockButtons} from './fixtures/layout-menu.ts';

const types = {
    '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
    '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm'
};
const origin = 'http://layout.test';
const buildPrefix = process.env.E2E_PATH_PREFIX || '/';
const bareBuild = process.env.E2E_LAYOUT_BARE_BUILD;

async function openBrowser(t, root, prefix = '/', routeOrigin = origin) {
    const browser = await chromium.launch({args: ['--enable-unsafe-swiftshader']});
    t.after(() => browser.close());
    const context = await browser.newContext({viewport: {width: 1360, height: 900}});
    await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== routeOrigin || !url.pathname.startsWith(prefix)) return route.abort();
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
    const menu = layoutMenu(page);
    const checkbox = undockButtons(page);
    const stage = page.locator('[data-gui-stage] canvas').first();
    const columns = page.getByRole('separator', {name: 'Editor and stage column width'});
    const rows = page.getByRole('separator', {name: 'Stage and target pane height'});
    const position = divider => divider.getAttribute('aria-valuenow').then(Number);
    const grip = divider => divider.evaluate(element => {
        const style = getComputedStyle(element, '::after');
        return {width: style.width, height: style.height, image: style.backgroundImage};
    });
    for (const query of ['&twPlusWindowLayout=0', '&twPlusWindowLayout=', '&twPlusWindowLayout=true', '']) {
        await start(query);
        await expect(layoutMenu(page)).toHaveCount(0);
        await expect(columns).toBeVisible();
        await expect(rows).toBeVisible();
    }
    await page.evaluate(() => history.replaceState(null, '', '?lang=en&twPlusWindowLayout=1'));
    await expect(layoutMenu(page)).toHaveCount(0);
    await start('&twPlusWindowLayout=1');
    await menu.press('ArrowDown');
    await expect(checkbox).toHaveAttribute('aria-checked', 'false');
    await expect(checkbox).toBeFocused();
    await checkbox.press('Escape');
    await expect(menu).toBeFocused();
    const columnGrip = await grip(columns);
    const rowGrip = await grip(rows);
    assert.deepEqual([columnGrip.width, columnGrip.height, rowGrip.width, rowGrip.height],
        ['4px', '18px', '18px', '4px']);
    assert.match(columnGrip.image, /radial-gradient/);
    assert.match(rowGrip.image, /radial-gradient/);
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
    await page.evaluate(() => history.replaceState(null, '', '?lang=en&twPlusWindowLayout=0'));
    await expect(columns).toBeVisible();
    const before = await page.evaluate(() => window.vm.toJSON());
    const first = await position(columns);
    const initialSvgWidth = await page.locator('.blocklySvg').first().getAttribute('width').then(parseFloat);
    const divider = await columns.boundingBox();
    const center = divider.y + divider.height / 2;
    await page.mouse.move(divider.x + divider.width / 2, center);
    await page.mouse.down();
    await page.mouse.move(divider.x + 64, center, {steps: 6});
    await page.mouse.up();
    assert.ok(await position(columns) > first);
    await expect.poll(() => page.locator('.blocklySvg').first().getAttribute('width').then(parseFloat))
        .toBeGreaterThan(initialSvgWidth);
    const moved = await position(columns);
    await menu.press('ArrowDown');
    await checkbox.press('Enter');
    await expect(menu).toBeFocused();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    assert.equal(await readUndockButtonsChecked(page), true);
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
        window.ScratchBlocks.getMainWorkspace().getBlockById('layout-script')?.getSvgRoot()))).toBe(true);
    const block = await page.evaluate(() => {
        const {x, y, width, height} = window.ScratchBlocks.getMainWorkspace().getBlockById('layout-script')
            .getSvgRoot().getBoundingClientRect();
        return {x, y, width, height};
    });
    await page.mouse.move(block.x + block.width / 2, block.y + block.height / 2);
    await page.mouse.down();
    await page.mouse.move(block.x + block.width / 2 + 52, block.y + block.height / 2 + 30, {steps: 8});
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => vm.editingTarget.blocks.getBlock('layout-script').x)).toBeGreaterThan(220);
    const scrollX = await page.evaluate(() => window.ScratchBlocks.getMainWorkspace().scrollX);
    const scrollHandle = await page.locator('.blocklyScrollbarHorizontal .blocklyScrollbarHandle').first().boundingBox();
    await page.mouse.move(scrollHandle.x + scrollHandle.width / 2, scrollHandle.y + scrollHandle.height / 2);
    await page.mouse.down();
    await page.mouse.move(scrollHandle.x + scrollHandle.width / 2 + 25, scrollHandle.y + scrollHandle.height / 2, {steps: 5});
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.ScratchBlocks.getMainWorkspace().scrollX)).not.toBe(scrollX);

    await page.evaluate(() => vm.setStageSize(480, 360));
    await page.setViewportSize({width: 1050, height: 660});
    await expect.poll(async () => (await columns.boundingBox()).x).toBeLessThan(1050);
    await page.setViewportSize({width: 1360, height: 900});
    await expect.poll(() => position(columns)).toBe(saved);
    await toggleUndockButtons(page);
    assert.equal(await readUndockButtonsChecked(page), false);
    assert.equal(await position(columns), saved);
    await expect(rows).toBeVisible();
    const scriptX = () => page.evaluate(() => vm.editingTarget.blocks.getBlock('layout-script').x);
    const editedX = await scriptX();
    await page.evaluate(() => window.ScratchBlocks.getMainWorkspace().undo(false));
    await expect.poll(scriptX).toBe(210);
    await page.evaluate(() => window.ScratchBlocks.getMainWorkspace().undo(true));
    await expect.poll(scriptX).toBe(editedX);

    await page.getByRole('tab', {name: 'Costumes'}).click();
    await page.getByRole('tab', {name: 'Code'}).click();
    await expect.poll(() => page.evaluate(() => window.ScratchBlocks.getMainWorkspace().isVisible())).toBe(true);

    await page.getByText('File', {exact: true}).click();
    const pending = page.waitForEvent('download');
    await page.getByRole('listitem').filter({hasText: /^(Save as\.\.\.|Save to your computer)$/}).click();
    const archive = await readFile(await (await pending).path());
    const zip = await JSZip.loadAsync(archive, {checkCRC32: true});
    const json = await zip.file('project.json').async('string');
    assert.ok(!json.includes('twPlusEditorLayout'));
    const project = JSON.parse(json);
    assert.ok(project.targets.some(target => Object.values<{opcode: string; x: number}>(target.blocks)
        .some(block => block.opcode === 'event_whenflagclicked' && block.x > 220)));

    await start('&twPlusWindowLayout=1');
    assert.equal(await readUndockButtonsChecked(page), false);
    await expect.poll(() => position(columns)).toBe(saved);
    await page.getByRole('button', {name: 'Switch to small stage', exact: true}).click();
    await expect.poll(async () => (await stage.boundingBox()).width).toBe(240);
    const projectURL = origin + '/roundtrip.sb3';
    await page.context().route(projectURL, route => route.fulfill({
        body: archive, contentType: 'application/octet-stream'
    }));
    await start('&twPlusWindowLayout=0&twPlusSplitter=0&project_url=' + encodeURIComponent(projectURL));
    await expect(layoutMenu(page)).toHaveCount(0);
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

test('the Plus File menu has action icons and opens the extension library from its last item', {timeout: 30_000}, async t => {
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix);
    const start = suffix => page.goto(origin + buildPrefix + 'editor.html?lang=ja' + suffix);
    const paletteButton = page.getByRole('button', {name: '拡張機能を追加', exact: true});
    const add = page.getByRole('button', {name: '機能拡張の追加', exact: true});
    const openFile = () => page.getByText('ファイル', {exact: true}).click();
    await start('&twPlusExtensionFileMenu=0');
    await expect(paletteButton).toBeVisible();
    await openFile();
    await expect(add).toHaveCount(0);
    await expect(page.locator('[data-file-menu-icon]')).toHaveCount(0);

    await start('');
    await expect(paletteButton).toHaveCount(0);
    const palette = page.locator('[data-horizontal-block-palette]');
    const motion = page.getByRole('button', {name: '動き', exact: true});
    await expect(motion).toBeVisible();
    const [paletteBounds, motionBounds] = await Promise.all([palette.boundingBox(), motion.boundingBox()]);
    assert.ok(motionBounds.x - paletteBounds.x < 8);
    await openFile();
    const items = page.getByRole('list').filter({has: add}).locator(':scope > li');
    await expect(items.last()).toHaveText('機能拡張の追加');
    assert.ok(await items.evaluateAll(rows => rows.every(row => row.querySelector('[data-file-menu-icon]'))));
    await expect(items.last().locator('[data-file-menu-icon="extension"]')).toBeVisible();
    await add.press('Enter');
    await expect(page.getByText('機能拡張を作品に追加する', {exact: true})).toBeVisible();
    await expect(add).toBeHidden();

    await start('&twPlusStandardLayout=0&twPlusExtensionFileMenu=1');
    await expect(paletteButton).toBeVisible();
    await openFile();
    await expect(add).toHaveCount(0);
});

test('the Plus project menu and the complete stage panel work by default', {timeout: 30_000}, async t => {
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix);
    await page.goto(origin + buildPrefix + 'editor.html?lang=en');
    await expect(page.getByText('See Project Page', {exact: true})).toHaveCount(0);
    await expect(page.getByText('TurboWarp Feedback', {exact: true})).toHaveCount(0);
    const project = page.getByLabel('TurboWarp Plus project information', {exact: true}).first();
    await project.click();
    await expect(page.getByRole('link', {name: 'About TurboWarp Plus Editor'})).toBeVisible();
    await expect(page.getByRole('link', {name: 'Source code'})).toBeVisible();
    await expect(page.getByRole('link', {name: 'Licenses and credits'})).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('link', {name: 'Source code'})).toHaveCount(0);

    const frame = page.locator('[data-plus-stage-frame]');
    const canvas = frame.locator('[data-gui-stage] canvas').first();
    const display = frame.getByRole('button', {name: 'Stage display', exact: true});
    await expect(canvas).toBeVisible();
    const tabs = await page.getByRole('tablist').first().boundingBox();
    const stage = await frame.boundingBox();
    assert.ok(Math.abs(stage.y - tabs.y) <= 2, JSON.stringify({stage, tabs}));
    await frame.evaluate(node => {
        window.initialStagePanel = node;
        window.initialStageCanvas = node.querySelector('[data-gui-stage] canvas');
        window.initialStageControls = node.querySelector('[class*="controls_controls-container"]');
        window.stageControlCalls = [];
        for (const [method, label] of [['greenFlag', 'go'], ['stopAll', 'stop']]) {
            const original = vm[method].bind(vm);
            vm[method] = (...args) => {
                window.stageControlCalls.push(label);
                return original(...args);
            };
        }
    });
    await display.click();
    await frame.getByRole('menuitem', {name: 'Undock stage', exact: true}).click();
    const floating = page.getByRole('region', {name: 'Stage', exact: true});
    await expect(floating.locator('[data-plus-stage-frame] canvas').first()).toBeVisible();
    await expect(floating.getByRole('button', {name: 'Stage display', exact: true})).toBeVisible();
    assert.ok(await frame.evaluate(node => node === window.initialStagePanel &&
        node.querySelector('[data-gui-stage] canvas') === window.initialStageCanvas &&
        window.initialStageControls && node.contains(window.initialStageControls)));
    await floating.getByTitle('Go', {exact: true}).click();
    await floating.getByTitle('Stop', {exact: true}).click();
    await expect.poll(() => page.evaluate(() => window.stageControlCalls)).toEqual(['go', 'stop']);
    await display.click();
    await floating.getByRole('menuitem', {name: 'Dock stage', exact: true}).click();
    await expect(floating).toHaveCount(0);
    await expect(canvas).toBeVisible();
    assert.ok(await frame.evaluate(node => node === window.initialStagePanel &&
        node.querySelector('[data-gui-stage] canvas') === window.initialStageCanvas));
});

test('startup chooses the layout and the stage menu hides the stage without stopping the project', {timeout: 90_000}, async t => {
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const start = query => page.goto(origin + buildPrefix + 'editor.html?lang=en' + query);
    const anchor = page.getByRole('button', {name: 'TurboWarp Plus layout'});
    const hideStage = page.getByRole('menuitem', {name: 'Hide stage', exact: true});
    const showStage = page.getByRole('menuitem', {name: 'Show stage', exact: true});
    const displayMenu = page.getByRole('button', {name: 'Stage display', exact: true});
    const stage = page.locator('[data-gui-stage] canvas').first();
    const grid = page.locator('[data-standard-target-grid]');
    const toolbox = page.locator('.blocklyToolboxDiv').first();
    await start('&twPlusStandardLayout=0');
    await expect(stage).toBeVisible();
    await expect(anchor).toHaveCount(0);
    await expect(displayMenu).toHaveCount(0);
    await expect(page.getByRole('button', {name: 'Switch to small stage', exact: true})).toBeVisible();
    await expect(toolbox).not.toHaveAttribute('data-horizontal-block-palette');
    await start('&twPlusWindowLayout=1');
    await expect(anchor).toHaveCount(0);
    await expect(toolbox).toHaveAttribute('data-horizontal-block-palette', '');
    await expect(stage).toBeVisible();
    await expect(page.getByRole('button', {name: /^(Hide|Show) stage$/})).toHaveCount(0);
    await expect(displayMenu).toBeVisible();
    await expect(page.getByRole('button', {name: 'Switch to small stage', exact: true})).toHaveCount(0);
    await displayMenu.click();
    await expect(hideStage).toBeVisible();
    await expect(showStage).toHaveCount(0);
    await expect(page.getByRole('menuitemradio', {name: 'Switch to small stage', exact: true})).toBeVisible();
    await expect(page.getByRole('menuitem', {name: 'Enter full screen mode', exact: true})).toBeVisible();
    await page.keyboard.press('Escape');
    const tabs = page.getByRole('tab').filter({hasText: /^(Code|Costumes|Sounds)$/});
    await expect(tabs).toHaveCount(3);
    assert.ok(await tabs.evaluateAll(items => items.every(tab => tab.scrollWidth <= tab.clientWidth &&
        parseFloat(getComputedStyle(tab).paddingInlineStart) >= 12)));
    await expect(page.getByRole('button', {name: 'Add Extension', exact: true})).toHaveCount(0);
    const motion = await page.getByRole('button', {name: 'Motion', exact: true}).boundingBox();
    const toolboxBounds = await toolbox.boundingBox();
    assert.ok(motion.x - toolboxBounds.x < 8);
    await page.getByRole('button', {name: 'Reveal sprite list', exact: true}).hover();
    await page.getByRole('button', {name: 'Pin sprite list', exact: true}).click();
    await expect(grid).toBeVisible();
    const columns = await grid.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' '));
    assert.equal(columns.length, 1);
    const gridBounds = await grid.boundingBox();
    const workspace = page.locator('.blocklySvg').first();
    const splitter = page.getByRole('separator', {name: 'Sprite list and editor width'});
    await expect.poll(async () => {
        const divider = await splitter.boundingBox();
        const panel = await workspace.boundingBox();
        const editor = await workspace.locator('xpath=ancestor::*[contains(@class,"gui_editor-wrapper_")][1]').boundingBox();
        return divider.x + divider.width <= panel.x + 1 && Math.abs(panel.width - editor.width) <= 1;
    }).toBe(true);
    const editorBounds = await workspace.boundingBox();
    const backdrop = grid.getByRole('button', {name: 'Backdrops', exact: true});
    await expect(grid).toHaveAttribute('data-backdrop-placement', 'bottom-right');
    const assertBackdropPosition = async () => {
        const tile = await backdrop.boundingBox();
        const bounds = await grid.boundingBox();
        const viewport = await grid.locator('..').boundingBox();
        assert.ok(Math.abs(bounds.x + bounds.width - tile.x - tile.width - 6) <= 1);
        assert.ok(Math.abs(tile.height - 80) <= 1);
        const gap = viewport.y + viewport.height - tile.y - tile.height;
        assert.ok(gap >= -1 && gap <= 65, JSON.stringify({tile, viewport}));
    };
    await assertBackdropPosition();

    const divider = await splitter.boundingBox();
    assert.ok(gridBounds.x + gridBounds.width <= divider.x && divider.x + divider.width <= editorBounds.x + 1);
    await page.mouse.move(divider.x + divider.width / 2, divider.y + 80);
    await page.mouse.down();
    await page.mouse.move(divider.x + divider.width / 2 + 80, divider.y + 80, {steps: 8});
    await page.mouse.up();
    await expect.poll(async () => Math.round((await grid.boundingBox()).width - gridBounds.width)).toBe(80);
    await expect.poll(async () => Math.round(editorBounds.width - (await workspace.boundingBox()).width)).toBe(80);
    await expect(grid).toHaveAttribute('data-target-columns', '2');
    await assertBackdropPosition();
    const widerDivider = await splitter.boundingBox();
    const gripX = widerDivider.x + widerDivider.width / 2;
    const gripY = widerDivider.y + widerDivider.height / 2;
    await page.mouse.move(gripX, gripY);
    await page.mouse.down();
    await page.mouse.move(gripX + 78, gripY, {steps: 8});
    await expect(grid).toHaveAttribute('data-target-columns', '3');
    await page.mouse.move(gripX + 156, gripY, {steps: 8});
    await page.mouse.up();
    await expect(grid).toHaveAttribute('data-target-columns', '4');
    await assertBackdropPosition();
    await splitter.press('Enter');
    await expect.poll(async () => Math.round((await grid.boundingBox()).width - gridBounds.width)).toBe(0);
    await expect(grid).toHaveAttribute('data-target-columns', '1');
    const stageBounds = await stage.boundingBox();
    assert.ok(gridBounds.x < editorBounds.x && stageBounds.x > editorBounds.x);
    assert.ok(stageBounds.x + stageBounds.width <= 1360 && stageBounds.y < 200);
    assert.equal(await stage.evaluate(canvas => {
        const rect = canvas.getBoundingClientRect();
        return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === canvas;
    }), true);
    const stageGrip = page.locator('[data-stage-resize="left"]');
    const grip = await stageGrip.boundingBox();
    const [stageGripX, stageGripY] = [grip.x + grip.width / 2, grip.y + 90];
    await page.mouse.move(stageGripX, stageGripY);
    await page.mouse.down();
    await page.mouse.move(stageGripX - 80, stageGripY, {steps: 10});
    await page.mouse.up();
    await expect.poll(async () => Math.round((await stage.boundingBox()).width - stageBounds.width)).toBe(80);
    const resizedStage = await stage.boundingBox();
    assert.ok(Math.abs(resizedStage.width / resizedStage.height - stageBounds.width / stageBounds.height) < 0.01);
    assert.ok(Math.abs(resizedStage.x + resizedStage.width - stageBounds.x - stageBounds.width) <= 1);
    assert.ok(Math.abs(resizedStage.y - stageBounds.y) <= 1);

    const bottomGrip = page.locator('[data-stage-resize="bottom"]');
    const bottom = await bottomGrip.boundingBox();
    await page.mouse.move(bottom.x + bottom.width / 2, bottom.y + bottom.height / 2);
    await page.mouse.down();
    await page.mouse.move(bottom.x + bottom.width / 2, bottom.y + bottom.height / 2 - 30, {steps: 8});
    await page.mouse.up();
    await expect.poll(async () => Math.round((await stage.boundingBox()).height - resizedStage.height)).toBe(-30);
    const spriteSettings = page.getByRole('button', {name: 'Sprite', exact: true});
    await expect(spriteSettings).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('textbox', {name: 'Sprite name'})).toBeHidden();

    await expect(grid).toHaveAttribute('data-target-columns', '1');
    await expect.poll(() => grid.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length)).toBe(1);
    await spriteSettings.click();
    const spriteName = page.getByRole('textbox', {name: 'Sprite name'});
    await expect(spriteName).toBeEditable();
    const settings = spriteSettings.locator('..');
    await expect(spriteSettings).toHaveAttribute('aria-expanded', 'true');
    await expect(settings.getByRole('heading', {name: 'Sprite', exact: true})).toHaveCount(0);
    const fields = settings.locator('.tw-sprite-properties__fields > .tw-sprite-properties__field');
    await expect(fields).toHaveCount(6);
    assert.ok(await fields.evaluateAll(nodes => {
        const bounds = nodes[0].parentElement.getBoundingClientRect();
        const left = nodes[0].getBoundingClientRect().left;
        return nodes.every(node => {
            const rect = node.getBoundingClientRect();
            return rect.left === left && rect.right <= bounds.right;
        });
    }));
    const name = await spriteName.inputValue();
    await spriteName.fill('Compact sprite');
    await spriteName.press('Enter');
    await expect.poll(() => page.evaluate(() => vm.editingTarget.getName())).toBe('Compact sprite');
    await spriteName.fill(name);
    await spriteName.press('Enter');
    await expect.poll(() => page.evaluate(() => vm.editingTarget.getName())).toBe(name);
    await spriteSettings.click();
    const addSprite = page.getByRole('button', {name: 'Add a Sprite', exact: true});
    await expect(addSprite).toBeVisible();
    const narrowTile = await backdrop.boundingBox();
    const addBounds = await addSprite.boundingBox();
    assert.ok(narrowTile.y + narrowTile.height <= addBounds.y);
    assert.ok(await backdrop.evaluate(node => {
        const rect = node.getBoundingClientRect();
        return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    }));
    await addSprite.hover();
    await expect.poll(() => addSprite.evaluate(button => getComputedStyle(button, '::after').content))
        .toBe('"Add a Sprite"');
    const paint = page.getByRole('button', {name: 'Paint', exact: true});
    await expect.poll(() => paint.evaluate((node, tile) => {
        const rect = node.getBoundingClientRect();
        const x = rect.x + rect.width / 2;
        const y = rect.y + rect.height / 2;
        return x > tile.x && x < tile.x + tile.width && y > tile.y && y < tile.y + tile.height &&
            node.contains(document.elementFromPoint(x, y));
    }, narrowTile)).toBe(true);
    await page.mouse.move(500, 400);
    await splitter.press('Enter');
    await expect(grid).toHaveAttribute('data-target-columns', '1');

    await expect.poll(() => page.evaluate(() => Boolean(vm.editingTarget))).toBe(true);
    const spriteId = await page.evaluate(async () => {
        const id = vm.editingTarget.id;
        for (let index = 0; index < 16; index++) await vm.duplicateSprite(id);
        vm.setEditingTarget(id);
        window.layoutWorkspace = window.ScratchBlocks.getMainWorkspace();
        window.layoutCanvas = document.querySelector('[data-gui-stage] canvas');
        return id;
    });
    await expect.poll(() => grid.evaluate(node => node.parentElement.scrollHeight > node.parentElement.clientHeight))
        .toBe(true);
    await grid.evaluate(node => { node.parentElement.scrollTop = node.parentElement.scrollHeight; });
    assert.ok(await grid.evaluate(node => node.parentElement.scrollTop > 0));
    await assertBackdropPosition();
    await expect(addSprite).toBeVisible();

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
    await expect.poll(() => page.evaluate(() => Object.values<{opcode: string; x: number}>(vm.editingTarget.blocks._blocks)
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
    await displayMenu.click();
    await hideStage.click();
    await expect(stage).toBeHidden();
    await expect(displayMenu).toBeVisible();
    await expect(displayMenu).toBeFocused();
    await expect.poll(running).toBe(true);

    const costumes = page.getByRole('tab', {name: 'Costumes'});
    await costumes.click();
    await page.evaluate(() => history.replaceState(null, '', '?lang=en&twPlusStandardLayout=0'));
    await expect(costumes).toHaveAttribute('aria-selected', 'true');
    await expect(grid).toBeVisible();
    await expect(splitter).toBeVisible();
    await toggleUndockButtons(page);
    await expect(stage).toBeHidden();
    await expect(costumes).toHaveAttribute('aria-selected', 'true');
    await displayMenu.click();
    await showStage.click();
    await expect(stage).toBeVisible();
    await page.getByRole('tab', {name: 'Code'}).click();
    assert.deepEqual(await page.evaluate(() => ({
        sameWorkspace: window.layoutWorkspace === window.ScratchBlocks.getMainWorkspace(),
        sameCanvas: window.layoutCanvas === document.querySelector('[data-gui-stage] canvas'),
        target: vm.editingTarget.id,
        addedBlock: Object.values<{opcode: string; x: number}>(vm.editingTarget.blocks._blocks).some(block => block.opcode === 'motion_movesteps')
    })), {sameWorkspace: true, sameCanvas: true, target: spriteId, addedBlock: true});
    await expect.poll(running).toBe(true);
    await page.setViewportSize({width: 1050, height: 660});
    await expect(displayMenu).toBeInViewport();
    await expect(stage).toBeInViewport({ratio: 1});
    assert.equal(await grid.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length), 1);

    await page.getByRole('button', {name: 'Backdrops', exact: true}).click();
    await page.getByRole('tab', {name: 'Backdrops', exact: true}).click();
    const backdropActions = page.getByRole('group', {name: 'Add a backdrop', exact: true});
    await expect(backdropActions).toBeVisible();

    await page.goto(origin + buildPrefix + 'editor.html?lang=ja&twPlusWindowLayout=1');
    await page.getByRole('button', {name: 'スプライト一覧を展開', exact: true}).hover();
    const japaneseAdd = page.getByRole('button', {name: 'スプライトを追加する', exact: true});
    await japaneseAdd.hover();
    await expect.poll(() => japaneseAdd.evaluate(button => getComputedStyle(button, '::after').content))
        .toBe('"スプライトを追加する"');
    await expect(page.getByRole('button', {name: 'スプライトを選ぶ', exact: true})).toHaveCount(1);
    const japaneseSettings = page.getByRole('button', {name: 'スプライト', exact: true});
    const japaneseTools = page.getByRole('group', {name: 'スプライト一覧の操作', exact: true});
    const japaneseName = page.getByRole('textbox', {name: 'スプライト名', exact: true});
    await expect(japaneseSettings).toHaveAttribute('aria-expanded', 'false');
    await expect(japaneseTools).toBeVisible();
    await expect(japaneseName).toBeHidden();
    await japaneseSettings.press('Enter');
    await expect(japaneseSettings).toHaveAttribute('aria-expanded', 'true');
    await expect(japaneseName).toBeVisible();
    const [titleBounds, toolsBounds, inputBounds] = await Promise.all(
        [japaneseSettings, japaneseTools, japaneseName].map(locator => locator.boundingBox()));
    assert.ok(titleBounds.y + titleBounds.height <= toolsBounds.y);
    assert.ok(toolsBounds.y + toolsBounds.height <= inputBounds.y);
    await expect(grid).toHaveAttribute('data-target-columns', '1');
    await japaneseSettings.press('Enter');
    await expect(japaneseName).toBeHidden();
    await expect(japaneseTools).toBeVisible();
    await page.getByRole('button', {name: 'ステージの表示', exact: true}).click();
    await expect(page.getByRole('menuitem', {name: 'ステージを隠す', exact: true})).toBeVisible();
    assert.deepEqual(errors, []);
});

test('the default editor reveals the sprite drawer and exposes the detached window layout', {timeout: 60_000}, async t => {
    const secureOrigin = 'https://layout.test';
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix, secureOrigin);
    await page.goto(secureOrigin + buildPrefix + 'editor.html?lang=en');
    const sprites = page.getByRole('button', {name: 'Reveal sprite list', exact: true});
    const pin = page.getByRole('button', {name: 'Pin sprite list', exact: true});
    const undock = page.getByRole('button', {name: 'Undock sprite list', exact: true});
    const backdrop = page.locator('[data-backdrop-placement] img').first();
    await expect(sprites).toHaveAttribute('aria-expanded', 'false');
    await sprites.hover();
    await expect(backdrop).toBeVisible();
    await expect(undock).toBeVisible();
    await page.mouse.move(500, 400);
    await expect(sprites).toHaveAttribute('aria-expanded', 'false');

    await sprites.hover();
    await pin.click();
    await page.mouse.move(500, 400);
    await expect(pin).toHaveAttribute('aria-pressed', 'true');
    await expect(backdrop).toBeVisible();
    await expect(page.getByRole('heading', {name: 'Sprite list', exact: true})).toHaveCount(0);
    const tools = page.getByRole('group', {name: 'Sprite list tools', exact: true});
    const controls = ['Search sprites', 'Pin sprite list', 'Undock sprite list'];
    const buttons = await Promise.all(controls.map(name => tools.getByRole('button', {name, exact: true}).boundingBox()));
    assert.ok(buttons.every(button => button.y === buttons[0].y));
    assert.ok(buttons[0].x < buttons[1].x && buttons[1].x < buttons[2].x);
    await tools.getByRole('button', {name: 'Search sprites'}).click();
    const search = page.getByRole('searchbox', {name: 'Search sprites'});
    await search.fill(await page.evaluate(() => vm.editingTarget.getName()));
    await expect(page.locator('[data-sprite-search-match]')).toBeVisible();
    await search.press('Escape');
    await expect(search).toHaveCount(0);
    await undock.click();
    const window = page.getByRole('region', {name: 'Sprite list', exact: true});
    const menu = window.getByRole('button', {name: 'Window layout', exact: true});
    await expect(window.locator('[data-backdrop-placement]')).toBeVisible();
    await menu.click();
    await expect(window.getByRole('list', {name: 'Window layout'}).getByRole('button')).toHaveCount(6);
    await expect(window.getByRole('button', {name: 'Restore normal window'})).toBeDisabled();
    await expect(window.getByRole('button', {name: 'Open another view of this editor'})).toBeDisabled();
    await window.getByRole('button', {name: 'Maximize this window'}).click();
    await menu.click();
    await expect(window.getByRole('button', {name: 'Maximize this window'})).toBeDisabled();
    await window.getByRole('button', {name: 'Restore normal window'}).click();
    await menu.click();
    await window.getByRole('button', {name: 'Minimize this window'}).click();
    await expect(window).toBeHidden();
    await page.getByRole('button', {name: 'Windows', exact: true}).click();
    await page.getByRole('button', {name: 'Sprite list', exact: true}).click();
    await menu.click();
    await window.getByRole('button', {name: 'Return to the editor (dock)'}).click();
    await expect(window).toHaveCount(0);
    await expect(backdrop).toBeVisible();

    await undock.click();
    await menu.click();
    const [child] = await Promise.all([
        page.waitForEvent('popup'),
        window.getByRole('button', {name: 'Open in a separate window (undock)'}).click()
    ]);
    const popupMenu = child.getByRole('button', {name: 'Window layout', exact: true});
    const commands = child.getByRole('menu', {name: 'Window layout', exact: true});
    const current = commands.getByRole('menuitem', {name: 'Open in a separate window (undock)'});
    const dock = commands.getByRole('menuitem', {name: 'Return to the editor (dock)'});
    await popupMenu.press('ArrowDown');
    await expect(commands.getByRole('menuitem')).toHaveCount(6);
    await expect(current).toBeFocused();
    await expect(current).toHaveAttribute('aria-current', 'true');
    await expect(commands.getByRole('menuitem', {name: 'Maximize this window'})).toBeDisabled();
    await expect(commands.getByRole('menuitem', {name: 'Minimize this window'})).toBeDisabled();
    await expect(commands.getByRole('menuitem', {name: 'Restore normal window'})).toBeDisabled();
    await child.keyboard.press('Escape');
    await expect(popupMenu).toBeFocused();
    await expect(commands).toHaveCount(0);
    await popupMenu.press('ArrowDown');
    await child.keyboard.press('ArrowDown');
    await expect(dock).toBeFocused();
    await Promise.all([child.waitForEvent('close'), child.keyboard.down('Enter').catch(error => {
        if (!child.isClosed()) throw error;
    })]);
    await expect(backdrop).toBeVisible();

});

test('a background code view retains its layout, pan and zoom', {timeout: 45_000}, async t => {
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix);
    await page.goto(origin + buildPrefix + 'editor.html?lang=en');
    await page.waitForFunction(() => window.vm?.editingTarget?.isOriginal && window.ScratchBlocks?.getMainWorkspace());
    await page.getByRole('tab', {name: 'Code', exact: true}).focus();
    await page.getByRole('button', {name: 'Open in another window', exact: true}).press('Enter');

    const first = page.getByRole('region', {name: /^Code · /}).first();
    const canvas = first.locator('.tw-dockable-panel--floating .blocklySvg .blocklyBlockCanvas');
    await expect(first.locator('.tw-dockable-panel--floating .blocklySvg').first()).toBeVisible();
    await page.evaluate(() => {
        const {ScratchBlocks} = window;
        const workspace = ScratchBlocks.getMainWorkspace();
        const xml = ScratchBlocks.Xml.textToDom('<xml><block id="preview-block" type="looks_show" x="180" y="75"/></xml>');
        ScratchBlocks.Xml.domToWorkspace(xml, workspace);
        ScratchBlocks.Events.fireNow_();
    });
    await expect(canvas.locator('[data-id="preview-block"]')).toBeVisible();
    await first.locator('[data-plus-zoom-action="in"]').click();
    await page.evaluate(() => {
        const workspace = window.ScratchBlocks.getMainWorkspace();
        workspace.scrollX = -29;
        workspace.scrollY = 10;
        const {absoluteLeft, absoluteTop} = workspace.getMetrics();
        workspace.translate(workspace.scrollX + absoluteLeft, workspace.scrollY + absoluteTop);
    });
    const transform = await canvas.getAttribute('transform');

    await first.getByRole('button', {name: 'Window layout'}).click();
    await first.getByRole('button', {name: 'Open another view of this editor'}).click();
    const preview = first.locator('[data-code-preview]');
    const chrome = preview.locator('[data-code-preview-chrome]');
    await expect(preview.locator('.blocklySvg .blocklyBlockCanvas')).toHaveAttribute('transform', transform);
    await expect(preview.locator('.blocklySvg .blocklyMainBackground')).toHaveCSS('fill', /url\(/);
    await expect(chrome.locator('[data-horizontal-block-palette]')).toBeVisible();
    await expect(chrome.locator('[data-workspace-minimap]')).toBeVisible();
    await expect(chrome.locator('[data-plus-horizontal-zoom]')).toBeVisible();
    await expect(chrome.locator('[data-plus-workspace-watermark] img')).toBeVisible();
    await expect(chrome).toHaveAttribute('inert', '');
    await expect(page.getByRole('region', {name: /^Code · /}).nth(1)
        .locator('.tw-dockable-panel--floating [data-horizontal-block-palette]')).toBeVisible();
});

test('a background sprite code window fits scripts when the foreground shows none', {timeout: 30_000}, async t => {
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix);
    await page.addInitScript(() => localStorage.setItem('tw:theme', 'dark'));
    await page.goto(origin + buildPrefix + 'editor.html?lang=en');
    await page.waitForFunction(() => window.vm?.editingTarget?.isOriginal && window.ScratchBlocks?.getMainWorkspace());
    await page.evaluate(async () => {
        const sprite = vm.editingTarget;
        vm.renameSprite(sprite.id, 'Preview sprite');
        await vm.duplicateSprite(sprite.id);
        vm.renameSprite(vm.editingTarget.id, 'Editing sprite');
        for (const [id, x, y] of [['preview-first', 2200, 1800], ['preview-last', 2600, 2200]]) {
            sprite.blocks.createBlock({id, x, y, opcode: 'looks_show', fields: {}, inputs: {},
                shadow: false, topLevel: true, parent: null, next: null});
        }
    });

    await page.getByRole('button', {name: 'Reveal sprite list', exact: true}).hover();
    await page.getByRole('button', {name: 'Pin sprite list', exact: true}).click();
    const tile = name => page.locator('[class*="sprite-selector-item_sprite-name"]').getByText(name, {exact: true});
    const openCodeWindow = async name => {
        await tile(name).click({button: 'right'});
        await page.locator('.react-contextmenu--visible').getByRole('menuitem', {name: 'Open', exact: true}).click();
    };
    await openCodeWindow('Preview sprite');
    const back = page.getByRole('region', {name: 'Code · Preview sprite', exact: true});
    await expect(back.locator('.tw-dockable-panel--floating .blocklySvg').first()).toBeVisible();
    // The native editor may automatically pan towards a distant script when the window opens.
    await page.evaluate(() => {
        const workspace = window.ScratchBlocks.getMainWorkspace();
        const {absoluteLeft, absoluteTop} = workspace.getMetrics();
        workspace.scrollX = 0;
        workspace.scrollY = 0;
        workspace.translate(absoluteLeft, absoluteTop);
    });
    await openCodeWindow('Editing sprite');
    const front = page.getByRole('region', {name: 'Code · Editing sprite', exact: true});
    await expect(front.locator('.tw-dockable-panel--floating .blocklySvg').first()).toBeVisible();

    const preview = back.locator('[data-code-preview] .blocklySvg');
    await expect.poll(() => preview.evaluate(svg => {
        const area = svg.getBoundingClientRect();
        return ['preview-first', 'preview-last'].every(id => {
            const block = svg.querySelector(`[data-id="${id}"]`)?.getBoundingClientRect();
            return block?.width > 0 && block.height > 0 && block.left >= area.left && block.top >= area.top &&
                block.right <= area.right && block.bottom <= area.bottom;
        });
    })).toBe(true);
    assert.equal(await page.evaluate(() => vm.editingTarget.getName()), 'Editing sprite');
});

test('the default editor expands the Backpack at the bottom edge', {timeout: 30_000}, async t => {
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix);
    await page.goto(origin + buildPrefix + 'editor.html?lang=en');
    const backpack = page.getByRole('button', {name: 'Reveal Backpack', exact: true});
    const workspace = page.locator('.blocklySvg').first();
    const map = page.locator('[data-workspace-minimap]');
    const zoom = page.locator('[data-plus-horizontal-zoom]');
    await expect(backpack).toHaveAttribute('aria-expanded', 'false');
    await expect(workspace).toBeVisible();
    const height = (await workspace.boundingBox()).height;
    await backpack.hover();
    await expect(backpack).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', {name: 'Undock Backpack', exact: true})).toBeVisible();
    await expect.poll(async () => (await workspace.boundingBox()).height).toBeLessThan(height);
    const mapBounds = await map.boundingBox();
    const zoomBounds = await zoom.boundingBox();
    const trigger = await backpack.boundingBox();
    assert.ok(mapBounds.y + mapBounds.height < zoomBounds.y && zoomBounds.y + zoomBounds.height < trigger.y);
    await page.mouse.move(500, 400);
    await expect(backpack).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(async () => (await workspace.boundingBox()).height).toBe(height);
});

test('utility panels and menus stay above the code workspace and its palette', {timeout: 45_000}, async t => {
    // The Backpack transfer session uses crypto.randomUUID in a secure context.
    const secureOrigin = 'https://layout.test';
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix, secureOrigin);
    await page.goto(secureOrigin + buildPrefix + 'editor.html?lang=en');

    await page.getByRole('button', {name: 'Motion', exact: true}).click();
    const flyout = page.locator('.blocklyFlyout').first();
    await expect(flyout).toBeVisible();
    // Keep the flyout open while exercising the menu's click handler.
    await page.getByText('File', {exact: true}).evaluate(node => (node as HTMLElement).click());
    const fileMenu = page.locator('[class*="menu_menu_"]').filter({hasText: /Save/});
    await expect(fileMenu).toBeVisible();
    assert.ok(await fileMenu.evaluate((menu, palette) => {
        const bounds = menu.getBoundingClientRect();
        const x = Math.max(bounds.left, palette.x) + 8;
        const y = Math.max(bounds.top, palette.y) + 8;
        return x < Math.min(bounds.right, palette.x + palette.width) &&
            y < Math.min(bounds.bottom, palette.y + palette.height) &&
            menu.contains(document.elementFromPoint(x, y));
    }, await flyout.boundingBox()));
    await page.keyboard.press('Escape');

    await page.getByRole('tab', {name: 'Code', exact: true}).focus();
    await page.getByRole('button', {name: 'Open in another window', exact: true}).click();
    const code = page.getByRole('region', {name: /^Code · /});
    await code.getByRole('button', {name: 'Window layout'}).click();
    await code.getByRole('button', {name: 'Maximize this window'}).click();

    const sprites = page.getByRole('button', {name: 'Reveal sprite list', exact: true});
    await sprites.hover();
    await expect(sprites).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', {name: 'Undock sprite list', exact: true}).click();
    const spriteWindow = page.getByRole('region', {name: 'Sprite list', exact: true});
    await expect(spriteWindow).toBeVisible();
    await code.click({position: {x: 780, y: 430}});
    await spriteWindow.getByRole('button', {name: 'Window layout'}).click();
    await expect(spriteWindow.getByRole('list', {name: 'Window layout'})).toBeVisible();
    await page.keyboard.press('Escape');

    const backpack = page.getByRole('button', {name: 'Reveal Backpack', exact: true});
    await backpack.hover();
    await expect(backpack).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', {name: 'Undock Backpack', exact: true}).click();
    const backpackWindow = page.getByRole('region', {name: 'Backpack', exact: true});
    await expect(backpackWindow).toBeVisible();
    await code.click({position: {x: 780, y: 430}});
    await backpackWindow.getByRole('button', {name: 'Window layout'}).click();
    await expect(backpackWindow.getByRole('list', {name: 'Window layout'})).toBeVisible();
    await page.keyboard.press('Escape');
    await code.getByRole('button', {name: 'Window layout'}).click();
    await code.getByRole('button', {name: 'Return to the editor (dock)'}).click();
    await expect(code).toHaveCount(0);
});

test('the Dockview opt-in splits one sprite editor and restores each view section', {timeout: 45_000}, async t => {
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix);
    page.setDefaultTimeout(8_000);
    const url = origin + buildPrefix + 'editor.html?lang=en';
    const groups = page.locator('.dv-groupview');
    await page.goto(url);
    await expect(page.getByRole('tab', {name: 'Code', exact: true})).toBeVisible();
    await expect(groups).toHaveCount(1);
    await expect(groups.getByRole('button', {name: 'Editor panel layout'})).toHaveCount(0);

    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url + '&twPlusDockview=1');
    await expect(groups).toHaveCount(1);
    const spriteName = await page.evaluate(() => window.vm.editingTarget.getName());
    const tabs = () => page.getByRole('tab', {name: spriteName, exact: true});
    const toolbar = page.locator('.tw-plus-sprite-toolbar[data-active-group="true"]:visible');
    const section = (name: string) => toolbar.getByRole('tab', {name, exact: true});
    const menu = (group: ReturnType<typeof page.locator>) => group.getByRole('button', {name: 'Editor panel layout'});
    await expect(tabs()).toHaveCount(1);
    await page.evaluate(() => document.documentElement.style.setProperty('--ui-white', 'rgb(38, 47, 65)'));
    await expect(groups.first().getByRole('tab', {name: spriteName, exact: true}))
        .toHaveCSS('background-color', 'rgb(38, 47, 65)');
    await page.evaluate(() => document.documentElement.style.removeProperty('--ui-white'));
    await expect.poll(() => page.evaluate(() => Boolean(window.ScratchBlocks?.getMainWorkspace()))).toBe(true);
    const blockId = await page.evaluate(() => {
        const workspace = window.ScratchBlocks.getMainWorkspace();
        const block = workspace.newBlock('motion_movesteps');
        block.initSvg();
        block.render();
        const center = workspace.centerOnBlock.bind(workspace);
        workspace.centerOnBlock = id => {
            document.documentElement.dataset.testCenteredBlock = id;
            center(id);
        };
        return block.id;
    });
    const search = toolbar.getByRole('combobox', {name: 'Search within this sprite'});
    await search.fill('move');
    await search.press('ArrowDown');
    await search.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-test-centered-block', blockId);
    await section('Costumes').click();
    await expect(section('Costumes')).toHaveAttribute('aria-selected', 'true');

    await menu(groups.first()).click();
    await page.getByRole('menuitem', {name: 'Split right'}).click();
    await expect(groups).toHaveCount(2);
    await expect(tabs()).toHaveCount(2);
    await expect(section('Costumes')).toHaveAttribute('aria-selected', 'true');
    await section('Code').click();
    await expect(section('Code')).toHaveAttribute('aria-selected', 'true');
    await groups.first().getByRole('tab', {name: spriteName, exact: true}).click();
    await expect(section('Costumes')).toHaveAttribute('aria-selected', 'true');
    await groups.last().getByRole('tab', {name: spriteName, exact: true}).click();
    await expect(section('Code')).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => page.evaluate(() => window.vm.editingTarget.getName())).toBe(spriteName);

    await menu(groups.last()).click();
    await page.getByRole('menuitem', {name: 'Close this split'}).click();
    await expect(groups).toHaveCount(1);
    await expect(section('Costumes')).toHaveAttribute('aria-selected', 'true');
    await menu(groups.first()).click();
    await expect(page.getByRole('menuitem', {name: 'Close this split'})).toBeDisabled();
    await page.getByRole('menuitem', {name: 'Split below'}).click();
    await expect(groups).toHaveCount(2);
    const upper = await groups.first().boundingBox();
    const lower = await groups.last().boundingBox();
    assert(upper && lower && lower.y > upper.y);
    await groups.last().getByRole('button', {name: 'Close ' + spriteName, exact: true}).click();
    await expect(groups).toHaveCount(1);
    assert.deepEqual(errors, []);
});

test('the Dockview asset connection restores the native costume and sound selection per pane', {timeout: 45_000}, async t => {
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix);
    page.setDefaultTimeout(8_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + buildPrefix + 'editor.html?lang=en&twPlusDockview=1');
    const groups = page.locator('.dv-groupview');
    await expect(groups).toHaveCount(1);
    await page.evaluate(async prefix => {
        const vm = window.vm;
        const target = vm.editingTarget;
        target.createVariable('dockview-counter', 'Pane counter', '', false);
        target.variables['dockview-counter'].value = 9;
        await vm.duplicateCostume(0);
        vm.renameCostume(0, 'Pane costume A');
        vm.renameCostume(1, 'Pane costume B');
        for (let i = 0; i < 11; i++) {
            await vm.duplicateCostume(target.getCostumes().length - 1);
            vm.renameCostume(target.getCostumes().length - 1, 'Extra outfit ' + i);
        }
        const response = await fetch(prefix + 'static/blocks-media/default/delete.wav');
        if (!response.ok) throw new Error('Missing GUI sound fixture');
        const storage = vm.runtime.storage;
        const asset = storage.createAsset(storage.AssetType.Sound, storage.DataFormat.WAV,
            new Uint8Array(await response.arrayBuffer()), null, true);
        const sound = {asset, md5: asset.assetId + '.wav'};
        await vm.addSound({...sound, name: 'Pane sound A'}, target.id);
        await vm.addSound({...sound, name: 'Pane sound B'}, target.id);
    }, buildPrefix);
    const spriteName = await page.evaluate(() => window.vm.editingTarget.getName());
    const toolbar = page.locator('.tw-plus-sprite-toolbar[data-active-group="true"]:visible');
    const section = (name: string) => toolbar.getByRole('tab', {name, exact: true});
    const editor = page.locator('.tw-plus-sprite-tab-editor:visible');
    const card = (name: string) => editor.locator('[class*="selector_list-item_"]:visible').filter({hasText: name});
    const selectedItem = '[class*="selector_list-item_"][class*="sprite-selector-item_is-selected_"]:visible';
    const selected = editor.locator(selectedItem);
    const choose = async (name: string) => {
        await card(name).click();
        await expect(selected).toContainText(name);
    };
    const preview = page.locator('.tw-plus-sprite-tab-asset-preview:visible');
    const previewSelected = preview.locator(selectedItem);
    const bounds = async (pane: ReturnType<typeof page.locator>) => {
        const list = await pane.locator('[class*="selector_wrapper_"]').boundingBox();
        const body = await pane.locator('[class*="asset-panel_detail-area_"]').boundingBox();
        assert(list && body);
        return {list: list.width, detail: body.width, height: body.height};
    };
    const sameBounds = (before: {list: number; detail: number; height: number}, after: typeof before) => {
        for (const key of ['list', 'detail', 'height'] as const) {
            assert(Math.abs(before[key] - after[key]) <= 2, key + ': ' + before[key] + ' vs ' + after[key]);
        }
    };
    const activate = (index: number) => groups.nth(index).getByRole('tab', {name: spriteName, exact: true}).click();

    await section('Costumes').click();
    await choose('Pane costume A');
    await groups.first().getByRole('button', {name: 'Editor panel layout'}).click();
    await page.getByRole('menuitem', {name: 'Split right'}).click();
    await expect(groups).toHaveCount(2);
    await expect(selected).toContainText('Pane costume A');
    await activate(0);
    const costumeLayout = await bounds(editor);
    const listArea = '[class*="selector_list-area_"]';
    await editor.locator(listArea).evaluate(node => {
        node.scrollTop = 48;
        node.dispatchEvent(new Event('scroll', {bubbles: true}));
    });
    await activate(1);
    await choose('Pane costume B');
    await expect(previewSelected).toContainText('Pane costume A');
    sameBounds(costumeLayout, await bounds(preview));
    await expect.poll(() => preview.locator(listArea).evaluate(node => node.scrollTop)).toBe(48);
    await expect(preview.getByRole('img', {name: 'Pane costume A'})).toBeVisible();
    // The first click resumes the pane, even when it lands on another costume.
    const otherCard = await preview.locator('[class*="selector_list-item_"]').filter({hasText: 'Pane costume B'}).boundingBox();
    assert(otherCard);
    await page.mouse.click(otherCard.x + otherCard.width / 2, otherCard.y + otherCard.height / 2);
    await expect(selected).toContainText('Pane costume A');
    await expect.poll(() => editor.locator(listArea).evaluate(node => node.scrollTop)).toBe(48);
    assert.equal(await page.evaluate(() => window.vm.editingTarget.getCurrentCostume().name), 'Pane costume B');
    await activate(1);
    await expect(selected).toContainText('Pane costume B');

    await section('Sounds').click();
    await choose('Pane sound A');
    await activate(0);
    await section('Sounds').click();
    const search = toolbar.getByRole('combobox', {name: 'Search within this sprite'});
    await search.fill('Pane sound B');
    await page.getByRole('option', {name: 'Pane sound B'}).click();
    await expect(selected).toContainText('Pane sound B');
    const soundLayout = await bounds(editor);
    await activate(1);
    await expect(selected).toContainText('Pane sound A');
    await expect(previewSelected).toContainText('Pane sound B');
    await expect(preview.getByRole('img', {name: 'Waveform: Pane sound B'})).toBeVisible();
    sameBounds(soundLayout, await bounds(preview));
    await preview.focus();
    await page.keyboard.press('Enter');
    await expect(selected).toContainText('Pane sound B');
    await expect(page.locator('[class*="sound-editor_waveform-container_"]:visible')).toBeVisible();
    await section('Code').click();
    await section('Sounds').click();
    await expect(selected).toContainText('Pane sound B');

    await page.evaluate(async () => {
        const vm = window.vm;
        await vm.duplicateSprite(vm.editingTarget.id);
        vm.renameSprite(vm.editingTarget.id, 'Other pane sprite');
        const index = vm.editingTarget.getSounds().findIndex(sound => sound.name === 'Pane sound A');
        vm.renameSound(index, 'Other sprite sound');
    });
    await expect.poll(() => page.evaluate(() => window.vm.editingTarget.getName())).toBe('Other pane sprite');
    await expect(preview.getByRole('img', {name: 'Waveform: Pane sound A'})).toBeVisible();
    await expect(preview.getByText('Other sprite sound', {exact: true})).toHaveCount(0);
    await activate(0);
    await expect.poll(() => page.evaluate(() => window.vm.editingTarget.getName())).toBe(spriteName);
    await expect(selected).toContainText('Pane sound B');

    await section('Variables').click();
    const viewIds = await Promise.all([0, 1].map(index => groups.nth(index)
        .getByRole('tab', {name: spriteName, exact: true}).getAttribute('data-tab-panel-id')));
    const variable = (group: number) => page.locator('[id="' + viewIds[group] + '-content"]')
        .getByRole('textbox', {name: 'Pane counter'});
    const first = variable(0);
    await expect(first).toBeEditable();
    const width = (await first.boundingBox()).width;
    await first.fill('17');
    await activate(1);
    await section('Variables').click();
    await expect(first).not.toBeEditable();
    await expect(first).toHaveValue('17');
    assert.equal((await first.boundingBox()).width, width);
    await expect(variable(1)).toHaveValue('17');
    await first.click();
    await expect(first).toBeEditable();
    await expect(first).toHaveValue('17');
    await expect(variable(1)).not.toBeEditable();
    await first.fill('23');
    await first.press('Enter');
    await expect(variable(1)).toHaveValue('23');
    assert.equal(await page.evaluate(() => window.vm.editingTarget.variables['dockview-counter'].value), 23);
    assert.deepEqual(errors, []);
});

test('two Dockview code panes keep independent positions and zoom for the same sprite', {timeout: 45_000}, async t => {
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + buildPrefix + 'editor.html?lang=en&twPlusDockview=1');
    await page.waitForFunction(() => window.vm?.editingTarget?.isOriginal && window.ScratchBlocks?.getMainWorkspace());
    const targetId = await page.evaluate(() => window.vm.editingTarget.id);
    await page.evaluate(() => {
        const blocks = window.ScratchBlocks;
        const xml = blocks.Xml.textToDom('<xml><block id="pane-block" type="looks_show" x="420" y="360"/>' +
            '<block id="pane-distant-block" type="looks_hide" x="980" y="860"/></xml>');
        blocks.Xml.domToWorkspace(xml, blocks.getMainWorkspace());
        blocks.Events.fireNow_();
    });

    const groups = page.locator('.dv-groupview');
    const editor = page.locator('.tw-plus-sprite-tab-editor:visible');
    const preview = (group: number) => groups.nth(group).getByRole('button', {name: 'Edit code in this pane'});
    const canvas = (scope: ReturnType<typeof page.locator>) =>
        scope.locator('.blocklyBlockCanvas').filter({has: page.locator('[data-id="pane-block"]')});
    const readViewport = (scope: ReturnType<typeof page.locator>) => canvas(scope).evaluate(node => {
        const {a, e, f} = (node as SVGGraphicsElement).transform.baseVal.consolidate().matrix;
        return [Math.round(e), Math.round(f), Math.round(a * 100)];
    });
    const setViewport = (scale: number, x: number, y: number) => page.evaluate(({scale, x, y}) => {
        const workspace = window.ScratchBlocks.getMainWorkspace();
        workspace.setScale(scale);
        const metrics = workspace.getMetrics();
        workspace.scrollbar.set(metrics.absoluteLeft - x - metrics.contentLeft,
            metrics.absoluteTop - y - metrics.contentTop);
    }, {scale, x, y});
    await expect(canvas(editor)).toBeVisible();
    await groups.first().getByRole('button', {name: 'Editor panel layout'}).click();
    await page.getByRole('menuitem', {name: 'Split right'}).click();
    await expect(groups).toHaveCount(2);
    await expect(preview(0)).toBeVisible();

    await setViewport(1.1, -247, -189);
    const right = await readViewport(editor);
    await preview(0).click();
    await expect(preview(1)).toBeVisible();
    await setViewport(0.75, -85, -46);
    const left = await readViewport(editor);
    assert.notEqual(left[0], right[0]);
    assert.notEqual(left[1], right[1]);
    assert.notEqual(left[2], right[2]);
    await expect.poll(() => readViewport(preview(1))).toEqual(right);

    await preview(1).press('Enter');
    await expect.poll(() => readViewport(editor)).toEqual(right);
    await expect.poll(() => readViewport(preview(0))).toEqual(left);
    await page.evaluate(() => {
        const blocks = window.ScratchBlocks;
        const xml = blocks.Xml.textToDom('<xml><block id="pane-added-block" type="looks_show" x="450" y="380"/></xml>');
        blocks.Xml.domToWorkspace(xml, blocks.getMainWorkspace());
        blocks.Events.fireNow_();
    });
    await expect(preview(0).locator('[data-id="pane-added-block"]')).toBeAttached();

    await preview(0).click();
    await expect.poll(() => readViewport(editor)).toEqual(left);
    const toolbar = page.locator('.tw-plus-sprite-toolbar[data-active-group="true"]:visible');
    await toolbar.getByRole('tab', {name: 'Costumes', exact: true}).click();
    await toolbar.getByRole('tab', {name: 'Code', exact: true}).click();
    await expect.poll(() => readViewport(editor)).toEqual(left);
    assert.equal(await page.evaluate(() => window.vm.editingTarget.id), targetId);
    assert.deepEqual(errors, []);
});
