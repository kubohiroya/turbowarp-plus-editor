const {test, expect} = require('./fixtures.cts');
const {devices} = require('@playwright/test');
const {createHash} = require('node:crypto');
const {readFile, mkdtemp, rm} = require('node:fs/promises');
const {tmpdir} = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const Zip = require('@turbowarp/jszip');

test.use({userAgent: devices['Pixel 7'].userAgent});

const catalogURL = 'https://kubohiroya.github.io/turbowarp-plus-packages/extensions-v1.json';
function fixture(id, execution, distribution) {
    const source = `// Name: ${id}\n// ID: ${id}\n// Version: 1.0.0\n// Unsandboxed: optional\n// License: MIT\n
(function(Scratch) {
 const execution = Scratch.extensions.unsandboxed ? 'unsandboxed' : 'sandboxed';
 const vmAccess = typeof Scratch.vm !== 'undefined';
 if (Scratch.extensions.unsandboxed) {
  globalThis.__catalogAuthoringRuns = globalThis.__catalogAuthoringRuns || {};
  globalThis.__catalogAuthoringRuns['${id}'] = (globalThis.__catalogAuthoringRuns['${id}'] || 0) + 1;
 }
 Scratch.extensions.register({
  getInfo() { return {id: '${id}', name: '${id}', blocks: [
   {opcode: 'value', blockType: Scratch.BlockType.REPORTER, text: '${id} mode'}
  ]}; },
  value() { return execution + ':' + (vmAccess ? 'vm' : 'no-vm'); }
 });
})(Scratch);\n`;
    const bytes = Buffer.from(source);
    return {id, execution, distribution, bytes, sha256: createHash('sha256').update(bytes).digest('hex'),
        url: `https://catalog-authoring.invalid/${id}.js`};
}
const specifications = [
    fixture('catembeddedunsandboxed', 'unsandboxed', 'embedded'),
    fixture('catremoteunsandboxed', 'unsandboxed', 'remote'),
    fixture('catembeddedsandboxed', 'sandboxed', 'embedded'),
    fixture('catremotesandboxed', 'sandboxed', 'remote')
];
const permission = page => page.getByTestId('tw-plus-permission');
const selection = page => page.locator('.twextsec-selection');
const row = (page, spec) => selection(page).locator(`article[data-extension-id="${spec.id}"]`);
const projectJSON = page => page.evaluate(() => JSON.parse(vm.toJSON()));

async function installFixtures(context) {
    await context.route(catalogURL, route => route.fulfill({json: {schemaVersion: 1,
        extensions: specifications.map(spec => ({id: spec.id, name: spec.id, version: '1.0.0', url: spec.url,
            dependencies: [], unsandboxed: 'optional', description: 'Catalog authoring browser fixture', license: 'MIT'}))},
        headers: {'access-control-allow-origin': '*'}}));
    await context.route('https://extensions.turbowarp.org/generated-metadata/extensions-v0.json',
        route => route.fulfill({json: {extensions: []}, headers: {'access-control-allow-origin': '*'}}));
    for (const spec of specifications) {
        await context.route(spec.url, route => route.fulfill({body: spec.bytes,
            headers: {'content-type': 'application/javascript', 'access-control-allow-origin': '*'}}));
    }
}

async function openEditor(page, enabled = true) {
    await page.goto(`editor.html?lang=ja${enabled ? '' : '&twPlusExtensionLoader=0&twPlusExtensions=1'}`);
    await page.waitForFunction(() => globalThis.vm?.runtime?.targets?.length > 0);
}

async function openCatalog(page) {
    await page.getByRole('button', {name: '拡張機能を追加', exact: true}).click();
    await page.getByText('TurboWarp Plus', {exact: true}).click();
    await expect(selection(page)).toBeVisible();
    await expect(selection(page).locator('article')).toHaveCount(specifications.length);
}

test('catalog checkboxes alone exclude packages and dependencies stay selected without a deny mode', async ({page, context}) => {
    await installFixtures(context);
    const base = specifications[0];
    const parent = specifications[1];
    const unchecked = specifications[2];
    await context.route(catalogURL, route => route.fulfill({json: {schemaVersion: 1,
        extensions: specifications.map(spec => ({id: spec.id, name: spec.id, version: '1.0.0', url: spec.url,
            dependencies: spec.id === parent.id ? [base.id] : [], unsandboxed: 'optional'}))},
        headers: {'access-control-allow-origin': '*'}}));
    await openEditor(page);
    await openCatalog(page);
    await expect(selection(page).locator('input[value="deny"], button[data-execution="deny"]')).toHaveCount(0);
    await expect(row(page, unchecked).locator('input[type="radio"]:enabled')).toHaveCount(0);
    await selection(page).locator('button[data-execution="unsandboxed"]').click();
    await selection(page).locator('button[data-distribution="embedded"]').click();
    await row(page, unchecked).getByRole('checkbox').check();
    await expect(row(page, unchecked).locator('input[value="unsandboxed"]')).toBeEnabled();
    await row(page, unchecked).getByRole('checkbox').uncheck();
    await row(page, parent).getByRole('checkbox').check();
    await expect(row(page, base)).toHaveAttribute('data-selection-state', 'dependency');
    await expect(row(page, base).getByRole('checkbox')).toBeChecked();
    await expect(row(page, base).getByRole('checkbox')).toBeDisabled();
    await expect(row(page, base)).toContainText(parent.id);
    await row(page, parent).getByRole('checkbox').uncheck();
    await expect(row(page, base).getByRole('checkbox')).not.toBeChecked();
    await expect(row(page, base).locator('input[type="radio"]:enabled')).toHaveCount(0);
    await expect(selection(page).getByRole('button', {name: '拡張の設定を適用', exact: true})).toBeDisabled();
    await row(page, parent).getByRole('checkbox').check();
    await applySettings(page);
    await approveAll(page, [base, parent], {beforeEvaluation: true});
    await expect(selection(page)).toHaveCount(0);
    const saved = (await projectJSON(page)).turboWarpPlus.extensions;
    expect(saved.map(spec => spec.id)).toEqual([base.id, parent.id]);
    expect(saved.find(spec => spec.id === parent.id).dependencies).toEqual([base.id]);
    expect(await page.evaluate(id => vm.extensionManager.isExtensionLoaded(id), unchecked.id)).toBe(false);
});

async function applySettings(page) {
    await selection(page).getByRole('button', {name: '拡張の設定を適用', exact: true}).click();
}

async function approveAll(page, specs, {beforeEvaluation = false} = {}) {
    const seen = new Set();
    for (let i = 0; i < specs.length; i++) {
        await expect(permission(page)).toBeVisible();
        const id = await permission(page).locator('[data-field="id"]').textContent();
        const spec = specs.find(item => item.id === id);
        expect(spec, `Unexpected permission ID ${id}`).toBeTruthy();
        expect(seen.has(id)).toBe(false);
        seen.add(id);
        await expect(permission(page).locator('[data-field="sha256"]')).toHaveText(spec.sha256);
        await expect(permission(page).locator('[data-field="execution"]')).toHaveText(spec.execution);
        if (beforeEvaluation) {
            expect(await page.evaluate(() => globalThis.__catalogAuthoringRuns || {})).toEqual({});
            await expect(page.getByTestId('tw-plus-sandbox-frame')).toHaveCount(0);
        }
        await page.getByTestId('tw-plus-allow').click();
    }
    await expect(permission(page)).toHaveCount(0);
}

async function assertModes(page) {
    await expect.poll(() => page.evaluate(ids => ids.every(id => vm.extensionManager.isExtensionLoaded(id)),
        specifications.map(spec => spec.id))).toBe(true);
    await expect(page.getByTestId('tw-plus-sandbox-frame')).toHaveCount(2);
    for (const frame of await page.getByTestId('tw-plus-sandbox-frame').all()) {
        await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
    }
    for (const spec of specifications) {
        const value = await page.evaluate(async id => vm.runtime._primitives[`${id}_value`](), spec.id);
        expect(value).toBe(`${spec.execution}:${spec.execution === 'sandboxed' ? 'no-vm' : 'vm'}`);
    }
}

async function saveSB3(page) {
    await page.getByText('ファイル', {exact: true}).click();
    const downloading = page.waitForEvent('download');
    await page.getByRole('listitem').filter({hasText: /^コンピューターに保存する$/}).click();
    return readFile(await (await downloading).path());
}

async function reopenSB3(page, bytes) {
    await page.getByText('ファイル', {exact: true}).click();
    const choosing = page.waitForEvent('filechooser');
    await page.getByText('コンピューターから読み込む', {exact: true}).click();
    await (await choosing).setFiles({name: 'catalog-authored.sb3', mimeType: 'application/octet-stream', buffer: bytes});
}

test('catalog selects all four execution/source combinations, restores loaded choices, and packages one offline HTML', async ({page, context}, testInfo) => {
    test.setTimeout(150_000);
    const directory = await mkdtemp(path.join(tmpdir(), 'tw-plus-catalog-authoring-'));
    try {
        await installFixtures(context);
        await openEditor(page);
        const before = await projectJSON(page);
        await openCatalog(page);
        await selection(page).locator('button[data-distribution="embedded"]').click();
        await selection(page).locator('button[data-execution="unsandboxed"]').click();
        for (const spec of specifications) {
            await expect(row(page, spec)).toHaveAttribute('data-distribution', 'embedded');
            await expect(row(page, spec).locator('input[type="radio"][value="unsandboxed"]')).toBeChecked();
            await row(page, spec).getByRole('checkbox').check();
            await row(page, spec).locator(`input[type="radio"][value="${spec.execution}"]`).check();
            await row(page, spec).locator(`input[data-distribution="${spec.distribution}"]`).check();
        }
        expect(await page.evaluate(() => globalThis.__catalogAuthoringRuns || {})).toEqual({});
        await applySettings(page);
        await approveAll(page, specifications, {beforeEvaluation: true});
        await expect(selection(page)).toHaveCount(0);
        await assertModes(page);
        expect((await projectJSON(page)).targets).toEqual(before.targets);

        const saved = await saveSB3(page);
        const zip = await Zip.loadAsync(saved);
        const json = JSON.parse(await zip.file('project.json').async('string'));
        expect(json.turboWarpPlus.extensions).toHaveLength(4);
        for (const spec of specifications) {
            const stored = json.turboWarpPlus.extensions.find(item => item.id === spec.id);
            expect(stored).toMatchObject({execution: spec.execution, sha256: spec.sha256, source: {type: spec.distribution}});
            if (spec.distribution === 'embedded') {
                expect(await zip.file(stored.source.path).async('nodebuffer')).toEqual(spec.bytes);
            } else expect(stored.source.url).toBe(spec.url);
        }
        await testInfo.attach('catalog-authored-manifest.json', {body: JSON.stringify(json.turboWarpPlus, null, 2), contentType: 'application/json'});
        await reopenSB3(page, saved);
        await expect.poll(() => page.evaluate(id => globalThis.__catalogAuthoringRuns?.[id] || 0, specifications[0].id)).toBe(2);
        await assertModes(page);
        await openCatalog(page);
        for (const spec of specifications) {
            await expect(row(page, spec)).toHaveAttribute('data-selection-state', 'loaded');
            await expect(row(page, spec).getByRole('checkbox')).toBeChecked();
            await expect(row(page, spec).getByRole('checkbox')).toBeDisabled();
            await expect(row(page, spec).locator(`input[type="radio"][value="${spec.execution}"]`)).toBeChecked();
            await expect(row(page, spec).locator(`input[data-distribution="${spec.distribution}"]`)).toBeChecked();
        }

        // Changing a loaded extension's distribution preserves the reviewed code digest.
        const converted = specifications[1];
        await row(page, converted).locator('input[data-distribution="embedded"]').check();
        await applySettings(page);
        await approveAll(page, [converted]);
        await expect(selection(page)).toHaveCount(0);
        await assertModes(page);
        const afterConversion = await Zip.loadAsync(await saveSB3(page));
        const convertedJSON = JSON.parse(await afterConversion.file('project.json').async('string'));
        const stored = convertedJSON.turboWarpPlus.extensions.find(item => item.id === converted.id);
        expect(stored).toMatchObject({execution: 'unsandboxed', sha256: converted.sha256, source: {type: 'embedded'}});
        expect(await afterConversion.file(stored.source.path).async('nodebuffer')).toEqual(converted.bytes);

        await page.getByText('ファイル', {exact: true}).click();
        const opening = page.waitForEvent('popup');
        await page.getByText('プロジェクトをパッケージ化する', {exact: true}).click();
        const builder = await opening;
        await expect(builder).toHaveURL(/\/plus-packager\.html$/);
        await expect(builder.getByTestId('plus-package-generate')).toBeEnabled();
        await builder.getByTestId('plus-package-resources').check();
        await builder.getByTestId('plus-package-generate').click();
        await approveAll(builder, specifications, {beforeEvaluation: true});
        await expect(builder.getByTestId('plus-package-download')).toBeVisible();
        const downloading = builder.waitForEvent('download');
        await builder.getByTestId('plus-package-download').click();
        const output = path.join(directory, 'catalog-authored.html');
        await (await downloading).saveAs(output);
        await builder.close();

        await context.setOffline(true);
        const packaged = await context.newPage();
        const external = [];
        const pageErrors = [];
        const consoleErrors = [];
        packaged.on('pageerror', (error: Error & {code?: string; status?: number; errors?: Error[]}) => pageErrors.push(error.message));
        packaged.on('console', message => {
            if (['error', 'warning', 'warn'].includes(message.type())) consoleErrors.push(message.text());
        });
        packaged.on('request', request => {
            if (/^https?:/.test(request.url())) external.push(request.url());
        });
        await packaged.goto(pathToFileURL(output).href);
        await approveAll(packaged, specifications, {beforeEvaluation: true});
        try {
            await assertModes(packaged);
        } catch (error) {
            const evidence = await packaged.evaluate(() => ({
                url: location.href,
                loader: globalThis.__TW_PLUS_PACKAGE_HOST__?.loader?.getState(),
                loaded: [...(globalThis.vm?.extensionManager?._loadedExtensions?.keys() || [])],
                diagnostics: document.querySelector<HTMLElement>('[data-testid="tw-plus-extension-status"]')?.textContent,
                error: document.querySelector<HTMLElement>('#error')?.textContent,
                csp: document.querySelector<HTMLMetaElement>('meta[http-equiv="Content-Security-Policy"]')?.content,
                frames: [...document.querySelectorAll<HTMLIFrameElement>('[data-testid="tw-plus-sandbox-frame"]')].map(frame => ({
                    id: frame.dataset.extensionId, sandbox: frame.getAttribute('sandbox'), src: frame.src
                }))
            }));
            evidence.frameDocuments = await Promise.all(packaged.frames().map(frame => Promise.race([
                frame.evaluate(() => ({url: location.href, readyState: document.readyState,
                    scripts: [...document.scripts].map(script => ({src: script.src, length: script.textContent.length})),
                    scratch: typeof Scratch, body: document.body?.textContent.slice(0, 200)}))
                    .catch((cause: Error & {code?: string; status?: number; errors?: Error[]}) => ({error: cause.message})),
                new Promise(resolve => setTimeout(() => resolve({url: frame.url(), inspectionTimedOut: true}), 2000))
            ])));
            Object.assign(evidence, {pageErrors, consoleErrors, external});
            await testInfo.attach('packaged-runtime-failure.json', {body: JSON.stringify(evidence, null, 2), contentType: 'application/json'});
            await testInfo.attach('failed-catalog-package.html', {path: output, contentType: 'text/html'});
            console.log('CATALOG_PACKAGED_RUNTIME_FAILURE', JSON.stringify(evidence));
            throw error;
        }
        expect(external).toEqual([]);
        await expect(packaged.locator('#error')).toBeHidden();
        await packaged.close();
    } finally {
        await context.setOffline(false);
        await rm(directory, {recursive: true, force: true});
    }
});

test('catalog refusing the second extension leaves the complete original project and executes neither selection', async ({page, context}) => {
    await installFixtures(context);
    await openEditor(page);
    const before = await projectJSON(page);
    await openCatalog(page);
    for (const spec of specifications.slice(0, 2)) {
        await row(page, spec).getByRole('checkbox').check();
        await row(page, spec).locator('input[type="radio"][value="unsandboxed"]').check();
    }
    await applySettings(page);
    await expect(permission(page)).toBeVisible();
    const firstID = await permission(page).locator('[data-field="id"]').textContent();
    await page.getByTestId('tw-plus-allow').click();
    await expect(permission(page)).toBeVisible();
    await expect(permission(page).locator('[data-field="id"]')).not.toHaveText(firstID);
    expect(await page.evaluate(() => globalThis.__catalogAuthoringRuns || {})).toEqual({});
    await page.getByTestId('tw-plus-deny').click();
    await expect(permission(page)).toHaveCount(0);
    await expect(selection(page)).toBeVisible();
    await expect(page.getByRole('alert')).toContainText(/読み込|許可|拒否/);
    expect(await projectJSON(page)).toEqual(before);
    expect(await page.evaluate(() => globalThis.__catalogAuthoringRuns || {})).toEqual({});
    expect(await page.evaluate(ids => ids.some(id => vm.extensionManager.isExtensionLoaded(id)), specifications.map(spec => spec.id))).toBe(false);
    await expect(page.getByTestId('tw-plus-sandbox-frame')).toHaveCount(0);
});

test('catalog keeps distribution controls off when the Loader startup flag is explicitly disabled', async ({page, context}) => {
    await installFixtures(context);
    await openEditor(page, false);
    await openCatalog(page);
    await expect(selection(page).locator('[data-distribution]')).toHaveCount(0);
    await expect(selection(page).locator('input[type="radio"]')).toHaveCount(0);
    await expect(page.getByTestId('tw-plus-permission')).toHaveCount(0);
    expect(await page.evaluate(() => globalThis.__catalogAuthoringRuns || {})).toEqual({});
});

test('catalog changes a loaded extension execution mode with the same digest and disposes its old sandbox', async ({page, context}) => {
    await installFixtures(context);
    await openEditor(page);
    const spec = specifications[3];
    await openCatalog(page);
    await row(page, spec).getByRole('checkbox').check();
    await row(page, spec).locator('input[type="radio"][value="sandboxed"]').check();
    await applySettings(page);
    await approveAll(page, [spec], {beforeEvaluation: true});
    await expect(selection(page)).toHaveCount(0);
    await expect(page.getByTestId('tw-plus-sandbox-frame')).toHaveCount(1);
    expect(await page.evaluate(id => vm.runtime._primitives[`${id}_value`](), spec.id)).toBe('sandboxed:no-vm');

    await openCatalog(page);
    await expect(row(page, spec).getByRole('checkbox')).toBeChecked();
    await expect(row(page, spec).locator('input[type="radio"][value="sandboxed"]')).toBeChecked();
    await row(page, spec).locator('input[type="radio"][value="unsandboxed"]').check();
    await applySettings(page);
    await expect(permission(page)).toBeVisible();
    await expect(permission(page).locator('[data-field="execution"]')).toHaveText('unsandboxed');
    await expect(permission(page).locator('[data-field="sha256"]')).toHaveText(spec.sha256);
    // The running project is retained until permission for the new mode is granted.
    await expect(page.getByTestId('tw-plus-sandbox-frame')).toHaveCount(1);
    expect(await page.evaluate(id => vm.runtime._primitives[`${id}_value`](), spec.id)).toBe('sandboxed:no-vm');
    await page.getByTestId('tw-plus-allow').click();
    await expect(selection(page)).toHaveCount(0);
    await expect(page.getByTestId('tw-plus-sandbox-frame')).toHaveCount(0);
    expect(await page.evaluate(id => vm.runtime._primitives[`${id}_value`](), spec.id)).toBe('unsandboxed:vm');
    expect((await projectJSON(page)).turboWarpPlus.extensions[0]).toMatchObject({
        id: spec.id, execution: 'unsandboxed', sha256: spec.sha256, source: {type: 'remote', url: spec.url}
    });

    await openCatalog(page);
    await expect(row(page, spec).locator('input[type="radio"][value="unsandboxed"]')).toBeChecked();
    await row(page, spec).locator('input[type="radio"][value="sandboxed"]').check();
    await applySettings(page);
    // Exact content, source and sandboxed mode were already approved in this host session.
    await expect(selection(page)).toHaveCount(0);
    await expect(permission(page)).toHaveCount(0);
    await expect(page.getByTestId('tw-plus-sandbox-frame')).toHaveCount(1);
    expect(await page.evaluate(id => vm.runtime._primitives[`${id}_value`](), spec.id)).toBe('sandboxed:no-vm');
    expect((await projectJSON(page)).turboWarpPlus.extensions[0]).toMatchObject({execution: 'sandboxed', sha256: spec.sha256});
});

test('catalog adopts a previously native-loaded extension without losing its actual mode or leaving its old iframe', async ({page, context}) => {
    await installFixtures(context);
    await openEditor(page);
    const spec = specifications[3];
    // Model an extension already loaded through the earlier VM URL path.
    await page.evaluate(async url => {
        const security = vm.extensionManager.securityManager;
        const original = security.getSandboxMode;
        security.getSandboxMode = function (requested) {
            return requested === url ? 'iframe' : original.call(this, requested);
        };
        try { await vm.extensionManager.loadExtensionURL(url); }
        finally { security.getSandboxMode = original; }
    }, spec.url);
    expect(await page.evaluate(id => vm.extensionManager.isExtensionLoaded(id), spec.id)).toBe(true);
    expect(await page.evaluate(id => vm.runtime._primitives[`${id}_value`](), spec.id)).toBe('sandboxed:no-vm');
    const nativeFrame = page.locator('iframe.tw-custom-extension-frame');
    await expect(nativeFrame).toHaveCount(1);
    const nativeFrameID = await nativeFrame.getAttribute('data-id');
    expect(nativeFrameID).toBeTruthy();

    await openCatalog(page);
    await expect(row(page, spec)).toHaveAttribute('data-selection-state', 'loaded');
    await expect(row(page, spec).getByRole('checkbox')).toBeChecked();
    await expect(row(page, spec).getByRole('checkbox')).toBeDisabled();
    await expect(row(page, spec).locator('input[type="radio"][value="sandboxed"]')).toBeChecked();
    await row(page, spec).locator('input[data-distribution="embedded"]').check();
    await applySettings(page);
    await approveAll(page, [spec]);
    await expect(selection(page)).toHaveCount(0);
    await expect(page.locator(`iframe.tw-custom-extension-frame[data-id="${nativeFrameID}"]`)).toHaveCount(0);
    await expect(page.getByTestId('tw-plus-sandbox-frame')).toHaveCount(1);
    expect(await page.evaluate(id => vm.runtime._primitives[`${id}_value`](), spec.id)).toBe('sandboxed:no-vm');

    const zip = await Zip.loadAsync(await saveSB3(page));
    const json = JSON.parse(await zip.file('project.json').async('string'));
    const stored = json.turboWarpPlus.extensions.find(entry => entry.id === spec.id);
    expect(stored).toMatchObject({execution: 'sandboxed', sha256: spec.sha256, source: {type: 'embedded'}});
    expect(await zip.file(stored.source.path).async('nodebuffer')).toEqual(spec.bytes);
});
