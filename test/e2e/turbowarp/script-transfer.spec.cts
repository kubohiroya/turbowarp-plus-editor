const fs = require('node:fs/promises');
const {test, expect} = require('./fixtures.cts');

// Transfer is always on: the plain editor URL carries no switch for it.
const startTransfer = async (page, query = '') => {
    await page.goto('editor.html?lang=en' + query);
    await expect(page.locator('.blocklyToolboxDiv')).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(window.ScratchBlocks?.getMainWorkspace() && vm.editingTarget))).toBe(true);
};
const seedScript = async page => {
    await page.evaluate(() => {
        const target = vm.editingTarget;
        target.createVariable('transfer-counter', 'Transfer counter', '');
        target.variables['transfer-counter'].value = 37;
        target.blocks.createBlock({id: 'transfer-root', opcode: 'data_changevariableby', topLevel: true,
            shadow: false, parent: null, next: null, x: 250, y: 150,
            fields: {VARIABLE: {name: 'VARIABLE', id: 'transfer-counter', value: 'Transfer counter'}},
            inputs: {VALUE: {name: 'VALUE', block: 'transfer-number', shadow: 'transfer-number'}}});
        target.blocks.createBlock({id: 'transfer-number', opcode: 'math_number', topLevel: false,
            shadow: true, parent: 'transfer-root', next: null,
            fields: {NUM: {name: 'NUM', value: '1'}}, inputs: {}});
        vm.refreshWorkspace();
    });
    await expect.poll(() => page.evaluate(() => Boolean(window.ScratchBlocks.getMainWorkspace().getBlockById('transfer-root')))).toBe(true);
    await page.evaluate(() => window.ScratchBlocks.getMainWorkspace().getBlockById('transfer-root').getSvgRoot().setAttribute('data-transfer-root', '1'));
};
const blockMenu = page => page.locator('[data-transfer-root]').click({button: 'right'});
const workspaceMenu = async page => {
    // Open the workspace menu away from the stage, blocks, and navigation controls.
    const svg = page.locator('.blocklySvg').first();
    const bounds = await svg.boundingBox();
    await page.mouse.click(bounds.x + bounds.width * 0.6, bounds.y + bounds.height * 0.75, {button: 'right'});
};
const countImported = page => page.evaluate(() => Object.values<any>(vm.editingTarget.blocks._blocks)
    .filter(block => block.opcode === 'data_changevariableby').length);
const menuItem = (page, text) => page.getByRole('menuitem', {name: text, exact: true});

test('script file export/import from menus available by default without any query', async ({page}, info) => {
    await startTransfer(page);
    expect(new URL(page.url()).search).toBe('?lang=en');
    await seedScript(page);
    await workspaceMenu(page);
    await expect(menuItem(page, 'Import Script')).toBeVisible();
    await expect(menuItem(page, 'Paste')).toBeVisible();
    await page.keyboard.press('Escape');
    await blockMenu(page);
    await expect(menuItem(page, 'Copy')).toBeVisible();
    const pending = page.waitForEvent('download');
    await menuItem(page, 'Export Script').click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe('script.blocks3');
    const filename = info.outputPath('script.blocks3');
    await download.saveAs(filename);
    const payload = JSON.parse(await fs.readFile(filename, 'utf8'));
    expect(payload.variables).toContainEqual({id: 'transfer-counter', name: 'Transfer counter', type: '', scope: 'local', value: 37});
    await workspaceMenu(page);
    const chooser = page.waitForEvent('filechooser');
    await menuItem(page, 'Import Script').click();
    await (await chooser).setFiles(filename);
    await expect.poll(() => countImported(page)).toBe(2);
});

test('two windows copy/paste using menus and Ctrl+C/V despite denied OS clipboard permissions', async ({page, context, evidence}) => {
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', {value: {
            read: async () => { throw new DOMException('Denied', 'NotAllowedError'); },
            write: async () => { throw new DOMException('Denied', 'NotAllowedError'); },
            writeText: async () => { throw new DOMException('Denied', 'NotAllowedError'); }
        }});
    });
    await startTransfer(page);
    await seedScript(page);
    await blockMenu(page);
    await menuItem(page, 'Copy').click();
    // Open after copying: localStorage must serve a late-joining window too.
    const other = await context.newPage(); evidence.observe(other);
    await startTransfer(other);
    await workspaceMenu(other);
    await menuItem(other, 'Paste').click();
    await expect.poll(() => countImported(other)).toBe(1);
    await page.bringToFront();
    await page.locator('[data-transfer-root]').click();
    await page.keyboard.press('Control+c');
    await other.bringToFront();
    await other.keyboard.press('Control+v');
    await expect.poll(() => countImported(other)).toBe(2);
    expect(await other.evaluate(() => Object.values<any>(vm.editingTarget.variables).find(v => v.name === 'Transfer counter').value)).toBe(37);
    // Native text editing must retain its keyboard shortcuts.
    await other.evaluate(() => {
        const input = document.createElement('textarea'); input.id = 'native-text'; document.body.append(input); input.focus();
    });
    await other.keyboard.press('Control+v');
    expect(await countImported(other)).toBe(2);
});

test('the stage menus round-trip backdrops, sounds and scripts into another project', async ({page, context, evidence}, info) => {
    await startTransfer(page);
    await page.evaluate(async () => {
        const stage = vm.runtime.getTargetForStage();
        const storage = vm.runtime.storage;
        const asset = storage.createAsset(storage.AssetType.ImageVector, 'svg',
            new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>'), null, true);
        await vm.addCostume(`${asset.assetId}.svg`, {name: 'Transfer backdrop', asset, assetId: asset.assetId,
            dataFormat: 'svg', rotationCenterX: 5, rotationCenterY: 5}, stage.id);
        // A short valid mono PCM WAV, decoded by the real browser audio engine.
        const wav = new Uint8Array(46); const view = new DataView(wav.buffer);
        const word = (offset, value) => { for (let i = 0; i < value.length; i++) wav[offset + i] = value.charCodeAt(i); };
        word(0, 'RIFF'); view.setUint32(4, 38, true); word(8, 'WAVE'); word(12, 'fmt ');
        view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
        view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
        word(36, 'data'); view.setUint32(40, 2, true);
        const sound = storage.createAsset(storage.AssetType.Sound, 'wav', wav, null, true);
        await vm.addSound({name: 'Transfer sound', asset: sound, assetId: sound.assetId, dataFormat: 'wav', md5: `${sound.assetId}.wav`}, stage.id);
        stage.createVariable('stage-counter', 'Stage counter', ''); stage.variables['stage-counter'].value = 23;
        stage.blocks.createBlock({id: 'stage-script', opcode: 'event_whenflagclicked', inputs: {}, fields: {},
            topLevel: true, shadow: false, parent: null, next: null, x: 40, y: 40});
        vm.emitTargetsUpdate();
    });
    await page.getByRole('button', {name: 'Reveal sprite list', exact: true}).hover();
    await page.getByRole('button', {name: 'Pin sprite list', exact: true}).click();
    await page.getByRole('button', {name: 'Backdrops', exact: true}).click({button: 'right'});
    await expect(page.getByText('Import Stage (add)', {exact: true})).toHaveCount(0);
    const pending = page.waitForEvent('download');
    await page.getByText('Export Stage', {exact: true}).click();
    const filename = info.outputPath('stage.stage3');
    await (await pending).saveAs(filename);
    const other = await context.newPage(); evidence.observe(other);
    await startTransfer(other, '&twPlusStandardLayout=0');
    await other.getByRole('button', {name: 'Choose a Backdrop', exact: true}).first().hover();
    const chooser = other.waitForEvent('filechooser');
    await other.getByRole('button', {name: 'Import Stage (add)', exact: true}).click();
    await (await chooser).setFiles(filename);
    await expect.poll(() => other.evaluate(() => {
        const stage = vm.runtime.getTargetForStage();
        return {backdrops: stage.getCostumes().map(c => c.name), sounds: stage.getSounds().map(s => s.name),
            scripts: Object.values<any>(stage.blocks._blocks).map(b => b.opcode),
            counter: Object.values<any>(stage.variables).find(v => v.name === 'Stage counter')?.value,
            stages: vm.runtime.targets.filter(t => t.isStage).length};
    })).toMatchObject({backdrops: expect.arrayContaining(['Transfer backdrop']), sounds: ['Transfer sound'],
        scripts: ['event_whenflagclicked'], counter: 23, stages: 1});
});

test('OS clipboard includes scratchblocks text and imports JSON across origins', async ({page, context, baseURL, evidence}) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await startTransfer(page);
    await seedScript(page);
    await blockMenu(page);
    await menuItem(page, 'Copy').click();
    await expect.poll(() => page.evaluate(async () => {
        const items = await navigator.clipboard.read();
        return items.flatMap(item => [...item.types]);
    })).toContain('web application/x.turbowarp.blocks3+json');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/change.*Transfer counter.*by.*1/);
    // Serve the same checked build at a second origin without assuming a loopback deployment.
    // Published verification uses a GitHub Pages baseURL, so replacing 127.0.0.1 would do nothing.
    const peerOrigin = 'https://script-transfer-peer.invalid';
    await context.route(`${peerOrigin}/**`, async route => {
        const peerURL = new URL(route.request().url());
        const sourceURL = new URL(`${peerURL.pathname}${peerURL.search}`, baseURL);
        const response = await route.fetch({url: sourceURL.href});
        await route.fulfill({response});
    });
    const other = await context.newPage(); evidence.observe(other);
    const peerURL = new URL('editor.html?lang=en', baseURL);
    await other.goto(`${peerOrigin}${peerURL.pathname}${peerURL.search}`);
    expect(new URL(other.url()).origin).not.toBe(new URL(page.url()).origin);
    await expect(other.locator('.blocklyToolboxDiv')).toBeVisible();
    expect(await other.evaluate(() => localStorage.getItem('tw-plus-script-clipboard-v1'))).toBeNull();
    await workspaceMenu(other);
    await menuItem(other, 'Paste').click();
    await expect.poll(() => countImported(other)).toBe(1);
});
