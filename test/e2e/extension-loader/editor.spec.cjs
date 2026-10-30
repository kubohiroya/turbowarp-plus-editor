const {test, expect} = require('@playwright/test');
const Zip = require('@turbowarp/jszip');
const fs = require('node:fs');
const path = require('node:path');
const {project, bytes, digest, remoteURL} = require('./project.cjs');
const {createHTTPSFixture} = require('./https-fixture.cjs');
const permission = page => page.getByTestId('tw-plus-permission');
const executions = page => page.evaluate(() => globalThis.__plusFixtureStarted || 0);

async function open(page, {enabled = true, projectBytes} = {}) {
    const query = new URLSearchParams({lang: 'ja'});
    if (enabled) query.set('twPlusExtensionLoader', '1');
    if (projectBytes) query.set('project_url', `data:application/octet-stream;base64,${projectBytes.toString('base64')}`);
    await page.goto(`editor.html?${query}`);
    await page.waitForFunction(() => globalThis.vm && globalThis.vm.runtime);
    if (!projectBytes) await page.waitForFunction(() => vm.runtime.targets.length > 0);
}
function load(page, buffer) {
    return page.evaluate(async values => {
        try { await vm.loadProject(new Uint8Array(values)); return {ok: true}; }
        catch (error) { return {ok: false, code: error.code, message: error.message, cause: error.cause && error.cause.message}; }
    }, [...buffer]);
}
async function allow(page, loading) {
    await expect(permission(page)).toBeVisible();
    expect(await executions(page)).toBe(0);
    await expect(permission(page).locator('[data-field="sha256"]')).toHaveText(digest);
    await page.getByTestId('tw-plus-allow').click();
    expect(await loading).toEqual({ok: true});
    await expect.poll(() => executions(page)).toBe(1);
    expect(await page.evaluate(() => vm.runtime._primitives.plusfixture_value())).toBe('verified VM');
}

for (const type of ['embedded', 'remote']) {
    test(`${type} requests approval at startup and preserves exact source/digest across SB3 save and reopen`, async ({page}) => {
        if (type === 'remote') await page.route(remoteURL, route => route.fulfill({body: bytes,
            headers: {'access-control-allow-origin': '*', 'content-type': 'application/javascript'}}));
        const input = await project({type});
        await open(page, {projectBytes: input});
        await expect(permission(page)).toBeVisible();
        expect(await executions(page)).toBe(0);
        await page.getByTestId('tw-plus-allow').click();
        await expect.poll(() => executions(page)).toBe(1);
        expect(await page.evaluate(() => vm.runtime._primitives.plusfixture_value())).toBe('verified VM');
        const values = await page.evaluate(async () => [...new Uint8Array(await vm.saveProjectSb3('arraybuffer'))]);
        const saved = Buffer.from(values);
        const zip = await Zip.loadAsync(saved);
        const json = JSON.parse(await zip.file('project.json').async('string'));
        expect(json.turboWarpPlus.extensions[0].source.type).toBe(type);
        expect(json.turboWarpPlus.extensions[0].sha256).toBe(digest);
        if (type === 'embedded') expect(await zip.file('extensions/plusfixture.js').async('nodebuffer')).toEqual(bytes);
        expect(await load(page, saved)).toEqual({ok: true});
        expect(await executions(page)).toBe(2);
        await expect(permission(page)).toHaveCount(0);
    });
}

test('denial and dialog cancellation never evaluate project code or fall through to legacy URLs', async ({page}) => {
    await open(page);
    const input = await project({extensionURLs: {plusfixture: `data:text/javascript,${encodeURIComponent('globalThis.__legacyBypass=true')}`}});
    let loading = load(page, input);
    await expect(permission(page)).toBeVisible();
    await page.getByTestId('tw-plus-deny').click();
    expect((await loading).code).toBe('TRUST_DENIED');
    expect(await executions(page)).toBe(0);
    expect(await page.evaluate(() => Boolean(globalThis.__legacyBypass))).toBe(false);
    loading = load(page, input);
    await expect(permission(page)).toBeVisible();
    await page.keyboard.press('Escape');
    expect((await loading).code).toBe('TRUST_DENIED');
    expect(await executions(page)).toBe(0);
});

test('digest mismatch, unknown schema and a forged trust field fail before approval or evaluation', async ({page}) => {
    await open(page);
    for (const [options, expected] of [
        [{code: Buffer.from('globalThis.__plusFixtureStarted=99')}, 'DIGEST_MISMATCH'],
        [{schemaVersion: 999}, 'UNSUPPORTED_SCHEMA'],
        [{extraManifest: {trusted: true}}, 'INVALID_MANIFEST'],
        [{type: 'remote', url: 'http://untrusted.invalid/code.js'}, 'INVALID_SOURCE']
    ]) {
        const result = await load(page, await project(options));
        expect(result.code).toBe(expected);
        expect(await executions(page)).toBe(0);
        await expect(permission(page)).toHaveCount(0);
        await expect(page.getByTestId('tw-plus-extension-status')).toContainText(expected);
    }
});

test('approved code claiming another ID cannot register either ID', async ({page}) => {
    await open(page);
    const loading = load(page, await project({id: 'otherfixture'}));
    await expect(permission(page)).toBeVisible();
    expect(await executions(page)).toBe(0);
    await page.getByTestId('tw-plus-allow').click();
    expect((await loading).ok).toBe(false);
    expect(await page.evaluate(() => vm.extensionManager.isExtensionLoaded('otherfixture') ||
        vm.extensionManager.isExtensionLoaded('plusfixture'))).toBe(false);
    expect(await page.evaluate(() => Boolean(vm.runtime._primitives.plusfixture_value))).toBe(false);
});

test('remote cache reopens offline after approval; an uncached digest never executes offline', async ({page, context}) => {
    let fetched = 0;
    await page.route(remoteURL, route => { fetched++; return route.fulfill({body: bytes,
        headers: {'access-control-allow-origin': '*'}}); });
    await open(page);
    const input = await project({type: 'remote'});
    await allow(page, load(page, input));
    expect(fetched).toBe(1);
    await context.setOffline(true);
    expect(await load(page, input)).toEqual({ok: true});
    expect(await executions(page)).toBe(2);
    expect(fetched).toBe(1);
    const missed = await load(page, await project({type: 'remote', sha256: 'a'.repeat(64), url: 'https://offline.invalid/new.js'}));
    expect(missed.ok).toBe(false);
    expect(await executions(page)).toBe(2);
});

test('HTTPS redirects and CORS refusal do not open approval or execute JavaScript', async ({page}) => {
    await open(page);
    const fixture = await createHTTPSFixture(bytes);
    try {
        for (const pathname of ['/redirect', '/nocors']) {
            const result = await load(page, await project({type: 'remote', url: fixture.url + pathname}));
            expect(result.code).toBe('LOAD_FAILED');
            expect(await executions(page)).toBe(0);
            await expect(permission(page)).toHaveCount(0);
            await expect(page.getByTestId('tw-plus-extension-status').locator('[data-event="review"]')).toHaveCount(0);
        }
        expect(fixture.seen).toEqual(['/redirect', '/nocors']);
    } finally { await fixture.close(); }
});

test('CSP forbidding dynamic evaluation rejects approved execution without registering it', async ({page}) => {
    await open(page);
    await page.evaluate(() => {
        const meta = document.createElement('meta');
        meta.httpEquiv = 'Content-Security-Policy';
        meta.content = "script-src 'self' 'unsafe-inline'";
        document.head.appendChild(meta);
    });
    const loading = load(page, await project());
    await expect(permission(page)).toBeVisible();
    await page.getByTestId('tw-plus-allow').click();
    expect((await loading).ok).toBe(false);
    expect(await executions(page)).toBe(0);
    expect(await page.evaluate(() => vm.extensionManager.isExtensionLoaded('plusfixture'))).toBe(false);
});

test('default-off Editor does not activate Plus bootstrap for a self-declared trusted project', async ({page}) => {
    await open(page, {enabled: false});
    const result = await load(page, await project());
    expect(result.ok).toBe(false);
    expect(await executions(page)).toBe(0);
    await expect(permission(page)).toHaveCount(0);
    await expect(page.getByTestId('tw-plus-extension-status')).toHaveCount(0);
});

for (const enabled of [false, true]) {
    test(`builtin and official gallery loaders retain their existing behavior with Plus flag ${enabled}`, async ({page}) => {
        const url = 'https://extensions.turbowarp.org/bitwise.js';
        const body = fs.readFileSync(path.join(__dirname, 'fixtures/bitwise.js'));
        await page.route(url, route => route.fulfill({body, contentType: 'application/javascript',
            headers: {'access-control-allow-origin': '*'}}));
        await open(page, {enabled});
        await page.evaluate(async galleryURL => {
            vm.extensionManager.loadExtensionIdSync('pen');
            await vm.extensionManager.loadExtensionURL(galleryURL);
        }, url);
        expect(await page.evaluate(() => vm.extensionManager.isExtensionLoaded('pen'))).toBe(true);
        expect(await page.evaluate(() => vm.extensionManager.isExtensionLoaded('Bitwise'))).toBe(true);
        expect(await page.evaluate(() => vm.runtime._primitives.Bitwise_bitwiseAnd({LEFT: 6, RIGHT: 3}))).toBe(2);
        await expect(permission(page)).toHaveCount(0);
    });
}

test.describe('local file input', () => {
    test.use({userAgent: require('@playwright/test').devices['Pixel 7'].userAgent});
    test('local SB3 import reaches the same permission and real VM registration path', async ({page}) => {
        await open(page);
        await page.getByText('ファイル', {exact: true}).click();
        const choosing = page.waitForEvent('filechooser');
        await page.getByText('コンピューターから読み込む', {exact: true}).click();
        await (await choosing).setFiles({name: 'plus-fixture.sb3', mimeType: 'application/octet-stream', buffer: await project()});
        await expect(permission(page)).toBeVisible();
        expect(await executions(page)).toBe(0);
        await page.getByTestId('tw-plus-allow').click();
        await expect.poll(() => page.evaluate(() => vm.extensionManager.isExtensionLoaded('plusfixture'))).toBe(true);
        expect(await executions(page)).toBe(1);
    });
});
