const {test: base, expect} = require('@playwright/test');
const {readPinsSync} = require('../../../scripts/site/locked-pins.cts');
const pins = readPinsSync();

async function identity(request, baseURL) {
    const url = new URL('build-info.json', baseURL);
    url.searchParams.set('extension_e2e_time', String(Date.now()));
    const response = await request.get(url.href, {headers: {'Cache-Control': 'no-cache'}});
    expect(response.ok()).toBeTruthy();
    const info = await response.json();
    expect(info.siteRepository).toBe('https://github.com/kubohiroya/turbowarp-plus-editor');
    expect(info.siteRevision).toMatch(/^[a-f0-9]{40}$/);
    expect(info.revision).toBe(process.env.E2E_EXPECT_GUI_REVISION || pins.guiRevision);
    expect(info.coreRevision).toBe(process.env.E2E_EXPECT_CORE_REVISION || pins.coreRevision);
    expect(info.securityVersion).toBe(process.env.E2E_EXPECT_SECURITY_VERSION || pins.securityVersion);
    expect(info.securityRevision).toBe(pins.securityRevision);
    if (process.env.E2E_EXPECT_SITE_REVISION) expect(info.siteRevision).toBe(process.env.E2E_EXPECT_SITE_REVISION);
    expect(info.extensionIntegration).toBeTruthy();
    for (const key of ['loaderRepository', 'loaderVersion', 'vmRepository', 'vmRevision', 'packagerRepository', 'packagerRevision']) {
        expect(info.extensionIntegration[key], key).toBe(pins[key]);
    }
    expect(info.extensionIntegration.featureDefault).toBe(true);
    return info;
}

const test = base.extend({
    deploymentIdentity: [async ({request, baseURL}, use, testInfo) => {
        const before = await identity(request, baseURL);
        await testInfo.attach('deployment-before.json', {body: JSON.stringify(before, null, 2), contentType: 'application/json'});
        await use(before);
        expect(await identity(request, baseURL), 'Deployment changed during the test').toEqual(before);
    }, {auto: true}]
});
async function showProjectDiagnostics(page) {
    await page.getByText(/^(File|ファイル)$/u).locator('xpath=ancestor::div[1]').click();
    const properties = page.getByRole('button', {name: /^(Project Properties|作品のプロパティ)$/u});
    if (await properties.count()) await properties.click();
    await page.getByRole('button', {name: /^(Project Diagnostics…|作品の診断…)$/u}).click();
    const dialog = page.getByTestId('project-diagnostics');
    await expect(dialog).toBeVisible();
    return dialog;
}

const review = page => page.getByRole('dialog').filter({has: page.locator('.twextsec-review[data-mode="open"]')});
async function individualReview(page) {
    const dialog = review(page);
    await expect(dialog).toBeVisible();
    const button = dialog.getByTestId('twextsec-individual');
    if ((await button.getAttribute('aria-expanded')) === 'false') await button.click();
    return dialog;
}
const executionChoice = (row, execution) => row.locator(`button[data-execution="${execution}"]`);
const completeReview = page => review(page).getByTestId('twextsec-complete').click();
// Review can read an extension's metadata before consent. The verified Loader read
// separately sets redirect:"error"; observe that request without changing the URL or response.
async function trackExecutionFetches(page, urls) {
    const sources = typeof urls === 'string' ? [urls] : urls;
    const counts = new Map();
    await page.exposeFunction('noteE2EExecutionFetch', url => counts.set(url, (counts.get(url) || 0) + 1));
    await page.addInitScript(addresses => {
        const fetch = window.fetch;
        window.fetch = function (input, options) {
            const url = String(input);
            if (addresses.includes(url) && options?.redirect === 'error') void globalThis.noteE2EExecutionFetch(url);
            return Reflect.apply(fetch, this, [input, options]);
        };
    }, sources);
    return (url = sources[0]) => counts.get(url) || 0;
}
// A retry fixture gives the review static metadata so it does not consume the injected
// first transport failure. The Loader still goes to the actual controlled HTTPS endpoint.
async function provideReviewMetadata(page, url, source) {
    await page.addInitScript(({url, source}) => {
        const fetch = window.fetch;
        window.fetch = function (input, options) {
            if (String(input) === url && options?.redirect !== 'error') {
                return Promise.resolve(new Response(source, {headers: {'content-type': 'application/javascript'}}));
            }
            return Reflect.apply(fetch, this, [input, options]);
        };
    }, {url, source});
}
async function showLoadFailureDetails(page) {
    const failure = page.getByTestId('project-load-failure');
    await expect(failure).toHaveAttribute('data-outcome', 'failed');
    await failure.getByRole('button', {name: '詳細ログを表示', exact: true}).click();
    const diagnostics = page.getByTestId('project-diagnostics');
    await expect(diagnostics).toBeVisible();
    return diagnostics;
}
module.exports = {test, expect, showProjectDiagnostics, review, individualReview, executionChoice, completeReview,
    trackExecutionFetches, provideReviewMetadata, showLoadFailureDetails};
