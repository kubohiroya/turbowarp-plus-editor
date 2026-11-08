import {verifyWebEditor} from '../scripts/site/editor-revision.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium, expect, type Page} from '@playwright/test';
import JSZip from '@turbowarp/jszip';
import editorPackage from '../package.json' with {type: 'json'};
import pinnedGui from './pinned-gui.ts';
import {
    layoutMenu, openDisplaySettings, projectInfoMenuButton, readUndockButtonsChecked, toggleUndockButtons, undockButtons
} from './fixtures/layout-menu.ts';

const types = {
    '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
    '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm'
};
const origin = 'http://layout.test';
const buildPrefix = process.env.E2E_PATH_PREFIX || '/';
const bareBuild = process.env.E2E_LAYOUT_BARE_BUILD;
const projectSearch = (page: Page) => page.getByRole('combobox', {name: 'Search project'});

async function openBrowser(t, root, prefix = '/', routeOrigin = origin, bareGui = false) {
    if (!bareGui) await verifyWebEditor(root);
    const browser = await chromium.launch({args: ['--enable-unsafe-swiftshader']});
    t.after(() => browser.close());
    const context = await browser.newContext({viewport: {width: 1360, height: 900}});
    await context.addInitScript(() => {delete window.showSaveFilePicker;});
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

test('the browser tab follows the current project title', {timeout: 30_000}, async t => {
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix);
    page.on('dialog', dialog => dialog.accept());
    await page.goto(origin + buildPrefix + 'editor.html?lang=en');
    const title = page.getByPlaceholder('Project title here');
    await expect(title).toHaveValue('Project');
    await expect(page).toHaveTitle('Project - TurboWarp Plus Editor');

    await title.fill('秋の作品');
    await title.press('Enter');
    await expect(page).toHaveTitle('秋の作品 - TurboWarp Plus Editor');

    await title.fill('');
    await title.press('Enter');
    await expect(page).toHaveTitle('TurboWarp Plus Editor');

    const bytes = await page.evaluate(async () => Array.from(await vm.saveProjectSb3('uint8array') as Uint8Array));
    const openFileMenu = () => page.getByText('File', {exact: true}).click();
    await openFileMenu();
    const chooser = page.waitForEvent('filechooser');
    await page.getByText('Open SB3 File…', {exact: true}).click();
    await (await chooser).setFiles({
        name: '読み込んだ作品.sb3',
        mimeType: 'application/octet-stream',
        buffer: Buffer.from(bytes)
    });
    await expect(title).toHaveValue('読み込んだ作品');
    await expect(page).toHaveTitle('読み込んだ作品 - TurboWarp Plus Editor');

    await openFileMenu();
    await page.getByText('Create New Project', {exact: true}).click();
    await expect(title).toHaveValue('Project');
    await expect(page).toHaveTitle('Project - TurboWarp Plus Editor');
});

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
    const display = await openDisplaySettings(page);
    await display.getByText('Accent', {exact: true}).click();
    await display.getByText('Blue', {exact: true}).click();
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
    await page.getByRole('button', {name: 'Save As…', exact: true}).click();
    await page.getByRole('dialog', {name: 'Save As'}).getByRole('button', {name: 'Save', exact: true}).click();
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
    const page = await openBrowser(t, path.resolve(bareBuild), '/', origin, true);
    await page.goto(origin + '/editor.html?lang=en&twPlusWindowLayout=1');
    await expect(page.getByRole('button', {name: 'Add Extension', exact: true})).toBeVisible();
    await expect(page.locator('[data-gui-stage] canvas').first()).toBeVisible();
    await expect(page.getByRole('button', {name: 'Show undock buttons'})).toHaveCount(0);
    await expect(page.getByRole('separator')).toHaveCount(0);
    await expect(page.getByText('Settings', {exact: true})).toBeVisible();
    await expect(page.getByText('Addons', {exact: true})).toBeVisible();
    await expect(page.getByText('Advanced', {exact: true})).toBeVisible();
    await page.getByText('Edit', {exact: true}).click();
    await expect(page.getByText('Turn on Turbo Mode', {exact: true})).toBeVisible();
    await expect(page.getByText('Advanced Settings', {exact: true})).toBeVisible();
});

test('the Plus File menu groups project settings and opens the extension library', {timeout: 30_000}, async t => {
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
    const extensions = page.getByRole('button', {name: '機能拡張…', exact: true});
    const item = page.getByRole('listitem').filter({has: extensions});
    await expect(item.locator('[data-file-menu-icon="extension"]')).toBeVisible();
    await extensions.press('Enter');
    await add.click();
    await expect(page.getByText('機能拡張を作品に追加する', {exact: true})).toBeVisible();
    await expect(add).toBeHidden();

    await start('&twPlusStandardLayout=0&twPlusExtensionFileMenu=1');
    await expect(paletteButton).toBeVisible();
    await openFile();
    await expect(add).toHaveCount(0);
});

test('the first menu row orders the Plus logo, project title, File, Edit, and search', {timeout: 30_000}, async t => {
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix);
    await page.goto(origin + buildPrefix + 'editor.html?lang=ja');
    const label = 'TurboWarp Plus プロジェクト情報';
    const logo = page.getByLabel(label, {exact: true}).first();
    const row = logo.locator('../..');
    const title = row.getByRole('textbox');
    const file = row.getByText('ファイル', {exact: true});
    const edit = row.getByText('編集', {exact: true});
    const search = row.getByRole('combobox', {name: '作品全体を検索'});
    const controls = [logo, title, file, edit, search];

    for (const control of controls) await expect(control).toBeVisible();
    await expect(logo).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const positions = await Promise.all(controls.map(control => control.boundingBox()));
    for (let index = 1; index < positions.length; index++) {
        const previous = positions[index - 1];
        const current = positions[index];
        assert.ok(previous.x + previous.width <= current.x);
        assert.ok(Math.abs(previous.y + previous.height / 2 - current.y - current.height / 2) <= 2);
    }
    await expect(page.locator('.dv-tabs-and-actions-container').getByRole('combobox')).toHaveCount(0);
    await expect(page.getByRole('combobox', {name: '作品全体を検索'})).toHaveCount(1);

    await logo.focus();
    await page.keyboard.press('Tab');
    await expect(title).toBeFocused();
    await title.fill('検索の配置');
    await title.press('Enter');
    await expect(title).toHaveValue('検索の配置');
    await page.keyboard.press('Control+f');
    await expect(search).toBeFocused();

    await logo.click();
    const menu = page.getByRole('navigation', {name: label});
    const links = menu.getByRole('link');
    await expect(logo).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(menu.getByRole('separator')).toBeVisible();
    await expect(menu.locator('hr + a')).toHaveText('ソースコード');
    await expect(links.first()).toHaveText(`TurboWarp Plus Editor ${editorPackage.version}について`);
    for (const name of ['ソースコード', 'ライセンスとクレジット']) {
        const link = menu.getByRole('link', {name, exact: true});
        await expect(link.locator('svg[aria-hidden="true"][fill="currentColor"]')).toBeVisible();
    }
    await expect(menu.getByRole('button', {name: /ピン留め/})).toHaveCount(0);
    await page.keyboard.press('Escape');
    for (const control of controls) await expect(control).toBeVisible();
});

test('extension controls sit at the end of the menu bar and the stage can still shrink', {timeout: 45_000}, async t => {
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix);
    await page.setViewportSize({width: 1024, height: 800});
    await page.goto(origin + buildPrefix + 'editor.html?lang=en&twPlusDockview=0&twPlusStageDrawer=0');
    const menuBar = projectInfoMenuButton(page).locator('../../..');
    const controls = menuBar.getByRole('group', {name: 'Extension controls', exact: true});
    const stage = page.locator('[data-plus-stage-frame]');
    const canvas = stage.locator('canvas').first();
    const resize = page.locator('[data-stage-resize="left"]');
    await expect(canvas).toBeVisible();
    await expect(controls).toHaveCount(0);
    const originalWidth = (await canvas.boundingBox()).width;
    await page.waitForFunction(() =>
        Boolean(document[Symbol.for('@kubohiroya/turbowarp-app-shell/runtime-controls-dock/v1')]));
    await page.evaluate(() => {
        const dock = document[Symbol.for('@kubohiroya/turbowarp-app-shell/runtime-controls-dock/v1')];
        const panel = document.createElement('button');
        panel.textContent = 'Camera settings panel';
        Object.assign(panel.style, {position: 'fixed', width: '320px'});
        const camera = dock.stageControls.addButton({id: 'camera', label: 'Camera', text: 'Camera', icon: '📷',
            onClick() {
                const open = dock.getSnapshot().expanded;
                camera.update({expanded: !open});
                dock.placePanel(open ? null : panel);
                if (open) camera.focus();
            }});
        panel.onclick = () => {
            camera.update({expanded: false});
            dock.placePanel(null);
            camera.focus();
        };
        camera.update({visible: true});
        for (const [id, label, icon] of [['model', 'Teachable Machine', '🧠'], ['debug', 'Debug', '⚙']]) {
            dock.stageControls.addButton({id, label, text: label, icon, onClick() {}}).update({visible: true});
        }
    });
    const camera = controls.getByRole('button', {name: 'Camera', exact: true});
    await expect(controls.getByRole('button')).toHaveCount(3);
    await expect(controls).toHaveCSS('border-top-left-radius', '8px');
    await expect(stage.locator('[data-extension-stage-control]')).toHaveCount(0);
    await expect(stage.getByTitle('Go', {exact: true})).toBeVisible();
    await expect(stage.getByTitle('Stop', {exact: true})).toBeVisible();
    const [barBounds, controlsBounds, cameraBounds] =
        await Promise.all([menuBar.boundingBox(), controls.boundingBox(), camera.boundingBox()]);
    // The frame is one of the menu bar's own controls: its height is the row's button height, it is
    // centred in the row, and it keeps the row's half-rem margin at the right edge.
    assert.equal(controlsBounds.height, 32);
    assert.equal(barBounds.x + barBounds.width - controlsBounds.x - controlsBounds.width, 8);
    assert.ok(Math.abs((controlsBounds.y - barBounds.y) -
        (barBounds.height - controlsBounds.height) / 2) <= 1);
    assert.ok(cameraBounds.height < controlsBounds.height);
    assert.equal((await canvas.boundingBox()).width, originalWidth);
    await resize.press('Home');
    await expect.poll(async () => (await canvas.boundingBox()).width).toBeLessThan(originalWidth);

    await camera.press('Enter');
    const panel = page.getByRole('button', {name: 'Camera settings panel'});
    await expect(panel).toBeInViewport({ratio: 1});
    await expect(camera).toHaveAttribute('aria-expanded', 'true');
    await panel.click();
    await expect(panel).toHaveCount(0);
    await expect(camera).toBeFocused();

    await stage.getByRole('button', {name: 'Stage display', exact: true}).click();
    await stage.getByRole('menuitem', {name: 'Enter full screen mode', exact: true}).click();
    await expect(controls).toHaveCount(0);
    await expect(page.getByRole('button', {name: 'Camera', exact: true})).toBeVisible();
    await page.getByAltText('Exit full screen mode', {exact: true}).click();
    await expect(camera).toBeVisible();
});

test('the enabled debugger opens from the extension controls even without project extensions', {timeout: 30_000}, async t => {
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix);
    const editor = origin + buildPrefix + 'editor.html?lang=en';
    const group = page.getByRole('group', {name: 'Extension controls', exact: true});
    const debuggerButton = page.locator('.sa-debugger-container');
    await page.goto(editor);
    await expect(projectInfoMenuButton(page)).toBeVisible();
    await expect(debuggerButton).toHaveCount(0);
    await expect(group).toHaveCount(0);

    const settings = await page.context().newPage();
    await settings.goto(origin + buildPrefix + 'addons.html?lang=en');
    await settings.getByRole('textbox', {name: 'Search', exact: true}).fill('Debugger');
    const toggle = settings.locator('label').filter({has: settings.getByText('Debugger', {exact: true})})
        .getByRole('checkbox');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await settings.close();
    await page.reload();

    await expect(group.locator('.sa-debugger-container')).toBeVisible();
    await expect(debuggerButton).toHaveCount(1);
    // The add-on's button is stage sized on its own; inside the frame it keeps the row's height.
    assert.equal((await group.boundingBox()).height, 32);
    await expect(page.locator('[data-plus-stage-frame]').locator('.sa-debugger-container')).toHaveCount(0);
    await debuggerButton.locator('img').click();
    const panel = page.locator('.sa-debugger-interface');
    await expect(panel).toBeVisible();
    await panel.locator('[class*="close-button_close-button"]').click();
    await expect(panel).toBeHidden();
});

test('the Plus project menu relocates display settings, runtime actions, and settings dialogs', {timeout: 30_000}, async t => {
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix);
    await page.goto(origin + buildPrefix + 'editor.html?lang=en');
    const name = 'TurboWarp Plus project information';
    const logo = page.getByLabel(name, {exact: true}).first();
    const nav = page.getByRole('navigation', {name});
    const menuBar = logo.locator('../..');
    await expect(menuBar.getByText('Settings', {exact: true})).toHaveCount(0);
    await expect(menuBar.getByText('Addons', {exact: true})).not.toBeVisible();
    await expect(menuBar.getByText('Advanced', {exact: true})).toHaveCount(0);
    await menuBar.getByText('Edit', {exact: true}).click();
    await expect(menuBar.getByText(/restore/i).first()).toBeVisible();
    for (const label of ['Turn on Turbo Mode', 'Turn on 60 FPS Mode', 'Change Username',
        'Cloud Variables are not Available', 'Advanced Settings']) {
        await expect(menuBar.getByText(label, {exact: true})).not.toBeVisible();
    }

    await logo.click();
    const entries = nav.locator(':scope > a, :scope > button, :scope > div > button');
    await expect(entries).toHaveText([
        `About TurboWarp Plus Editor ${editorPackage.version}`, 'Display settings', 'Runtime settings', 'Addons',
        'Advanced Settings', 'Source code', 'Licenses and credits'
    ]);
    const displayToggle = nav.getByRole('button', {name: 'Display settings'});
    const display = nav.getByRole('list', {name: 'Display settings'});
    await displayToggle.click();
    await expect(display.getByText('Language', {exact: true})).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(display).toHaveCount(0);
    const runtimeToggle = nav.getByRole('button', {name: 'Runtime settings'});
    await runtimeToggle.press('Enter');
    const runtime = nav.getByRole('group', {name: 'Runtime settings'});
    await expect(runtime.getByRole('button')).toHaveText([
        'Turn on Turbo Mode', 'Turn on 60 FPS Mode', 'Change Username', 'Cloud Variables are not Available'
    ]);
    await runtimeToggle.press('Tab');
    const turbo = runtime.getByRole('button', {name: 'Turn on Turbo Mode'});
    await expect(turbo).toBeFocused();
    await page.keyboard.press('Space');
    await expect(runtime.getByRole('button', {name: 'Turn off Turbo Mode'})).toBeVisible();
    await runtime.getByRole('button', {name: 'Turn on 60 FPS Mode'}).click();
    await expect(runtime.getByRole('button', {name: 'Turn off 60 FPS Mode'})).toBeVisible();
    let cloudAlert: string;
    page.once('dialog', async dialog => {
        cloudAlert = dialog.message();
        await dialog.accept();
    });
    await runtime.getByRole('button', {name: 'Cloud Variables are not Available'}).click();
    assert.match(cloudAlert, /cannot use cloud variables/i);
    await runtime.getByRole('button', {name: 'Change Username'}).click();
    const username = page.getByRole('dialog', {name: 'Change Username'});
    await expect(username).toBeVisible();
    await expect(nav).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(username).toHaveCount(0);

    await logo.click();
    await displayToggle.press('Enter');
    await expect(display.getByText('Block Colors', {exact: true})).toBeVisible();
    await expect(display.getByText('Accent', {exact: true})).toBeVisible();
    await displayToggle.press('Tab');
    const language = display.locator(':scope > li').filter({has: page.getByText('Language', {exact: true})});
    await expect(language).toBeFocused();
    await page.keyboard.press('Enter');
    const japanese = display.getByText('日本語', {exact: true});
    await expect(japanese).toBeVisible();
    await japanese.scrollIntoViewIfNeeded();
    const [displayBounds, languageOptionBounds] = await Promise.all([display.boundingBox(), japanese.boundingBox()]);
    assert.ok(languageOptionBounds.x >= displayBounds.x + displayBounds.width - 5);
    await page.keyboard.press('Escape');
    await expect(display).toHaveCount(0);
    await expect(displayToggle).toBeFocused();
    await displayToggle.click();
    const theme = display.locator(':scope > li').filter({hasText: 'Switch To Dark Mode'});
    await theme.press('Enter');
    await expect(nav).toBeHidden();

    await logo.click();
    await displayToggle.click();
    await expect(display.getByText('Switch To Light Mode', {exact: true})).toBeVisible();
    await runtimeToggle.click();
    await expect(display).toHaveCount(0);
    await nav.getByRole('button', {name: 'Advanced Settings'}).click();
    const advanced = page.getByRole('dialog', {name: 'Advanced Settings'});
    await expect(advanced).toBeVisible();
    await expect(nav).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(advanced).toHaveCount(0);

    await logo.click();
    const [addons] = await Promise.all([
        page.waitForEvent('popup'),
        nav.getByRole('button', {name: 'Addons'}).click()
    ]);
    await expect(addons).toHaveURL(/addons\.html$/);
    await addons.close();
    await expect(nav).toBeHidden();

    await logo.click();
    await displayToggle.click();
    await language.press('Enter');
    await display.getByText('日本語', {exact: true}).click();
    const japaneseName = 'TurboWarp Plus プロジェクト情報';
    await page.getByLabel(japaneseName, {exact: true}).first().click();
    await expect(page.getByRole('navigation', {name: japaneseName})
        .locator(':scope > a, :scope > button, :scope > div > button')).toHaveText([
        `TurboWarp Plus Editor ${editorPackage.version}について`, '表示設定', '動作設定', 'アドオン',
        '高度な設定', 'ソースコード', 'ライセンスとクレジット'
    ]);
});

test('the Plus project menu and previous stage layout remain available', {timeout: 30_000}, async t => {
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix);
    await page.goto(origin + buildPrefix + 'editor.html?lang=en&twPlusDockview=0&twPlusStageDrawer=0');
    await expect(page.getByText('See Project Page', {exact: true})).toHaveCount(0);
    await expect(page.getByText('TurboWarp Feedback', {exact: true})).toHaveCount(0);
    const project = page.getByLabel('TurboWarp Plus project information', {exact: true}).first();
    await project.click();
    await expect(page.getByRole('link', {name: `About TurboWarp Plus Editor ${editorPackage.version}`})).toBeVisible();
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

test('a separate stage window releases keyboard input on blur and restores the editor canvas', {timeout: 30_000}, async t => {
    const secureOrigin = 'https://layout.test';
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix, secureOrigin);
    await page.goto(secureOrigin + buildPrefix + 'editor.html?lang=en&twPlusStageDrawer=0');
    const frame = page.locator('[data-plus-stage-frame]');
    await expect(frame.locator('[data-gui-stage] canvas')).toBeVisible();
    await page.evaluate(() => {
        vm.stageInputTest = [];
        const original = vm.postIOData.bind(vm);
        vm.postIOData = (device, data) => {
            if (device === 'keyboard' && data.key === 'q') vm.stageInputTest.push(data.isDown);
            original(device, data);
        };
    });
    await frame.getByRole('button', {name: 'Stage display', exact: true}).click();
    await frame.getByRole('menuitem', {name: 'Undock stage', exact: true}).click();
    const stageWindow = page.getByRole('region', {name: 'Stage', exact: true});
    await stageWindow.getByRole('button', {name: 'Window layout', exact: true}).click();
    const [child] = await Promise.all([
        page.waitForEvent('popup'),
        stageWindow.getByRole('button', {name: 'Open in a separate window (undock)'}).click()
    ]);
    const canvas = child.locator('[data-gui-stage] canvas');
    await expect(canvas).toBeVisible();
    await canvas.evaluate(node => {
        node.dispatchEvent(new KeyboardEvent('keydown', {key: 'q', code: 'KeyQ', keyCode: 81, bubbles: true}));
        window.dispatchEvent(new Event('blur'));
    });
    await expect.poll(() => page.evaluate(() => vm.stageInputTest)).toEqual([true, false]);
    await child.close();
    await expect(frame.locator('[data-gui-stage] canvas')).toBeVisible();
});

test('startup chooses the layout and the stage menu hides the stage without stopping the project', {timeout: 90_000}, async t => {
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const start = query => page.goto(origin + buildPrefix + 'editor.html?lang=en&twPlusDockview=0&twPlusStageDrawer=0' + query);
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
    await expect(page.getByRole('menuitemradio', {name: /^(Switch to small stage|Switch to full stage)$/})).toHaveCount(0);
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

    await backdrop.click();
    const backdropEditor = page.getByRole('tabpanel', {name: 'Backdrops', exact: true});
    await backdropEditor.getByRole('tab', {name: 'Backdrops', exact: true}).click();
    const backdropActions = page.getByRole('group', {name: 'Add a backdrop', exact: true});
    await expect(backdropActions).toBeVisible();

    await page.goto(origin + buildPrefix + 'editor.html?lang=ja&twPlusDockview=0&twPlusWindowLayout=1&twPlusStageDrawer=0');
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

test('the menu bar opens one stage in each presentation and focuses the existing stage', {timeout: 60_000}, async t => {
    const secureOrigin = 'https://layout.test';
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix, secureOrigin);
    const editorUrl = secureOrigin + buildPrefix + 'editor.html?lang=ja';
    const open = page.getByRole('button', {name: 'ステージを開く', exact: true});
    const options = page.getByRole('button', {name: 'ステージの開き方'});
    const labels = ['別ウィンドウで開く', '別ウィンドウで全画面で開く', 'ステージをタブで開く', 'ステージを引き出しで開く'];
    const item = (index: number) => page.getByRole('menuitem', {name: labels[index], exact: true});
    const primary = (index: number) => page.getByRole('button', {name: labels[index], exact: true});
    const stage = (target: Page) => target.locator('[data-gui-stage] canvas').first();
    const checkOptions = async (active?: number) => {
        await options.press('ArrowDown');
        for (let index = 0; index < labels.length; index++) {
            if (active === undefined || active === index) await expect(item(index)).toBeEnabled();
            else await expect(item(index)).toBeDisabled();
            if (active === index) await expect(item(index)).toHaveAttribute('aria-current', 'true');
        }
        await page.keyboard.press('Escape');
    };
    await page.setViewportSize({width: 1024, height: 800});
    await page.goto(editorUrl);
    await page.waitForFunction(() => Boolean(window.vm?.renderer?.canvas));
    await page.waitForFunction(() =>
        Boolean(document[Symbol.for('@kubohiroya/turbowarp-app-shell/runtime-controls-dock/v1')]));
    await page.evaluate(() => {
        window.initialStageCanvas = vm.renderer.canvas;
        const dock = document[Symbol.for('@kubohiroya/turbowarp-app-shell/runtime-controls-dock/v1')];
        dock.stageControls.addButton({id: 'camera', label: 'Camera', icon: '📷', onClick() {}}).update({visible: true});
    });
    await expect(page.getByRole('button', {name: 'Camera', exact: true})).toBeInViewport({ratio: 1});
    await expect(open).toBeInViewport({ratio: 1});
    const checkCanvas = async (target: Page) => {
        await expect(stage(target)).toBeVisible();
        assert.equal(await page.evaluate(() => vm.renderer.canvas === window.initialStageCanvas), true);
    };
    await checkOptions();

    const [popup] = await Promise.all([page.waitForEvent('popup'), open.click()]);
    await checkCanvas(popup);
    await checkOptions(0);
    await popup.evaluate(() => {
        const focus = window.focus.bind(window);
        document.body.dataset.focusCalls = '0';
        window.focus = () => {
            document.body.dataset.focusCalls = String(Number(document.body.dataset.focusCalls) + 1);
            focus();
        };
    });
    await primary(0).click();
    await expect(popup.locator('body')).toHaveAttribute('data-focus-calls', '1');
    assert.equal(page.context().pages().length, 2);
    await popup.close();
    await expect(open).toBeEnabled();
    await checkOptions();

    await options.click();
    const [fullscreen] = await Promise.all([page.waitForEvent('popup'), item(1).click()]);
    await checkCanvas(fullscreen);
    await checkOptions(1);
    const enterFullscreen = fullscreen.getByRole('button', {name: '全画面にする', exact: true});
    await expect.poll(() => fullscreen.evaluate(() => Boolean(document.fullscreenElement)).then(async entered =>
        entered || await enterFullscreen.isVisible())).toBe(true);
    if (await enterFullscreen.isVisible()) await enterFullscreen.click();
    await expect.poll(() => fullscreen.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await primary(1).click();
    assert.equal(await fullscreen.evaluate(() => Boolean(document.fullscreenElement)), true);
    await fullscreen.evaluate(() => document.exitFullscreen());
    await checkOptions(0);
    await fullscreen.close();
    await expect(open).toBeEnabled();

    await options.click();
    await item(2).click();
    await checkCanvas(page);
    const stageTab = page.locator('.dv-tab').filter({hasText: /^ステージ$/});
    await expect(stageTab).toHaveCount(1);
    await checkOptions(2);
    await primary(2).click();
    await expect(stageTab).toHaveCount(1);
    await stageTab.locator('.dv-default-tab-action').click();
    await expect(open).toBeEnabled();

    await options.click();
    await item(3).click();
    await checkCanvas(page);
    const drawer = page.locator('[data-edge="right"] > [tabindex="-1"]');
    await expect(drawer).toBeFocused();
    await checkOptions(3);
    await primary(3).click();
    await expect(drawer).toBeFocused();
    await drawer.press('Escape');
    await expect(open).toBeEnabled();
    await checkOptions();

    await page.goto(editorUrl + '&twPlusStageLauncher=0');
    await expect(page.getByRole('button', {name: 'ステージを展開'})).toBeVisible();
    await expect(options).toHaveCount(0);
});

test('the default editor pins the sprite list and supports the drawer and detached window layout', {timeout: 60_000}, async t => {
    const secureOrigin = 'https://layout.test';
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix, secureOrigin);
    await page.goto(secureOrigin + buildPrefix + 'editor.html?lang=en');
    const sprites = page.getByRole('button', {name: 'Reveal sprite list', exact: true});
    const pin = page.getByRole('button', {name: 'Pin sprite list', exact: true});
    const slash = pin.locator('svg path[d="M2 2l12 12"]');
    const undock = page.getByRole('button', {name: 'Undock sprite list', exact: true});
    const backdrop = page.locator('[data-backdrop-placement] img').first();
    await expect(pin).toHaveAttribute('aria-pressed', 'true');
    await expect(slash).toHaveCount(0);
    await expect(sprites).toBeHidden();
    await expect(backdrop).toBeVisible();

    await pin.press('Enter');
    await sprites.press('Escape');
    await expect(sprites).toHaveAttribute('aria-expanded', 'false');
    await expect(backdrop).toBeHidden();
    await sprites.hover();
    await expect(pin).toHaveAttribute('aria-pressed', 'false');
    await expect(slash).toBeVisible();
    await expect(pin).toHaveCSS('opacity', '0.55');
    await expect(backdrop).toBeVisible();
    await expect(undock).toBeVisible();
    await page.mouse.move(500, 400);
    await expect(sprites).toHaveAttribute('aria-expanded', 'false');

    await sprites.hover();
    await pin.click();
    await page.mouse.move(500, 400);
    await expect(pin).toHaveAttribute('aria-pressed', 'true');
    await expect(slash).toHaveCount(0);
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
    await page.evaluate(() => {
        const open = window.open;
        window.open = () => {
            window.open = open;
            return null;
        };
    });
    await undock.click();
    await expect(backdrop).toBeVisible();
    await expect(undock).toBeEnabled();

    const openSpriteList = async () => {
        const [child] = await Promise.all([page.waitForEvent('popup', {timeout: 7_000}), undock.click()]);
        await expect(child).toHaveTitle('Sprite list');
        await expect(child.locator('[data-backdrop-placement]')).toBeVisible();
        await expect(page.locator('[data-backdrop-placement]')).toHaveCount(0);
        return child;
    };
    const child = await openSpriteList();
    await child.getByRole('button', {name: 'Backdrops', exact: true}).click();
    await expect.poll(() => page.evaluate(() => vm.editingTarget.isStage)).toBe(true);
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

    const reopened = await openSpriteList();
    await reopened.close();
    await expect(backdrop).toBeVisible();
    await expect.poll(() => page.evaluate(() => vm.editingTarget.isStage)).toBe(true);
});

test('a background code view retains its layout, pan and zoom', {timeout: 45_000}, async t => {
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix);
    await page.goto(origin + buildPrefix + 'editor.html?lang=en&twPlusDockview=0');
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
    await page.goto(origin + buildPrefix + 'editor.html?lang=en&twPlusDockview=0');
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

test('the editor leaves the bottom edge free of Backpack controls', {timeout: 30_000}, async t => {
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix);
    const url = origin + buildPrefix + 'editor.html?lang=en';
    const backpack = page.getByRole('button', {name: /backpack/i, includeHidden: true});
    const header = page.locator('[class*="backpack_backpack-header"]');
    const workspace = page.locator('.blocklySvg').first();
    for (const query of ['', '&twPlusStandardLayout=0&twPlusWindowLayout=1&twPlusBackpackPopout=1']) {
        await page.goto(url + query);
        await expect(workspace).toBeVisible();
        const {width, height} = page.viewportSize();
        await page.mouse.move(width / 2, height - 1);
        await expect(backpack).toHaveCount(0);
        await expect(header).toHaveCount(0);
    }
});

test('the project information menu stays above the block palette', {timeout: 45_000}, async t => {
    const secureOrigin = 'https://layout.test';
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix, secureOrigin);
    await page.goto(secureOrigin + buildPrefix + 'editor.html?lang=en&twPlusDockview=0');

    const sprites = page.getByRole('button', {name: 'Reveal sprite list', exact: true});
    await page.getByRole('button', {name: 'Pin sprite list', exact: true}).press('Enter');
    await sprites.press('Escape');
    await page.getByRole('button', {name: 'Motion', exact: true}).click();
    const flyout = page.locator('.blocklyFlyout').first();
    await expect(flyout).toBeVisible();
    // Keep the flyout open while exercising the menu's click handler.
    await projectInfoMenuButton(page).evaluate(node => (node as HTMLElement).click());
    const plusMenu = page.getByRole('navigation', {name: 'TurboWarp Plus project information'});
    await expect(plusMenu).toBeVisible();
    assert.ok(await plusMenu.evaluate((menu, palette) => {
        const bounds = menu.getBoundingClientRect();
        const left = Math.max(bounds.left, palette.x);
        const right = Math.min(bounds.right, palette.x + palette.width);
        const top = Math.max(bounds.top, palette.y);
        const bottom = Math.min(bounds.bottom, palette.y + palette.height);
        return left < right && top < bottom &&
            menu.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2));
    }, await flyout.boundingBox()));
});

test('the editor layout menu opens the live block palette and the Dockview panel in separate windows', {timeout: 45_000}, async t => {
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix);
    await page.goto(origin + buildPrefix + 'editor.html?lang=en');
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const layout = page.getByRole('button', {name: 'Editor panel layout', exact: true});
    const toolbox = page.locator('[data-horizontal-block-palette]').first();
    const blockSelector = '.blocklySvg > .blocklyWorkspace > .blocklyBlockCanvas > .blocklyDraggable';
    const blocks = page.locator(blockSelector);
    const open = async name => {
        await layout.click();
        const item = page.getByRole('menuitem', {name, exact: true});
        await expect(item.locator('svg')).toBeVisible();
        const [popup] = await Promise.all([page.waitForEvent('popup'), item.click()]);
        popup.setDefaultTimeout(7_000);
        popup.on('pageerror', error => errors.push(error.stack));
        return popup;
    };

    await expect(page.getByRole('group', {name: 'Sprite list tools'})).toBeVisible();
    await expect(page.getByText('Sprite', {exact: true})).toHaveCount(0);
    await expect(toolbox).toBeVisible();
    await page.evaluate(() => window.vm.extensionManager.loadExtensionURL('pen'));
    const popup = await open('Open block palette in another window');
    const palette = popup.locator('[data-palette-orientation]');
    const paletteMenu = popup.getByRole('button', {name: 'Block palette layout', exact: true});
    await expect(toolbox).toBeHidden();
    await expect(palette).toHaveAttribute('data-palette-orientation', 'horizontal');
    const motion = palette.getByRole('group', {name: 'Motion', exact: true});
    const categories = palette.getByRole('group', {name: 'Block categories', exact: true});
    const motionButton = categories.getByRole('button', {name: 'Motion', exact: true});
    const looksButton = categories.getByRole('button', {name: 'Looks', exact: true});
    const penButton = categories.getByRole('button', {name: 'Pen', exact: true});
    await expect(categories).toHaveCSS('flex-direction', 'column');
    await expect(motionButton).toHaveText('');
    await expect(motionButton).toHaveCSS('border-radius', '50%');
    await expect(motionButton.locator('span')).toHaveCSS('background-image', /^url\(/);
    await expect(penButton.locator('span')).toHaveCSS('background-image', /^url\(/);
    await motionButton.focus();
    await expect(popup.getByRole('tooltip')).toHaveText('Motion');
    await looksButton.hover();
    await expect(popup.getByRole('tooltip')).toHaveText('Looks');
    await expect(motion).toHaveCSS('flex-direction', 'row');
    const move = motion.getByRole('button', {name: /^move 10 steps$/i});
    await expect(move.locator('svg')).toBeVisible();
    await move.click();
    await expect(blocks).toHaveCount(1);

    await penButton.click();
    await expect(penButton).toHaveAttribute('aria-pressed', 'true');
    await expect(palette.getByRole('group', {name: 'Pen', exact: true})).toBeVisible();
    await looksButton.click();
    await popup.setViewportSize({width: 420, height: 420});
    const looks = palette.getByRole('group', {name: 'Looks', exact: true});
    const expectPreset = async (orientation: 'horizontal' | 'vertical') => {
        await expect(palette).toHaveAttribute('data-palette-orientation', orientation);
        await expect(looksButton).toHaveAttribute('aria-pressed', 'true');
        await expect(categories).toHaveCSS('flex-direction', orientation === 'horizontal' ? 'column' : 'row');
        await expect(looks).toHaveCSS('flex-direction', orientation === 'horizontal' ? 'row' : 'column');
        const [rail, list, menu, windowBounds] = await Promise.all([
            categories.boundingBox(), looks.boundingBox(), paletteMenu.boundingBox(), palette.boundingBox()
        ]);
        assert.ok(rail && list && menu && windowBounds);
        assert.ok(menu.y - windowBounds.y <= 12);
        assert.ok(windowBounds.x + windowBounds.width - (menu.x + menu.width) <= 12);
        assert.equal(list.x + list.width, windowBounds.x + windowBounds.width);
        if (orientation === 'horizontal') {
            assert.ok(rail.x + rail.width <= list.x);
            assert.equal(list.y, windowBounds.y);
        } else {
            assert.ok(rail.y + rail.height <= list.y);
            assert.ok(rail.x + rail.width <= menu.x);
        }
    };
    const horizontalOption = popup.getByRole('menuitemradio', {name: 'Arrange horizontally', exact: true});
    const verticalOption = popup.getByRole('menuitemradio', {name: 'Arrange vertically', exact: true});
    const triggerIcon = paletteMenu.locator('svg path');
    await expectPreset('horizontal');
    await paletteMenu.click();
    const horizontalIcon = await horizontalOption.locator('svg path').getAttribute('d');
    const verticalIcon = await verticalOption.locator('svg path').getAttribute('d');
    assert.ok(horizontalIcon && verticalIcon && horizontalIcon !== verticalIcon);
    await expect(triggerIcon).toHaveAttribute('d', horizontalIcon);
    await verticalOption.click();
    await expectPreset('vertical');
    await expect(triggerIcon).toHaveAttribute('d', verticalIcon);
    await looksButton.focus();
    const tooltip = popup.getByRole('tooltip');
    await expect(tooltip).toHaveText('Looks');
    const [label, category] = await Promise.all([tooltip.boundingBox(), looksButton.boundingBox()]);
    assert.ok(label && category && label.y >= category.y + category.height);
    await paletteMenu.click();
    const [menuButton, openMenu] = await Promise.all([
        paletteMenu.boundingBox(), popup.getByRole('menu', {name: 'Block palette layout', exact: true}).boundingBox()
    ]);
    assert.ok(menuButton && openMenu && openMenu.y >= menuButton.y + menuButton.height);
    await horizontalOption.click();
    await expectPreset('horizontal');
    await expect(triggerIcon).toHaveAttribute('d', horizontalIcon);
    await paletteMenu.click();
    await Promise.all([popup.waitForEvent('close'),
        popup.getByRole('menuitem', {name: 'Return this panel to the editor', exact: true}).click()]);
    await expect(toolbox).toBeVisible();
    const secondPalette = await open('Open block palette in another window');
    await expect(secondPalette.locator('[data-palette-orientation]')).toBeVisible();
    await secondPalette.getByRole('button', {name: /^move 10 steps$/i}).evaluate(node => {
        const dataTransfer = new DataTransfer();
        const surface = window.opener.document.querySelector('.blocklySvg');
        const bounds = surface.getBoundingClientRect();
        node.dispatchEvent(new DragEvent('dragstart', {bubbles: true, dataTransfer}));
        surface.dispatchEvent(new window.opener.DragEvent('drop', {bubbles: true, cancelable: true, dataTransfer,
            clientX: bounds.x + bounds.width * 0.4, clientY: bounds.y + bounds.height * 0.6}));
        node.dispatchEvent(new DragEvent('dragend', {bubbles: true, dataTransfer}));
    });
    await expect(blocks).toHaveCount(2);
    await secondPalette.close();
    await expect(toolbox).toBeVisible();

    const panel = await open('Open panel in another window');
    await expect(panel).toHaveURL(/dockview-popout\.html$/);
    await expect(panel.getByRole('tab', {name: 'Code', exact: true})).toBeVisible();
    await expect(panel.locator('[data-horizontal-block-palette]')).toBeVisible();
    await expect(toolbox).toHaveCount(0);
    await panel.getByRole('tab', {name: 'Costumes', exact: true}).click();
    await expect(panel.getByRole('tab', {name: 'Costumes', exact: true})).toHaveAttribute('aria-selected', 'true');
    await panel.getByRole('tab', {name: 'Code', exact: true}).click();
    await expect(panel.locator('[data-horizontal-block-palette]')).toBeVisible();
    await expect(panel.locator(blockSelector)).toHaveCount(2);
    await panel.getByRole('button', {name: 'Motion', exact: true}).click();
    const flyoutBlock = panel.locator('.blocklyFlyout .blocklyDraggable').first();
    const from = await flyoutBlock.boundingBox();
    const surface = await panel.locator('.blocklySvg').first().boundingBox();
    await panel.mouse.move(from.x + 12, from.y + 12);
    await panel.mouse.down();
    await panel.mouse.move(surface.x + surface.width * 0.65, surface.y + 260, {steps: 16});
    await panel.mouse.up();
    await expect(panel.locator(blockSelector)).toHaveCount(3);
    await panel.locator(blockSelector).filter({hasText: 'move'}).first().getByText('10', {exact: true}).click();
    const value = panel.locator('input.blocklyHtmlInput');
    await expect(value).toBeVisible();
    await value.fill('12');
    await value.press('Enter');
    await expect(panel.locator(blockSelector).getByText('12', {exact: true})).toBeVisible();
    await panel.close();
    await expect(toolbox).toBeVisible();
    await expect(blocks).toHaveCount(3);
    assert.deepEqual(errors, []);
});

test('the default Dockview splits one sprite editor and restores each view section', {timeout: 45_000}, async t => {
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix);
    page.setDefaultTimeout(8_000);
    const url = origin + buildPrefix + 'editor.html?lang=en';
    const groups = page.locator('.dv-groupview');
    await page.goto(url + '&twPlusDockview=0');
    await expect(page.getByRole('tab', {name: 'Code', exact: true})).toBeVisible();
    await expect(groups).toHaveCount(1);
    await expect(groups.getByRole('button', {name: 'Editor panel layout'})).toHaveCount(0);

    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await expect(groups).toHaveCount(1);
    const spriteName = await page.evaluate(() => window.vm.editingTarget.getName());
    const tabs = () => page.getByRole('tab', {name: spriteName, exact: true});
    const toolbar = page.locator('.tw-plus-sprite-toolbar[data-active-group="true"] [role="tablist"]:visible');
    const section = (name: string) => toolbar.getByRole('tab', {name, exact: true});
    const menu = (group: ReturnType<typeof page.locator>) => group.getByRole('button', {name: 'Editor panel layout'});
    await expect(tabs()).toHaveCount(1);
    await expect(toolbar).toHaveAttribute('aria-orientation', 'vertical');
    const code = section('Code');
    const costumes = section('Costumes');
    const sections = ['Code', 'Costumes', 'Sounds', 'Properties & Variables', 'Messages'];
    await expect(toolbar.getByRole('tab')).toHaveCount(sections.length);
    const bounds = await Promise.all(sections.map(async name => {
        const tab = section(name);
        await expect(tab).toHaveText('');
        return tab.boundingBox();
    }));
    const contentBounds = await page.locator('.tw-plus-sprite-tab-body:visible').boundingBox();
    // The buttons are squares the size of what they show; the rail is not divided among them.
    assert(contentBounds && bounds.every((tab, index) => tab && tab.height === 28 && tab.width === 28 &&
        tab.x === bounds[0].x && tab.x + tab.width <= contentBounds.x &&
        (index === 0 || tab.y > bounds[index - 1].y)));
    const railBounds = await toolbar.boundingBox();
    const lastTab = bounds.at(-1);
    assert(railBounds && lastTab && lastTab.y + lastTab.height < railBounds.y + railBounds.height - 40);
    await code.hover();
    await expect(page.locator('.tw-plus-sprite-toolbar-tooltip')).toHaveText('Code');
    await code.press('ArrowDown');
    await expect(costumes).toBeFocused();
    await expect(costumes).toHaveAttribute('aria-selected', 'true');
    await costumes.press('ArrowUp');
    await expect(code).toHaveAttribute('aria-selected', 'true');
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
    await expect.poll(() => page.evaluate(id => Boolean(window.vm.editingTarget.blocks.getBlock(id)), blockId)).toBe(true);
    const search = projectSearch(page);
    await search.fill('move');
    await expect(page.getByRole('group', {name: /^Blocks\b/}).getByRole('option')).toContainText(spriteName);
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
    const spriteName = await page.evaluate(() => window.vm.editingTarget.getName());
    const sprite = page.locator('[class*="sprite-selector_sprite_"]:visible')
        .filter({has: page.getByText(spriteName, {exact: true})});
    await sprite.hover();
    await expect(sprite).toHaveAttribute('title', spriteName);
    const toolbar = page.locator('.tw-plus-sprite-toolbar[data-active-group="true"] [role="tablist"]:visible');
    const section = (name: string) => toolbar.getByRole('tab', {name, exact: true});
    const editor = page.locator('.tw-plus-sprite-tab-editor:visible');
    const card = (name: string) => editor.locator('[class*="selector_list-item_"]:visible').filter({hasText: name});
    await section('Costumes').click();
    const initialCostume = await page.evaluate(() => window.vm.editingTarget.getCurrentCostume().name);
    await expect(card(initialCostume)).toHaveAttribute('title', initialCostume);
    await section('Sounds').click();
    await expect(editor.getByText('No sounds', {exact: true})).toBeVisible();
    const addSound = editor.getByRole('button', {name: 'Choose a Sound', exact: true})
        .and(page.locator('[class*="action-menu_main-button_"]'));
    await addSound.click();
    const soundLibrary = page.getByRole('dialog', {name: 'Choose a Sound', exact: true});
    await expect(soundLibrary).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(soundLibrary).toBeHidden();
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
    await expect(editor.getByText('No sounds', {exact: true})).toHaveCount(0);
    await card('Pane sound A').hover();
    await expect(card('Pane sound A')).toHaveAttribute('title', 'Pane sound A');
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
        const topInset = await pane.evaluate(node => node.closest('.tw-plus-sprite-tab-body').getBoundingClientRect().top -
            node.closest('.tw-plus-sprite-tab-slot--split').getBoundingClientRect().top);
        assert(list && body);
        // The active pane can reserve space above the body for its extra controls.
        return {list: list.width, detail: body.width, heightWithToolbar: body.height + topInset};
    };
    const sameBounds = (before: Awaited<ReturnType<typeof bounds>>, after: typeof before) => {
        for (const key of ['list', 'detail', 'heightWithToolbar'] as const) {
            assert(Math.abs(before[key] - after[key]) <= 2, key + ': ' + before[key] + ' vs ' + after[key]);
        }
    };
    const activate = (index: number) => groups.nth(index).getByRole('tab', {name: spriteName, exact: true}).click();

    await section('Costumes').click();
    await choose('Pane costume A');
    await card('Pane costume A').hover();
    await expect(card('Pane costume A')).toHaveAttribute('title', 'Pane costume A');
    await expect(selected.locator('[class*="sprite-selector-item_delete-button_"]')).toBeHidden();
    await card('Pane costume A').click({button: 'right'});
    await expect(page.locator('.react-contextmenu--visible').getByRole('menuitem', {name: 'delete', exact: true})).toBeVisible();
    await page.keyboard.press('Escape');
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
    const search = projectSearch(page);
    await search.fill('Pane sound B');
    await page.getByRole('group', {name: /^Sounds\b/}).getByRole('option', {name: /^Pane sound B\b/}).click();
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

    await section('Properties & Variables').click();
    const viewIds = await Promise.all([0, 1].map(index => groups.nth(index)
        .getByRole('tab', {name: spriteName, exact: true}).getAttribute('data-tab-panel-id')));
    const pane = (group: number) => page.locator('[id="' + viewIds[group] + '-content"]');
    const variable = (group: number) => pane(group).getByRole('textbox', {name: 'Pane counter'});
    const properties = (group: number) => pane(group).getByRole('textbox', {name: 'Sprite name'});
    const first = variable(0);
    await expect(first).toBeEditable();
    await expect(properties(0)).toBeEditable();
    await expect(properties(0)).toHaveValue(spriteName);
    const width = (await first.boundingBox()).width;
    await first.fill('17');
    await activate(1);
    await section('Properties & Variables').click();
    await expect(first).not.toBeEditable();
    await expect(properties(0)).toBeDisabled();
    await expect(properties(1)).toBeEditable();
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

test('the Dockview variables pane lists only variables owned by the selected target', {timeout: 45_000}, async t => {
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix);
    page.setDefaultTimeout(8_000);
    await page.addInitScript(() => localStorage.setItem('tw:theme', 'dark'));
    await page.goto(origin + buildPrefix + 'editor.html?lang=ja');
    await page.waitForFunction(() => window.vm?.editingTarget?.isOriginal && !window.vm.editingTarget.isStage);
    const spriteName = await page.evaluate(() => {
        const sprite = vm.editingTarget;
        const stage = vm.runtime.getTargetForStage();
        for (const id of Object.keys(stage.variables)) stage.deleteVariable(id);
        sprite.createVariable('local-score', '得点', '', false);
        stage.createVariable('project-score', '得点', '', false);
        stage.createVariable('cloud-score', '☁ 記録', '', true);
        stage.createVariable('legacy-cloud', '共有記録', '', true);
        stage.createVariable('plain-cloud-name', '☁ メモ', '', false);
        stage.createVariable('project-list', 'リスト', 'list', false);
        vm.emitTargetsUpdate();
        return sprite.getName();
    });
    const showVariables = () => page.locator('.tw-plus-sprite-toolbar[data-active-group="true"]')
        .getByRole('tab', {name: '変数など', exact: true}).click();
    const pane = page.getByRole('region', {name: '変数', exact: true});
    const fields = pane.locator('[data-variable-id]');
    const variableIds = () => fields.evaluateAll(inputs => inputs.map(input => input.getAttribute('data-variable-id')));
    const score = pane.getByRole('textbox', {name: '得点', exact: true});
    const cloud = pane.getByRole('img', {name: 'クラウド変数', exact: true});
    const scope = pane.locator('.tw-sprite-variables__scope');
    const create = pane.getByRole('form', {name: '変数を作る', exact: true});
    const rename = pane.getByRole('form', {name: '名前を変更', exact: true});
    const remove = pane.getByRole('form', {name: '削除', exact: true});
    const variableRow = (name: string) => pane.getByRole('row').filter({has: page.getByRole('textbox', {name, exact: true})});
    const startCreate = () => pane.getByRole('button', {name: '変数を作る', exact: true}).click();
    const submitCreate = () => create.getByRole('button', {name: '変数を作る', exact: true}).click();

    await showVariables();
    await expect.poll(variableIds).toEqual(['local-score']);
    await expect(scope).toHaveCount(0);
    await expect(cloud).toHaveCount(0);
    await score.fill('17');
    await score.press('Enter');

    await startCreate();
    await create.getByRole('textbox').fill('得点');
    await submitCreate();
    await expect(create.getByRole('alert')).toHaveText('同じ名前の変数がすでにあります。');
    await create.getByRole('textbox').fill('速度');
    await submitCreate();
    const speed = pane.getByRole('textbox', {name: '速度', exact: true});
    await expect(speed).toHaveValue('0');
    const speedId = await speed.getAttribute('data-variable-id');
    await page.evaluate(id => vm.editingTarget.blocks.createBlock({
        id: 'speed-reference', opcode: 'data_variable', inputs: {},
        fields: {VARIABLE: {name: 'VARIABLE', id, value: '速度', variableType: ''}},
        shadow: false, topLevel: true, parent: null, next: null, x: 10, y: 10
    }), speedId);
    await variableRow('速度').getByRole('button', {name: '名前を変更', exact: true}).click();
    await rename.getByRole('textbox').fill('速さ');
    await rename.getByRole('button', {name: '名前を変更', exact: true}).click();
    await expect(variableRow('速さ')).toBeVisible();
    assert.equal(await page.evaluate(() => vm.editingTarget.blocks.getBlock('speed-reference').fields.VARIABLE.value), '速さ');
    await variableRow('速さ').getByRole('button', {name: '削除', exact: true}).click();
    await remove.getByRole('button', {name: '削除', exact: true}).click();
    await expect(remove.getByRole('alert')).toContainText('ブロックで使用中です');
    await expect(variableRow('速さ')).toBeVisible();
    await page.evaluate(() => vm.editingTarget.blocks.deleteBlock('speed-reference'));
    await remove.getByRole('button', {name: '削除', exact: true}).click();
    await expect(variableRow('速さ')).toHaveCount(0);

    await page.getByRole('button', {name: '背景', exact: true}).click();
    await showVariables();
    await expect.poll(variableIds).toEqual(['project-score', 'cloud-score', 'legacy-cloud', 'plain-cloud-name']);
    await expect(scope).toHaveCount(0);
    await expect(cloud).toHaveCount(2);
    await expect(cloud.first()).toHaveCSS('color', 'rgb(35, 153, 194)');
    await expect(pane.getByRole('rowheader')).toHaveText(['得点', '☁︎ 記録', '☁︎ 共有記録', '☁ メモ']);
    await expect(score).toHaveValue('0');
    await score.fill('23');
    await score.press('Enter');
    await startCreate();
    await create.getByRole('textbox').fill('作品用');
    await submitCreate();
    await expect(variableRow('作品用')).toBeVisible();

    await page.getByRole('tab', {name: spriteName, exact: true}).click();
    await showVariables();
    await expect(score).toHaveValue('17');
    await expect(variableRow('作品用')).toHaveCount(0);
    assert.equal(await page.evaluate(() => vm.runtime.getTargetForStage().variables['project-score'].value), 23);
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
    const palette = (scope: ReturnType<typeof page.locator>) => scope.locator('.blocklyToolboxDiv');
    const thumbnail = (scope: ReturnType<typeof page.locator>) => scope.locator('[data-dockview-costume-thumbnail] img');
    const assertNavigation = async (scope: ReturnType<typeof page.locator>, editable: boolean) => {
        const map = scope.locator('[data-workspace-minimap]');
        const zoom = scope.locator('[data-plus-horizontal-zoom]');
        await expect(thumbnail(scope)).toBeVisible();
        await expect(thumbnail(scope)).toHaveCSS('opacity', '0.6');
        await expect(map).toBeVisible();
        if (editable) {
            await expect(zoom.locator('[data-plus-zoom-action]')).toHaveCount(3);
            await expect(zoom).toBeVisible();
        } else {
            await expect(zoom).toHaveCount(0);
        }
        await expect.poll(async () => {
            const [pane, image, minimap, buttons] = await Promise.all([
                scope.boundingBox(), thumbnail(scope).boundingBox(), map.boundingBox(),
                editable ? zoom.boundingBox() : null
            ]);
            return Boolean(pane && image && minimap &&
                Math.abs(image.x + image.width - minimap.x - minimap.width) < 2 &&
                image.y >= pane.y && image.y + image.height < minimap.y &&
                pane.x + pane.width - minimap.x - minimap.width < 45 &&
                (editable ? buttons && minimap.y + minimap.height < buttons.y : true));
        }).toBe(true);
    };
    const groupBounds = () => Promise.all([0, 1].map(index => groups.nth(index).boundingBox()));
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
    await assertNavigation(editor, true);
    await groups.first().getByRole('button', {name: 'Editor panel layout'}).click();
    await page.getByRole('menuitem', {name: 'Split right'}).click();
    await expect(groups).toHaveCount(2);
    await expect(preview(0)).toBeVisible();
    await expect(palette(preview(0))).toBeHidden();
    await expect(palette(editor)).toBeVisible();
    await assertNavigation(preview(0), false);
    const costume = await page.evaluate(async () => {
        const {vm} = window;
        const storage = vm.runtime.storage;
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="20"/></svg>';
        const asset = storage.createAsset(storage.AssetType.ImageVector, 'svg', new TextEncoder().encode(svg), null, true);
        await vm.addCostume(`${asset.assetId}.svg`, {name: 'Pane thumbnail', asset, assetId: asset.assetId,
            dataFormat: 'svg', rotationCenterX: 20, rotationCenterY: 20}, vm.editingTarget.id);
        return asset.encodeDataURI();
    });
    await expect(thumbnail(editor)).toHaveAttribute('src', costume);
    await expect(thumbnail(preview(0))).toHaveAttribute('src', costume);
    const splitBounds = await groupBounds();

    await setViewport(1.1, -247, -189);
    const right = await readViewport(editor);
    await preview(0).click();
    await expect(preview(1)).toBeVisible();
    await expect(palette(preview(1))).toBeHidden();
    await expect(palette(editor)).toBeVisible();
    await assertNavigation(editor, true);
    await assertNavigation(preview(1), false);
    assert.deepEqual(await groupBounds(), splitBounds);
    await setViewport(0.75, -85, -46);
    const left = await readViewport(editor);
    assert.notEqual(left[0], right[0]);
    assert.notEqual(left[1], right[1]);
    assert.notEqual(left[2], right[2]);
    await expect.poll(() => readViewport(preview(1))).toEqual(right);

    await preview(1).press('Enter');
    await expect.poll(() => readViewport(editor)).toEqual(right);
    await expect.poll(() => readViewport(preview(0))).toEqual(left);
    await expect(palette(preview(0))).toBeHidden();
    await expect(palette(editor)).toBeVisible();
    assert.deepEqual(await groupBounds(), splitBounds);
    await page.evaluate(() => {
        const blocks = window.ScratchBlocks;
        const xml = blocks.Xml.textToDom('<xml><block id="pane-added-block" type="looks_show" x="450" y="380"/></xml>');
        blocks.Xml.domToWorkspace(xml, blocks.getMainWorkspace());
        blocks.Events.fireNow_();
    });
    await expect(preview(0).locator('[data-id="pane-added-block"]')).toBeAttached();

    await preview(0).click();
    await expect.poll(() => readViewport(editor)).toEqual(left);
    const toolbar = page.locator('.tw-plus-sprite-toolbar[data-active-group="true"] [role="tablist"]:visible');
    await toolbar.getByRole('tab', {name: 'Costumes', exact: true}).click();
    await expect(page.locator('.tw-plus-sprite-tab-slot--split .blocklyToolboxDiv:visible')).toHaveCount(0);
    await toolbar.getByRole('tab', {name: 'Code', exact: true}).click();
    await expect(palette(editor)).toBeVisible();
    await expect.poll(() => readViewport(editor)).toEqual(left);
    assert.equal(await page.evaluate(() => window.vm.editingTarget.id), targetId);

    const otherCostume = await page.evaluate(async id => {
        await window.vm.duplicateSprite(id);
        const target = window.vm.editingTarget;
        target.setCostume(0);
        return target.getCostumes()[target.currentCostume].asset.encodeDataURI();
    }, targetId);
    assert.ok(otherCostume !== costume, 'The two sprites have different current costumes');
    await expect(thumbnail(editor)).toHaveAttribute('src', otherCostume);
    await expect(thumbnail(preview(1))).toHaveAttribute('src', costume);
    assert.deepEqual(errors, []);
});

test('the Dockview stage keeps its renderer, controls and input through split and tab moves', {timeout: 60_000}, async t => {
    const page = await openBrowser(t, path.join(pinnedGui(), 'build'), buildPrefix);
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + buildPrefix + 'editor.html?lang=en&twPlusDockview=1');
    await page.waitForFunction(() => window.vm?.editingTarget?.isOriginal && window.vm.renderer);
    const canvas = page.locator('[data-gui-stage] canvas').first();
    const reveal = page.getByRole('button', {name: 'Reveal stage', exact: true});
    const revealStage = async () => {
        await reveal.click();
        await expect(reveal).toHaveAttribute('aria-expanded', 'true');
        await expect(canvas).toBeVisible();
    };
    await reveal.hover();
    await expect(canvas).toBeVisible();
    const {spriteName, spriteId} = await page.evaluate(() => {
        const {vm} = window;
        const target = vm.editingTarget;
        target.setXY(0, 0);
        window.dockviewStageIdentity = {vm, renderer: vm.renderer, canvas: document.querySelector('[data-gui-stage] canvas')};
        window.dockviewStageControls = [];
        for (const method of ['greenFlag', 'stopAll']) {
            const native = vm[method].bind(vm);
            vm[method] = (...args) => {
                window.dockviewStageControls.push(method);
                return native(...args);
            };
        }
        return {spriteName: target.getName(), spriteId: target.id};
    });

    const workspace = page.locator('[data-multi-view] .dockview-theme-light');
    const groups = workspace.locator('.dv-groupview');
    const dockedStage = page.locator('.tw-plus-dockview-stage-slot');
    const stageTab = workspace.getByRole('tab', {name: 'Stage', exact: true});
    const codeTab = workspace.getByRole('tab', {name: spriteName, exact: true});
    const stageGroup = groups.filter({has: page.getByRole('tab', {name: 'Stage', exact: true})});
    const codeGroup = groups.filter({has: page.getByRole('tab', {name: spriteName, exact: true})});
    const display = page.getByRole('button', {name: 'Stage display', exact: true});
    const selectDisplay = async (name: string) => {
        await display.click();
        await page.getByRole('menuitem', {name, exact: true}).click();
    };
    const assertStage = async () => {
        await expect(canvas).toBeVisible();
        await expect.poll(() => page.evaluate(() => {
            const saved = window.dockviewStageIdentity;
            const {vm} = window;
            const canvas = document.querySelector('[data-gui-stage] canvas');
            const bounds = canvas.getBoundingClientRect();
            const details = {sameVm: vm === saved.vm, sameRenderer: vm.renderer === saved.renderer,
                sameCanvas: canvas === saved.canvas, aspect: Math.round(bounds.width / bounds.height * 100)};

            vm.renderer.dirty = true;
            vm.renderer.draw();
            const gl = vm.renderer._gl;
            const width = gl.drawingBufferWidth;
            const height = gl.drawingBufferHeight;
            const pixels = new Uint8Array(width * height * 4);
            gl.readPixels(0, 0, width, height,
                gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            return {...details, colored: pixels.some((value, index) => index % 4 === 0 &&
                Math.max(value, pixels[index + 1], pixels[index + 2]) - Math.min(value, pixels[index + 1], pixels[index + 2]) > 25)};
        })).toEqual({sameVm: true, sameRenderer: true, sameCanvas: true, aspect: 133, colored: true});
        const bounds = await canvas.boundingBox();
        for (const [fx, fy, x, y] of [[0.75, 0.25, 120, 90], [0.25, 0.75, -120, -90]]) {
            await canvas.click({position: {x: bounds.width * fx, y: bounds.height * fy}});
            const position = await page.evaluate(() => {
                const mouse = window.vm.runtime.ioDevices.mouse;
                return [mouse.getScratchX(), mouse.getScratchY()];
            });
            assert.ok(Math.abs(position[0] - x) <= 3 && Math.abs(position[1] - y) <= 3, JSON.stringify(position));
        }
        await page.keyboard.down('Space');
        assert.equal(await page.evaluate(() => window.vm.runtime.ioDevices.keyboard.getKeyIsDown('space')), true);
        await page.keyboard.up('Space');
    };

    await selectDisplay('Open stage in workspace');
    await expect(groups).toHaveCount(2);
    await expect(dockedStage.locator('[data-gui-stage] canvas')).toBeVisible();
    assert.ok((await stageGroup.boundingBox()).x > (await codeGroup.boundingBox()).x);
    const palette = codeGroup.locator('.blocklyToolboxDiv');
    const zoom = codeGroup.locator('[data-plus-horizontal-zoom]');
    await stageTab.click();
    await expect(codeGroup.locator('.blocklySvg').first()).toBeVisible();
    await expect(palette).toBeHidden();
    await expect(zoom).toBeHidden();
    await codeTab.click();
    await expect(palette).toBeVisible();
    await expect(zoom).toBeVisible();
    await assertStage();

    const sash = workspace.locator('.dv-sash:visible').first();
    const split = await sash.boundingBox();
    await page.mouse.move(split.x + split.width / 2, split.y + split.height / 2);
    await page.mouse.down();
    await page.mouse.move(split.x + split.width / 2 + 230, split.y + split.height / 2, {steps: 8});
    await page.mouse.up();
    await expect.poll(async () => (await canvas.boundingBox()).width).toBeLessThan(450);
    await assertStage();

    const codeContent = codeGroup.locator('.dv-content-container').first();
    const content = await codeContent.boundingBox();
    await stageTab.dragTo(codeContent, {targetPosition: {x: content.width / 2, y: content.height - 12}});
    await expect.poll(async () => (await stageGroup.boundingBox()).y).toBeGreaterThan((await codeGroup.boundingBox()).y);
    await expect(groups).toHaveCount(2);
    await assertStage();

    const codeBounds = await codeContent.boundingBox();
    assert.ok(codeBounds);
    await stageTab.dragTo(codeContent, {targetPosition: {x: codeBounds.width / 2, y: codeBounds.height / 2}});
    await expect(codeGroup.getByRole('tab', {name: 'Stage', exact: true})).toBeVisible();
    await expect(groups).toHaveCount(1);
    await codeTab.click();
    await expect(canvas).toBeHidden();
    await expect(codeGroup.locator('.tw-plus-sprite-tab-editor .blocklySvg').first()).toBeVisible();
    await stageTab.click();
    await assertStage();
    await dockedStage.getByTitle('Go', {exact: true}).click();
    await dockedStage.getByTitle('Stop', {exact: true}).click();
    await expect.poll(() => page.evaluate(() => window.dockviewStageControls.slice(-2))).toEqual(['greenFlag', 'stopAll']);

    const stageWidth = (await canvas.boundingBox()).width;
    await selectDisplay('Enter full screen mode');
    await expect(dockedStage.locator('[data-gui-stage] canvas')).toHaveCount(0);
    await assertStage();
    await page.getByRole('img', {name: 'Exit full screen mode', exact: true}).click();
    await expect(dockedStage.locator('[data-gui-stage] canvas')).toBeVisible();
    await expect.poll(async () => (await canvas.boundingBox()).width).toBe(stageWidth);
    await assertStage();

    await stageTab.getByRole('button', {name: 'Close Stage', exact: true}).click();
    await expect(stageTab).toHaveCount(0);
    await expect(dockedStage.locator('[data-gui-stage] canvas')).toHaveCount(0);
    await revealStage();
    await assertStage();
    await selectDisplay('Hide stage');
    await expect(canvas).toBeHidden();
    await selectDisplay('Open stage in workspace');
    await expect(dockedStage.locator('[data-gui-stage] canvas')).toBeVisible();
    await assertStage();
    await selectDisplay('Return stage from workspace');
    await expect(stageTab).toHaveCount(0);
    await revealStage();
    await assertStage();
    assert.equal(await page.evaluate(() => window.vm.editingTarget.id), spriteId);
    assert.deepEqual(errors, []);
});
