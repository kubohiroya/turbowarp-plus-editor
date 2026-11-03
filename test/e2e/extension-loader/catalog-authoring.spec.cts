const {test, expect} = require('./fixtures.cts');
const {devices} = require('@playwright/test');
const {mkdtemp, rm} = require('node:fs/promises');
const {tmpdir} = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const Zip = require('@turbowarp/jszip');
const {catalogURL, specifications, installFixtures, selection, row, form, openCatalog, saveSB3, reopenSB3} =
    require('./catalog.cts');

test.use({userAgent: devices['Pixel 7'].userAgent});

const permission = page => page.getByTestId('tw-plus-permission');
const projectJSON = page => page.evaluate(() => JSON.parse(vm.toJSON()));

async function openEditor(page, enabled = true) {
    await page.goto(`editor.html?lang=ja${enabled ? '' : '&twPlusExtensionLoader=0&twPlusExtensions=1'}`);
    await page.waitForFunction(() => globalThis.vm?.runtime?.targets?.length > 0);
}

test('catalog checkboxes alone exclude packages, dependencies stay selected, and nothing asks how they run', async ({page, context}) => {
    await installFixtures(context);
    const base = specifications[0];
    const parent = specifications[1];
    const unchecked = specifications[2];
    await context.route(catalogURL, route => route.fulfill({json: {schemaVersion: 1,
        extensions: specifications.map(spec => ({id: spec.id, name: spec.id, version: '1.0.0', url: spec.url,
            sha256: spec.sha256, dependencies: spec.id === parent.id ? [base.id] : [], unsandboxed: 'optional'}))},
        headers: {'access-control-allow-origin': '*'}}));
    await openEditor(page);
    await openCatalog(page);
    // Trusted rows are stated, not asked: no execution choice, and no way to refuse them here.
    await expect(selection(page).locator('.twextsec-row input[name^="execution-"]')).toHaveCount(0);
    await expect(row(page, unchecked).locator('.twextsec-trusted')).toBeVisible();
    await row(page, parent).getByRole('checkbox').check();
    await expect(row(page, base).locator('.twextsec-state')).toContainText(parent.id);
    await expect(row(page, base).getByRole('checkbox')).toBeChecked();
    await expect(row(page, base).getByRole('checkbox')).toBeDisabled();
    await row(page, parent).getByRole('checkbox').uncheck();
    await expect(row(page, base).getByRole('checkbox')).not.toBeChecked();
    await row(page, parent).getByRole('checkbox').check();
    await applySettings(page);
    await expectTrusted(page, [base, parent]);
    await expect(selection(page)).toHaveCount(0);
    const saved = (await projectJSON(page)).turboWarpPlus.extensions;
    expect(saved.map(spec => spec.id)).toEqual([base.id, parent.id]);
    expect(saved.find(spec => spec.id === parent.id).dependencies).toEqual([base.id]);
    expect(await page.evaluate(id => vm.extensionManager.isExtensionLoaded(id), unchecked.id)).toBe(false);
});

async function applySettings(page) {
    await selection(page).getByRole('button', {name: '追加', exact: true}).click();
}

// Catalog-listed extensions are trusted like TurboWarp's official gallery: no per-extension approval.
async function expectTrusted(page, specs) {
    await expect.poll(() => page.evaluate(ids => ids.every(id => vm.extensionManager.isExtensionLoaded(id)),
        specs.map(spec => spec.id))).toBe(true);
    await expect(permission(page)).toHaveCount(0);
}

async function assertModes(page, specs = specifications) {
    await expect.poll(() => page.evaluate(ids => ids.every(id => vm.extensionManager.isExtensionLoaded(id)),
        specs.map(spec => spec.id))).toBe(true);
    // Every catalog extension runs without the sandbox, with the VM in reach.
    await expect(page.getByTestId('tw-plus-sandbox-frame')).toHaveCount(0);
    for (const spec of specs) {
        const value = await page.evaluate(async id => vm.runtime._primitives[`${id}_value`](), spec.id);
        expect(value).toBe('unsandboxed:vm');
    }
}

test('catalog writes all four loading forms, restores them, and packages one offline HTML', async ({page, context}, testInfo) => {
    test.setTimeout(150_000);
    const directory = await mkdtemp(path.join(tmpdir(), 'tw-plus-catalog-authoring-'));
    try {
        await installFixtures(context);
        await openEditor(page);
        const before = await projectJSON(page);
        await openCatalog(page);
        await selection(page).locator('.twextsec-bulk').getByRole('radio', {name: '作品の中から', exact: true}).click();
        for (const spec of specifications) {
            await expect(form(page, spec, 'embedded-file')).toBeChecked();
            await row(page, spec).getByRole('checkbox').check();
            await form(page, spec).check();
        }
        expect(await page.evaluate(() => globalThis.__catalogAuthoringRuns || {})).toEqual({});
        await applySettings(page);
        await expectTrusted(page, specifications);
        await expect(selection(page)).toHaveCount(0);
        await assertModes(page);
        expect((await projectJSON(page)).targets).toEqual(before.targets);

        const saved = await saveSB3(page);
        const zip = await Zip.loadAsync(saved);
        const json = JSON.parse(await zip.file('project.json').async('string'));
        expect(json.turboWarpPlus.extensions).toHaveLength(4);
        for (const spec of specifications) {
            const stored = json.turboWarpPlus.extensions.find(item => item.id === spec.id);
            expect(stored).toMatchObject({execution: 'unsandboxed', sha256: spec.sha256,
                source: {type: spec.distribution}});
            if (spec.distribution === 'embedded-file') {
                expect(await zip.file(stored.source.path).async('nodebuffer')).toEqual(spec.bytes);
            } else if (spec.distribution === 'embedded-data') {
                // The bytes are the address a standard TurboWarp host loads, in the project document.
                expect(json.extensionURLs[spec.id].startsWith('data:')).toBe(true);
            } else expect(stored.source.url).toBe(spec.url);
        }
        await testInfo.attach('catalog-authored-manifest.json', {body: JSON.stringify(json.turboWarpPlus, null, 2), contentType: 'application/json'});
        await reopenSB3(page, saved);
        await expect.poll(() => page.evaluate(id => globalThis.__catalogAuthoringRuns?.[id] || 0, specifications[0].id)).toBe(2);
        await assertModes(page);
        await openCatalog(page);
        for (const spec of specifications) {
            await expect(row(page, spec).locator('.twextsec-state')).toHaveText('読み込み済み');
            await expect(row(page, spec).getByRole('checkbox')).toBeChecked();
            await expect(row(page, spec).getByRole('checkbox')).toBeDisabled();
            await expect(form(page, spec)).toBeChecked();
        }

        // Changing a loaded extension's distribution preserves the reviewed code digest.
        const converted = specifications[2];
        await form(page, converted, 'embedded-file').check();
        await applySettings(page);
        await expectTrusted(page, [converted]);
        await expect(selection(page)).toHaveCount(0);
        await assertModes(page);
        const afterConversion = await Zip.loadAsync(await saveSB3(page));
        const convertedJSON = JSON.parse(await afterConversion.file('project.json').async('string'));
        const stored = convertedJSON.turboWarpPlus.extensions.find(item => item.id === converted.id);
        expect(stored).toMatchObject({execution: 'unsandboxed', sha256: converted.sha256, source: {type: 'embedded-file'}});
        expect(await afterConversion.file(stored.source.path).async('nodebuffer')).toEqual(converted.bytes);

        await page.getByText('ファイル', {exact: true}).click();
        const opening = page.waitForEvent('popup');
        await page.getByText('プロジェクトをパッケージ化する', {exact: true}).click();
        const builder = await opening;
        await expect(builder).toHaveURL(/\/plus-packager\.html$/);
        await expect(builder.getByTestId('plus-package-generate')).toBeEnabled();
        await builder.getByTestId('plus-package-resources').check();
        await builder.getByTestId('plus-package-generate').click();
        // The builder reads the same catalog, so building asks nobody either.
        await expect(builder.getByTestId('plus-package-download')).toBeVisible();
        await expect(permission(builder)).toHaveCount(0);
        await expect(builder.getByTestId('plus-package-status'))
            .toHaveText('HTMLを生成しました。拡張はすべてカタログに載っているので、このHTMLを開いても許可の確認は出ません。');
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
        // The offline HTML cannot read the catalog; it trusts the listed digests its builder embedded.
        await expectTrusted(packaged, specifications);
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

test('mobile viewport keeps catalog and distribution controls visible and operable', async ({browser, baseURL}, testInfo) => {
    const context = await browser.newContext({...devices['Pixel 7'],
        viewport: {width: 390, height: 844}, locale: 'ja-JP'});
    try {
        await installFixtures(context);
        const page = await context.newPage();
        await page.goto(new URL('editor.html?lang=ja', baseURL).href);
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
        await openCatalog(page);
        await withinViewport(selection(page));
        await selection(page).locator('.twextsec-bulk').getByRole('radio', {name: '作品の中から', exact: true}).click();
        await row(page, specifications[0]).getByRole('checkbox').check();
        const apply = selection(page).getByRole('button', {name: '追加', exact: true});
        await apply.scrollIntoViewIfNeeded();
        await expect(apply).toBeEnabled();
        await withinViewport(apply);
        await testInfo.attach('mobile-catalog.png', {body: await page.screenshot({scale: 'css'}),
            contentType: 'image/png'});
        await applySettings(page);
        await expectTrusted(page, [specifications[0]]);
        await expect(selection(page)).toHaveCount(0);
        expect((await projectJSON(page)).targets).toEqual(before.targets);
    } finally {
        await context.close();
    }
});

test('catalog keeps distribution controls off when the Loader startup flag is explicitly disabled', async ({page, context}) => {
    await installFixtures(context);
    await openEditor(page, false);
    await openCatalog(page);
    // Without the Loader there is no form to write, so none is offered, and how it runs is stated.
    await expect(selection(page).locator('.twextsec-row input[type="radio"]')).toHaveCount(0);
    await expect(selection(page).locator('.twextsec-trusted').first()).toBeVisible();
    await expect(page.getByTestId('tw-plus-permission')).toHaveCount(0);
    expect(await page.evaluate(() => globalThis.__catalogAuthoringRuns || {})).toEqual({});
});

test('catalog changes a loaded extension form with the same digest and asks nobody', async ({page, context}) => {
    await installFixtures(context);
    await openEditor(page);
    const spec = specifications[3];
    await openCatalog(page);
    await row(page, spec).getByRole('checkbox').check();
    await form(page, spec, 'remote-non-cacheable').check();
    await applySettings(page);
    await expectTrusted(page, [spec]);
    await expect(selection(page)).toHaveCount(0);
    await assertModes(page, [spec]);

    await openCatalog(page);
    await expect(form(page, spec, 'remote-non-cacheable')).toBeChecked();
    await form(page, spec, 'embedded-data').check();
    await applySettings(page);
    await expect(selection(page)).toHaveCount(0);
    await expect(permission(page)).toHaveCount(0);
    await assertModes(page, [spec]);
    const json = await projectJSON(page);
    expect(json.turboWarpPlus.extensions[0]).toMatchObject({
        id: spec.id, execution: 'unsandboxed', sha256: spec.sha256, source: {type: 'embedded-data'}
    });
    expect(json.extensionURLs[spec.id].startsWith('data:')).toBe(true);
});

test('catalog adopts a previously native-loaded extension, runs it as a catalog extension and leaves no old iframe', async ({page, context}) => {
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
    await expect(row(page, spec).locator('.twextsec-state')).toHaveText('読み込み済み');
    await expect(row(page, spec).getByRole('checkbox')).toBeChecked();
    await expect(row(page, spec).getByRole('checkbox')).toBeDisabled();
    await form(page, spec, 'embedded-file').check();
    await applySettings(page);
    await expectTrusted(page, [spec]);
    await expect(selection(page)).toHaveCount(0);
    // Taken into the manifest it is a catalog extension: it runs without the sandbox, and the
    // iframe it had been loaded into is gone.
    await expect(page.locator(`iframe.tw-custom-extension-frame[data-id="${nativeFrameID}"]`)).toHaveCount(0);
    await assertModes(page, [spec]);

    const zip = await Zip.loadAsync(await saveSB3(page));
    const json = JSON.parse(await zip.file('project.json').async('string'));
    const stored = json.turboWarpPlus.extensions.find(entry => entry.id === spec.id);
    expect(stored).toMatchObject({execution: 'unsandboxed', sha256: spec.sha256, source: {type: 'embedded-file'}});
    expect(await zip.file(stored.source.path).async('nodebuffer')).toEqual(spec.bytes);
});
