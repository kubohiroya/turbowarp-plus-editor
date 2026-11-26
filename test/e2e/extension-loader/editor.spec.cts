const {test, expect, review, individualReview, executionChoice, completeReview, trackExecutionFetches, provideReviewMetadata, showLoadFailureDetails, showProjectDiagnostics} = require('./fixtures.cts');
const Zip = require('@turbowarp/jszip');
const fs = require('node:fs');
const path = require('node:path');
const {project, bytes, digest, remoteURL} = require('./project.cts');
const {reopenSB3} = require('./catalog.cts');
const {createHTTPSFixture} = require('./https-fixture.cts');
const {createHash} = require('node:crypto');
const {createRequire} = require('node:module');
const {pathToFileURL} = require('node:url');
const permission = page => page.getByTestId('tw-plus-permission');
const executions = page => page.evaluate(() => globalThis.__plusFixtureStarted || 0);
// How many times one URL may be asked is the Loader's decision, not this repository's, so read it
// from the exact build the site bundles rather than copying the number here. The Loader is ESM and
// is this repository's own dependency (the GUI no longer installs it), so resolve it from here.
let retryDefaults;
async function fetchAttempts() {
    if (!retryDefaults) {
        const entry = createRequire(path.join(__dirname, '../../../package.json'))
            .resolve('@kubohiroya/turbowarp-extension-loader');
        ({DEFAULT_FETCH_RETRY: retryDefaults} = await import(pathToFileURL(entry).href));
    }
    return retryDefaults.retries + 1;
}

async function open(page, {enabled = true, projectBytes}: {enabled?: boolean; projectBytes?: Buffer} = {}) {
    const query = new URLSearchParams({lang: 'ja'});
    if (!enabled) query.set('twPlusExtensionLoader', '0');
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
// A project's extensions are asked about on one review when it opens, before the Loader fetches or
// registers anything, and the Loader acts on that answer: no per-extension prompt follows it.
async function answer(page, execution = 'unsandboxed', {key = 'plusfixture', sha256 = digest, ran = 0} = {}) {
    await individualReview(page);
    // Nothing of this load has run while the person is still being asked.
    expect(await executions(page)).toBe(ran);
    const row = review(page).locator(`.twextsec-row[data-key="${key}"]`);
    if (sha256) await expect(row.locator('.twextsec-digest')).toContainText(sha256);
    await executionChoice(row, execution).click();
    await completeReview(page);
    await expect(review(page)).toHaveCount(0);
}
async function allowed(page, loading) {
    expect(await loading).toEqual({ok: true});
    await expect.poll(() => executions(page)).toBe(1);
    expect(await page.evaluate(() => vm.runtime._primitives.plusfixture_value())).toBe('verified VM');
    await expect(permission(page)).toHaveCount(0);
}
async function allow(page, loading) {
    await answer(page);
    await allowed(page, loading);
}

for (const type of ['embedded-file', 'remote-cacheable']) {
    test(`${type} requests approval at startup and preserves exact source/digest across SB3 save and reopen`, async ({page}) => {
        if (type === 'remote-cacheable') await page.route(remoteURL, route => route.fulfill({body: bytes,
            headers: {'access-control-allow-origin': '*', 'content-type': 'application/javascript'}}));
        const input = await project({type});
        await open(page, {projectBytes: input});
        await answer(page);
        await expect.poll(() => executions(page)).toBe(1);
        expect(await page.evaluate(() => vm.runtime._primitives.plusfixture_value())).toBe('verified VM');
        const values = await page.evaluate(async () => [...new Uint8Array(await vm.saveProjectSb3('arraybuffer'))]);
        const saved = Buffer.from(values);
        const zip = await Zip.loadAsync(saved);
        const json = JSON.parse(await zip.file('project.json').async('string'));
        expect(json.turboWarpPlus.extensions[0].source.type).toBe(type);
        expect(json.turboWarpPlus.extensions[0].sha256).toBe(digest);
        if (type === 'embedded-file') expect(await zip.file('extensions/plusfixture.js').async('nodebuffer')).toEqual(bytes);
        // Opening the saved file is opening a project again, so it is asked about again.
        const reopening = load(page, saved);
        await answer(page, 'unsandboxed', {ran: 1});
        expect(await reopening).toEqual({ok: true});
        expect(await executions(page)).toBe(2);
        await expect(permission(page)).toHaveCount(0);
    });
}

test('denial and dialog cancellation never evaluate project code or fall through to legacy URLs', async ({page}) => {
    await open(page);
    const input = await project({extensionURLs: {plusfixture: `data:text/javascript,${encodeURIComponent('globalThis.__legacyBypass=true')}`}});
    let loading = load(page, input);
    await answer(page, 'deny');
    expect((await loading).code).toBe('TRUST_DENIED');
    expect(await executions(page)).toBe(0);
    expect(await page.evaluate(() => Boolean(globalThis.__legacyBypass))).toBe(false);
    // Closing the review is saying no to the whole project, before anything is fetched.
    loading = load(page, input);
    await expect(review(page)).toBeVisible();
    await page.keyboard.press('Escape');
    expect((await loading).code).toBe('EXTENSION_SECURITY_CANCELLED');
    expect(await executions(page)).toBe(0);
    expect(await page.evaluate(() => Boolean(globalThis.__legacyBypass))).toBe(false);
});

test('digest mismatch, unknown schema and a forged trust field fail before evaluation', async ({page}) => {
    await open(page);
    for (const [options, expected] of [
        [{code: Buffer.from('globalThis.__plusFixtureStarted=99')}, 'DIGEST_MISMATCH'],
        [{schemaVersion: 999}, 'UNSUPPORTED_SCHEMA'],
        [{extraManifest: {trusted: true}}, 'INVALID_MANIFEST'],
        [{type: 'remote-cacheable', url: 'http://untrusted.invalid/code.js'}, 'INVALID_SOURCE']
    ]) {
        const loading = load(page, await project(options));
        // A manifest that cannot be read fails before anyone is asked. A digest is only known to
        // be wrong once the bytes are fetched, which is after the review: they still never run.
        if (expected === 'DIGEST_MISMATCH') await answer(page);
        const result = await loading;
        expect(result.code).toBe(expected);
        expect(await executions(page)).toBe(0);
        await expect(permission(page)).toHaveCount(0);
        await expect(page.getByTestId('tw-plus-extension-status')).toHaveCount(0);
        await expect(await showLoadFailureDetails(page)).toContainText(expected);
        await page.keyboard.press('Escape');
    }
});

// An extension that fails while registering, such as one that requires unsandboxed but is run sandboxed.
const failingCode = Buffer.from(`globalThis.__plusFixtureStarted=(globalThis.__plusFixtureStarted||0)+1;
throw new Error('Fixture must run unsandboxed.');`);
const failingProject = () => project({code: failingCode, sha256: createHash('sha256').update(failingCode).digest('hex')});
async function expectFailureReported(page) {
    await answer(page, 'unsandboxed', {sha256: null});
    const diagnostics = await showLoadFailureDetails(page);
    // The terminal diagnostics expose a stable error code, not arbitrary exception text from code.
    await expect(diagnostics).toContainText('LOAD_FAILED');
    await expect(diagnostics).toContainText('plusfixture');
    expect(await executions(page)).toBe(1);
    // The editor reports a stopped load instead of crashing or silently opening a different project.
    await expect(page.getByText(/うわっ|Oops/)).toHaveCount(0);
    expect(await page.evaluate(() => vm.extensionManager.isExtensionLoaded('plusfixture'))).toBe(false);
}

test('an extension that fails while registering is reported without crashing the Editor', async ({page}) => {
    await open(page, {projectBytes: await failingProject()});
    await expectFailureReported(page);
});

test('remote cache reopens offline after approval; an uncached digest never executes offline', async ({page, context}) => {
    const fetched = await trackExecutionFetches(page, remoteURL);
    await page.route(remoteURL, route => route.fulfill({body: bytes,
        headers: {'access-control-allow-origin': '*'}}));
    await open(page);
    const input = await project({type: 'remote-cacheable'});
    await allow(page, load(page, input));
    expect(fetched()).toBe(1);
    await context.setOffline(true);
    const reopening = load(page, input);
    // The same project is recognised, so the answer it was given is already chosen.
    await individualReview(page);
    await expect(executionChoice(entry(page), 'unsandboxed')).toHaveAttribute('aria-pressed', 'true');
    await answer(page, 'unsandboxed', {ran: 1});
    expect(await reopening).toEqual({ok: true});
    expect(await executions(page)).toBe(2);
    expect(fetched()).toBe(1);
    const missing = load(page, await project({type: 'remote-cacheable', sha256: 'a'.repeat(64), url: 'https://offline.invalid/new.js'}));
    await answer(page, 'unsandboxed', {sha256: 'a'.repeat(64), ran: 2});
    const missed = await missing;
    expect(missed.ok).toBe(false);
    expect(await executions(page)).toBe(2);
});

// How an extension loads is the author's choice, recorded in the project. What is left to the
// person opening it is whether a remote-cacheable copy is kept, and they can only decline it.
// The bulk row above offers the same labels for all rows at once, so read the extension's own row.
const entry = page => review(page).locator('.twextsec-row[data-key="plusfixture"]');
const keep = page => entry(page).locator('input[name="loading-plusfixture"]');

test('the opener may decline the copy of a remote-cacheable extension, and then nothing is kept', async ({page}) => {
    const fetched = await trackExecutionFetches(page, remoteURL);
    await page.route(remoteURL, route => route.fulfill({body: bytes,
        headers: {'access-control-allow-origin': '*'}}));
    await open(page);
    const input = await project({type: 'remote-cacheable'});
    let loading = load(page, input);
    await individualReview(page);
    await expect(keep(page)).toHaveCount(2);
    await expect(keep(page).and(page.locator('[value="remote-cacheable"]'))).toBeChecked();
    await entry(page).getByRole('radio', {name: '毎回取得する', exact: true}).check();
    await answer(page);
    await allowed(page, loading);
    expect(fetched()).toBe(1);

    // The same project is recognised, so the copy it was refused is still refused, and the code is
    // fetched again rather than read from this browser.
    loading = load(page, input);
    await individualReview(page);
    await expect(keep(page).and(page.locator('[value="remote-non-cacheable"]'))).toBeChecked();
    await answer(page, 'unsandboxed', {ran: 1});
    expect(await loading).toEqual({ok: true});
    expect(fetched()).toBe(2);

    // With the address no longer answering, there is no copy in this browser to fall back on.
    await page.unroute(remoteURL);
    loading = load(page, input);
    await answer(page, 'unsandboxed', {ran: 2});
    expect((await loading).ok).toBe(false);
    expect(await executions(page)).toBe(2);
});

for (const type of ['remote-non-cacheable', 'embedded-file', 'embedded-data']) {
    test(`a ${type} extension opens as its author recorded it, with no copy to decline`, async ({page}) => {
        const fetched = await trackExecutionFetches(page, remoteURL);
        await page.route(remoteURL, route => route.fulfill({body: bytes,
            headers: {'access-control-allow-origin': '*'}}));
        await open(page);
        const loading = load(page, await project({type}));
        await individualReview(page);
        await expect(keep(page)).toHaveCount(0);
        if (type === 'remote-non-cacheable') {
            // No per-row or bulk action can override the author's prohibition.
            for (const name of ['毎回取得する', 'キャッシュを残す（既定）']) {
                await expect(review(page).getByRole('radio', {name, exact: true})).toHaveCount(0);
            }
        }
        await answer(page);
        await allowed(page, loading);
        expect(fetched()).toBe(type === 'remote-non-cacheable' ? 1 : 0);
        const json = await page.evaluate(() => JSON.parse(vm.toJSON()));
        expect(json.turboWarpPlus.extensions[0].source.type).toBe(type);
    });
}

test('HTTPS redirects and CORS refusal never execute JavaScript, even once the review allowed it', async ({page, baseURL}) => {
    if (process.env.E2E_BASE_URL) {
        await open(page);
        for (const [pathname, status, headers] of [
            ['/redirect', 302, {'access-control-allow-origin': '*', location: 'https://other.invalid/changed.js'}],
            ['/nocors', 200, {'access-control-allow-origin': 'https://different-origin.invalid'}]
        ]) {
            const url = `https://plus-fixture.invalid${pathname}`;
            await page.route(url, route => route.fulfill({status, headers, body: bytes}));
            const loading = load(page, await project({type: 'remote-cacheable', url}));
            await answer(page);
            expect((await loading).code).toBe('LOAD_FAILED');
            expect(await executions(page)).toBe(0);
            await expect(permission(page)).toHaveCount(0);
            const diagnostics = await showLoadFailureDetails(page);
            await expect(diagnostics.locator('li').filter({hasText: '"type": "review"'})).toHaveCount(0);
            await page.keyboard.press('Escape');
        }
        return;
    }
    const fixture = await createHTTPSFixture(bytes);
    try {
        const urls = ['/redirect', '/nocors'].map(name => fixture.url + name);
        const executedFetches = await trackExecutionFetches(page, urls);
        await open(page);
        for (const url of urls) {
            const loading = load(page, await project({type: 'remote-cacheable', url}));
            await answer(page);
            const result = await loading;
            expect(result.code).toBe('LOAD_FAILED');
            expect(await executions(page)).toBe(0);
            await expect(permission(page)).toHaveCount(0);
            const diagnostics = await showLoadFailureDetails(page);
            await expect(diagnostics.locator('li').filter({hasText: '"type": "review"'})).toHaveCount(0);
            await page.keyboard.press('Escape');
        }
        // Chromium rejects a redirect and a CORS refusal with the same TypeError it raises when
        // it could not connect, so the port cannot tell them apart and asks the full count.
        const attempts = await fetchAttempts();
        expect(urls.map(executedFetches)).toEqual([attempts, attempts]);
        // The review may itself follow a redirect to read claims, without evaluating any JS.
        for (const pathname of ['/redirect', '/nocors']) {
            expect(fixture.seen.filter(item => item === pathname).length).toBeGreaterThanOrEqual(attempts);
        }
    } finally { await fixture.close(); }
});

test('a transient failure shows the current attempt and remains in Project Diagnostics', async ({page}) => {
    // One failure shows the behaviour whatever the Loader's retry count is: any policy that
    // retries at all recovers from a single transient one. The sentence around it belongs to the
    // GUI, so assert only what the person needs — which fetch is being repeated, and that the
    // attempt it leads to is named — and let the wording change upstream without failing here.
    const expectRetryShown = async url => {
        const waiting = page.getByTestId('twextsec-wait');
        await expect(waiting).toBeVisible();
        await expect(waiting).toContainText(url);
        await expect(waiting).toContainText(/\b2\s*\/\s*\d+/);
        // Verify the deployed bundle includes the dialog's styles. Security Dialog's browser tests
        // own centering, style deduplication and the absence of controls.
        await expect(waiting).toHaveCSS('position', 'fixed');
    };
    const expectRetryRecorded = async url => {
        await expect(page.getByTestId('twextsec-wait')).toHaveCount(0);
        const diagnostics = await showProjectDiagnostics(page);
        const retries = diagnostics.locator('li').filter({hasText: '"type": "retry"'});
        await expect(retries).toHaveCount(1);
        await expect(retries).toContainText(url);
        await expect(retries).toContainText(/"attempt":\s*"2"/u);
        await expect(retries).toContainText(/"attempts":\s*"\d+"/u);
        await page.keyboard.press('Escape');
    };
    if (process.env.E2E_BASE_URL) {
        // A published run has no GUI checkout and would reject the fixture's own certificate.
        const url = 'https://plus-fixture.invalid/flaky.js';
        await provideReviewMetadata(page, url, bytes.toString('utf8'));
        await open(page);
        let served = 0;
        await page.route(url, async route => {
            // The retry has to be in flight long enough to be seen: the attempt that succeeds
            // answers slowly, because the dialog comes down as soon as the fetch resolves.
            await new Promise(resolve => setTimeout(resolve, ++served === 1 ? 200 : 1500));
            return route.fulfill(served === 1 ?
                {status: 503, headers: {'access-control-allow-origin': '*'}} :
                {status: 200, body: bytes, headers: {'access-control-allow-origin': '*',
                    'content-type': 'application/javascript'}});
        });
        const loading = load(page, await project({type: 'remote-cacheable', url}));
        await answer(page);
        await expectRetryShown(url);
        await allowed(page, loading);
        await expectRetryRecorded(url);
        expect(served).toBe(2);
        return;
    }
    const fixture = await createHTTPSFixture(bytes);
    try {
        // The dialog waits out a grace period before showing, and comes down when the fetch
        // resolves, so the attempt that succeeds is the one that has to answer slowly.
        fixture.failNext(1, {delayMs: 200, thenSlowMs: 1500});
        const url = `${fixture.url}/flaky`;
        await provideReviewMetadata(page, url, bytes.toString('utf8'));
        await open(page);
        const loading = load(page, await project({type: 'remote-cacheable', url}));
        await answer(page);
        await expectRetryShown(url);
        await allowed(page, loading);
        await expectRetryRecorded(url);
        expect(fixture.seen.filter(pathname => pathname === '/flaky')).toHaveLength(2);
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
    await answer(page);
    expect((await loading).ok).toBe(false);
    expect(await executions(page)).toBe(0);
    expect(await page.evaluate(() => vm.extensionManager.isExtensionLoaded('plusfixture'))).toBe(false);
});

test('explicit opt-out does not activate Plus bootstrap for a self-declared trusted project', async ({page}) => {
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
        page = await reopenSB3(page, await project(), 'plus-fixture.sb3');
        await answer(page);
        await expect.poll(() => page.evaluate(() => vm.extensionManager.isExtensionLoaded('plusfixture'))).toBe(true);
        expect(await executions(page)).toBe(1);
    });
    test('a local SB3 whose extension fails while registering is reported without crashing the Editor', async ({page}) => {
        await open(page);
        page = await reopenSB3(page, await failingProject(), 'failing.sb3');
        await expectFailureReported(page);
    });
});
