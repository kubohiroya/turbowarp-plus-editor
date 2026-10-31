const {test, expect} = require('./fixtures.cjs');
const {devices} = require('@playwright/test');
const {createHash} = require('node:crypto');
const {readFile, mkdtemp, rm} = require('node:fs/promises');
const {tmpdir} = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const Zip = require('@turbowarp/jszip');

// Android uses the ordinary download/import controls instead of native filesystem pickers.
test.use({userAgent: devices['Pixel 7'].userAgent});

function extension(id) {
    const bytes = Buffer.from(`
globalThis.__plusAuthoringRuns = globalThis.__plusAuthoringRuns || {};
globalThis.__plusAuthoringRuns['${id}'] = (globalThis.__plusAuthoringRuns['${id}'] || 0) + 1;
Scratch.extensions.register({
 getInfo() { return {id: '${id}', name: '${id}', blocks: [
  {opcode: 'value', blockType: Scratch.BlockType.REPORTER, text: 'authoring value'}
 ]}; },
 value() { return Scratch.extensions.unsandboxed && Scratch.vm.runtime ? 42 : -1; }
});\n`);
    return {id, bytes, sha256: createHash('sha256').update(bytes).digest('hex'),
        url: `https://authoring-fixture.invalid/${id}.js`};
}

const embedded = extension('authorembedded');
const remote = extension('authorremote');
const permission = page => page.getByTestId('tw-plus-permission');
const runs = (page, id) => page.evaluate(key => globalThis.__plusAuthoringRuns?.[key] || 0, id);
const projectJSON = page => page.evaluate(() => JSON.parse(vm.toJSON()));

async function openEditor(page, enabled = true) {
    await page.goto(`editor.html?lang=ja${enabled ? '&twPlusExtensionLoader=1' : ''}`);
    await page.waitForFunction(() => globalThis.vm?.runtime?.targets?.length > 0);
    await page.evaluate(() => {
        const stage = vm.runtime.getTargetForStage();
        stage.createVariable('authoring-retained', 'keep this variable', '');
        stage.variables['authoring-retained'].value = 'before addition';
    });
}

async function fileMenu(page) {
    await page.getByText('ファイル', {exact: true}).click();
}

async function fillAddition(page, spec, mode) {
    await fileMenu(page);
    await page.getByTestId('tw-plus-add-extension').click();
    await expect(page.getByTestId('tw-plus-authoring')).toBeVisible();
    await page.getByTestId('tw-plus-authoring-mode').selectOption(mode);
    await expect(page.getByTestId(`tw-plus-authoring-${mode === 'embedded' ? 'file' : 'url'}`)).toBeVisible();
    await expect(page.getByTestId(`tw-plus-authoring-${mode === 'embedded' ? 'url' : 'file'}`)).toBeHidden();
    await page.getByTestId('tw-plus-authoring-id').fill(spec.id);
    if (mode === 'embedded') {
        await page.getByTestId('tw-plus-authoring-file').setInputFiles({
            name: `${spec.id}.js`, mimeType: 'application/javascript', buffer: spec.bytes
        });
    } else {
        await page.getByTestId('tw-plus-authoring-url').fill(spec.url);
    }
}

async function approveAddition(page, spec, mode) {
    await fillAddition(page, spec, mode);
    await page.getByTestId('tw-plus-authoring-submit').click();
    await expect(permission(page)).toBeVisible();
    expect(await runs(page, spec.id)).toBe(0);
    await expect(permission(page).locator('[data-field="id"]')).toHaveText(spec.id);
    await expect(permission(page).locator('[data-field="sha256"]')).toHaveText(spec.sha256);
    await page.getByTestId('tw-plus-allow').click();
    await expect(page.getByTestId('tw-plus-authoring-status')).toContainText('追加しました');
    await expect(page.getByTestId('tw-plus-authoring-sha256')).toContainText(spec.sha256);
    await expect.poll(() => page.evaluate(id => vm.extensionManager.isExtensionLoaded(id), spec.id)).toBe(true);
    expect(await runs(page, spec.id)).toBe(1);
    expect(await page.evaluate(id => vm.runtime._primitives[`${id}_value`](), spec.id)).toBe(42);
    await page.getByTestId('tw-plus-authoring-cancel').click();
    await expect(page.getByTestId('tw-plus-authoring')).toHaveCount(0);
}

async function downloadSB3(page) {
    await fileMenu(page);
    const downloading = page.waitForEvent('download');
    await page.getByRole('listitem').filter({hasText: /^コンピューターに保存する$/}).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/\.sb3$/);
    return readFile(await download.path());
}

async function reopenSB3(page, bytes) {
    await fileMenu(page);
    const choosing = page.waitForEvent('filechooser');
    await page.getByText('コンピューターから読み込む', {exact: true}).click();
    await (await choosing).setFiles({name: 'authored.sb3', mimeType: 'application/octet-stream', buffer: bytes});
}

for (const [mode, spec] of [['embedded', embedded], ['remote', remote]]) {
    test(`authoring ${mode}: JS input calculates SHA-256, registers after approval and survives real SB3 save/reopen`, async ({page, context}, testInfo) => {
        if (mode === 'remote') await context.route(spec.url, route => route.fulfill({body: spec.bytes,
            headers: {'access-control-allow-origin': '*', 'content-type': 'application/javascript'}}));
        await openEditor(page);
        const before = await projectJSON(page);
        await approveAddition(page, spec, mode);
        expect((await projectJSON(page)).targets).toEqual(before.targets);

        const saved = await downloadSB3(page);
        const zip = await Zip.loadAsync(saved);
        const json = JSON.parse(await zip.file('project.json').async('string'));
        const manifest = json.turboWarpPlus.extensions;
        expect(manifest).toHaveLength(1);
        expect(manifest[0]).toMatchObject({id: spec.id, execution: 'unsandboxed', sha256: spec.sha256,
            source: mode === 'embedded' ? {type: mode} : {type: mode, url: spec.url}});
        expect(json.extensions).toContain(spec.id);
        expect(json.targets).toEqual(before.targets);
        if (mode === 'embedded') {
            expect(await zip.file(manifest[0].source.path).async('nodebuffer')).toEqual(spec.bytes);
        }
        await testInfo.attach('authored-manifest.json', {body: JSON.stringify(json.turboWarpPlus, null, 2), contentType: 'application/json'});
        await reopenSB3(page, saved);
        await expect.poll(() => runs(page, spec.id)).toBe(2);
        await expect(permission(page)).toHaveCount(0);
        expect((await projectJSON(page)).turboWarpPlus).toEqual(json.turboWarpPlus);
        expect((await projectJSON(page)).targets).toEqual(before.targets);
        expect(await page.evaluate(id => vm.runtime._primitives[`${id}_value`](), spec.id)).toBe(42);
    });
}

test('authoring retains both source types and opens the actual Packager to produce one offline HTML with recipient approval', async ({page, context}) => {
    test.setTimeout(120_000);
    const directory = await mkdtemp(path.join(tmpdir(), 'tw-plus-authored-html-'));
    try {
        await context.route(remote.url, route => route.fulfill({body: remote.bytes,
            headers: {'access-control-allow-origin': '*', 'content-type': 'application/javascript'}}));
        await openEditor(page);
        const before = await projectJSON(page);
        await approveAddition(page, embedded, 'embedded');
        await approveAddition(page, remote, 'remote');
        const authored = await projectJSON(page);
        expect(authored.targets).toEqual(before.targets);
        expect(authored.turboWarpPlus.extensions.map(item => item.id).sort()).toEqual([embedded.id, remote.id].sort());
        expect(await page.evaluate(ids => ids.every(id => vm.extensionManager.isExtensionLoaded(id)), [embedded.id, remote.id])).toBe(true);

        await fileMenu(page);
        const popup = page.waitForEvent('popup');
        await page.getByText('プロジェクトをパッケージ化する', {exact: true}).click();
        const builder = await popup;
        await expect(builder).toHaveURL(/\/plus-packager\.html$/);
        await expect(builder.getByTestId('plus-package-generate')).toBeEnabled();
        await builder.getByTestId('plus-package-resources').check();
        await builder.getByTestId('plus-package-generate').click();
        for (const spec of [embedded, remote]) {
            await expect(permission(builder)).toBeVisible();
            await expect(permission(builder).locator('[data-field="id"]')).toHaveText(spec.id);
            await expect(permission(builder).locator('[data-field="sha256"]')).toHaveText(spec.sha256);
            expect(await runs(builder, spec.id)).toBe(0);
            await builder.getByTestId('tw-plus-allow').click();
        }
        await expect(builder.getByTestId('plus-package-download')).toBeVisible();
        const downloading = builder.waitForEvent('download');
        await builder.getByTestId('plus-package-download').click();
        const download = await downloading;
        const output = path.join(directory, 'authored.html');
        await download.saveAs(output);
        expect(download.suggestedFilename()).toMatch(/\.html$/);
        await builder.close();

        await context.setOffline(true);
        const packaged = await context.newPage();
        const external = [];
        packaged.on('request', request => {
            if (/^https?:/.test(request.url())) external.push(request.url());
        });
        await packaged.goto(pathToFileURL(output).href);
        for (const spec of [embedded, remote]) {
            await expect(permission(packaged)).toBeVisible();
            await expect(permission(packaged).locator('[data-field="id"]')).toHaveText(spec.id);
            expect(await runs(packaged, spec.id)).toBe(0);
            await packaged.getByTestId('tw-plus-allow').click();
        }
        for (const spec of [embedded, remote]) {
            await expect.poll(() => runs(packaged, spec.id)).toBe(1);
            expect(await packaged.evaluate(id => vm.runtime._primitives[`${id}_value`](), spec.id)).toBe(42);
        }
        expect(await packaged.evaluate(() => vm.runtime.getTargetForStage().variables['authoring-retained'].value)).toBe('before addition');
        expect(external).toEqual([]);
        await expect(packaged.locator('#error')).toBeHidden();
        await packaged.close();
    } finally {
        await context.setOffline(false);
        await rm(directory, {recursive: true, force: true});
    }
});

test('authoring denial, invalid URL and duplicate ID preserve the current project without executing unapproved code', async ({page}) => {
    await openEditor(page);
    const before = await projectJSON(page);
    await fillAddition(page, embedded, 'embedded');
    await page.getByTestId('tw-plus-authoring-submit').click();
    await expect(permission(page)).toBeVisible();
    expect(await runs(page, embedded.id)).toBe(0);
    await page.getByTestId('tw-plus-deny').click();
    await expect(page.getByTestId('tw-plus-authoring-status')).toContainText(/TRUST_DENIED|許可/);
    expect(await projectJSON(page)).toEqual(before);
    expect(await runs(page, embedded.id)).toBe(0);
    await page.getByTestId('tw-plus-authoring-cancel').click();

    await fillAddition(page, {...remote, url: 'http://authoring-fixture.invalid/code.js'}, 'remote');
    await page.getByTestId('tw-plus-authoring-submit').click();
    await expect(page.getByTestId('tw-plus-authoring-status')).toContainText(/INVALID_SOURCE|HTTPS/);
    await expect(permission(page)).toHaveCount(0);
    expect(await projectJSON(page)).toEqual(before);
    expect(await runs(page, remote.id)).toBe(0);
    await page.getByTestId('tw-plus-authoring-cancel').click();

    await approveAddition(page, embedded, 'embedded');
    const after = await projectJSON(page);
    await fillAddition(page, embedded, 'embedded');
    await page.getByTestId('tw-plus-authoring-submit').click();
    await expect(page.getByTestId('tw-plus-authoring-status')).toContainText(/DUPLICATE|既に|重複/);
    await expect(permission(page)).toHaveCount(0);
    expect(await projectJSON(page)).toEqual(after);
    expect(await runs(page, embedded.id)).toBe(1);
});

test('authoring restores the original project when approved JavaScript registers a different extension ID', async ({page}, testInfo) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const recoveryEvidence = async name => {
        const evidence = await page.evaluate(() => ({
            status: document.querySelector('[data-testid="tw-plus-authoring-status"]')?.textContent,
            diagnostics: document.querySelector('[data-testid="tw-plus-extension-status"]')?.textContent
        }));
        evidence.pageErrors = pageErrors;
        await testInfo.attach(name, {body: JSON.stringify(evidence, null, 2), contentType: 'application/json'});
        return evidence;
    };
    await openEditor(page);
    const before = await projectJSON(page);
    await fillAddition(page, {...embedded, id: 'authormismatch'}, 'embedded');
    await page.getByTestId('tw-plus-authoring-submit').click();
    await expect(permission(page)).toBeVisible();
    await expect(permission(page).locator('[data-field="id"]')).toHaveText('authormismatch');
    expect(await runs(page, embedded.id)).toBe(0);
    await page.getByTestId('tw-plus-allow').click();
    await expect(page.getByTestId('tw-plus-authoring-status')).toContainText('追加できませんでした');
    await expect(page.getByTestId('tw-plus-authoring-status')).not.toContainText('PROJECT_RECOVERY_REQUIRED');
    expect(await projectJSON(page)).toEqual(before);
    // Approval permits evaluation, while the mismatched ID still prevents registration.
    expect(await runs(page, embedded.id)).toBe(1);
    expect(await page.evaluate(() => vm.extensionManager.isExtensionLoaded('authormismatch'))).toBe(false);
    expect(await page.evaluate(id => vm.extensionManager.isExtensionLoaded(id), embedded.id)).toBe(false);
    await recoveryEvidence('recovery-before-retry.json');
    await page.getByTestId('tw-plus-authoring-cancel').click();
    try {
        await approveAddition(page, remote, 'embedded');
    } catch (error) {
        await recoveryEvidence('recovery-after-failed-retry.json');
        throw error;
    }
    expect((await projectJSON(page)).targets).toEqual(before.targets);
});

test('default-off Editor omits the authoring entry and cannot enable it by changing the URL after startup', async ({page}) => {
    await openEditor(page, false);
    await fileMenu(page);
    await expect(page.getByTestId('tw-plus-add-extension')).toHaveCount(0);
    await expect(page.getByTestId('tw-plus-authoring')).toHaveCount(0);
    await page.getByText('ファイル', {exact: true}).click();
    await page.evaluate(() => history.replaceState(null, '', `${location.pathname}?lang=ja&twPlusExtensionLoader=1`));
    await fileMenu(page);
    await expect(page.getByTestId('tw-plus-add-extension')).toHaveCount(0);
    await expect(page.getByTestId('tw-plus-authoring')).toHaveCount(0);
});

test('mobile viewport keeps authoring, consent and catalog controls visible and operable', async ({browser, baseURL}, testInfo) => {
    const context = await browser.newContext({...devices['Pixel 7'],
        viewport: {width: 390, height: 844}, locale: 'ja-JP'});
    try {
        await context.route('https://kubohiroya.github.io/turbowarp-plus-packages/extensions-v1.json',
            route => route.fulfill({json: {schemaVersion: 1, extensions: [{id: embedded.id,
                name: 'Mobile authoring fixture', version: '1.0.0', url: embedded.url,
                dependencies: [], unsandboxed: 'optional'}]},
                headers: {'access-control-allow-origin': '*'}}));
        const page = await context.newPage();
        await page.goto(new URL('editor.html?lang=ja&twPlusExtensionLoader=1', baseURL).href);
        await page.waitForFunction(() => globalThis.vm?.runtime?.targets?.length > 0);
        const before = await projectJSON(page);
        const withinViewport = async locator => {
            await expect.poll(() => locator.evaluate(node => {
                const rect = node.getBoundingClientRect();
                const viewport = window.visualViewport;
                const left = rect.left - viewport.offsetLeft;
                const top = rect.top - viewport.offsetTop;
                return left >= -1 && top >= -1 && left + rect.width <= viewport.width + 1 &&
                    top + rect.height <= viewport.height + 1 && node.scrollWidth <= node.clientWidth + 1;
            })).toBe(true);
        };
        // Narrow hosts show a file icon while hiding its text label.
        await page.getByText('ファイル', {exact: true}).locator('xpath=../..').click();
        await page.getByTestId('tw-plus-add-extension').click();
        await withinViewport(page.getByTestId('tw-plus-authoring'));
        await testInfo.attach('mobile-authoring.png', {body: await page.screenshot({scale: 'css'}),
            contentType: 'image/png'});
        await page.getByTestId('tw-plus-authoring-id').fill(embedded.id);
        await page.getByTestId('tw-plus-authoring-file').setInputFiles({name: 'mobile.js',
            mimeType: 'application/javascript', buffer: embedded.bytes});
        await page.getByTestId('tw-plus-authoring-submit').click();
        await expect(permission(page)).toBeVisible();
        await withinViewport(permission(page));
        expect(await runs(page, embedded.id)).toBe(0);
        await page.getByTestId('tw-plus-deny').click();
        await expect(page.getByTestId('tw-plus-authoring-status')).toContainText(/TRUST_DENIED|許可/);
        expect(await projectJSON(page)).toEqual(before);
        await page.getByTestId('tw-plus-authoring-cancel').click();
        await page.getByRole('button', {name: '拡張機能を追加', exact: true}).click();
        await page.getByText('TurboWarp Plus', {exact: true}).click();
        const selection = page.locator('.twextsec-selection');
        await expect(selection.locator('article')).toHaveCount(1);
        await withinViewport(selection);
        await selection.locator('button[data-execution="unsandboxed"]').click();
        await selection.locator('button[data-distribution="embedded"]').click();
        await selection.locator('article').getByRole('checkbox').check();
        const apply = selection.getByRole('button', {name: '拡張の設定を適用', exact: true});
        await expect(apply).toBeEnabled();
        await withinViewport(apply);
        await testInfo.attach('mobile-catalog.png', {body: await page.screenshot({scale: 'css'}),
            contentType: 'image/png'});
    } finally {
        await context.close();
    }
});
