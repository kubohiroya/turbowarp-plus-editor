const {test: base, expect} = require('./fixtures.cts');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const {pathToFileURL} = require('node:url');
const {packagedProject} = require('./packaged-project.cts');
const filename = path.resolve(__dirname, '../../../.host/issue-4-artifacts/plus-offline.html');
const test = base.extend({
    packagedHTML: async ({browser, baseURL}, use) => {
        if (!process.env.E2E_BASE_URL) return use(filename);
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-plus-public-html-'));
        const creator = await browser.newContext({acceptDownloads: true, locale: 'ja-JP'});
        try {
            // Generate from deployed assets instead of substituting a locally built runtime.
            const page = await creator.newPage();
            await page.goto(new URL('plus-packager.html', baseURL).href);
            await page.getByTestId('plus-package-file').setInputFiles({name: 'sample.sb3',
                mimeType: 'application/x.scratch.sb3', buffer: await packagedProject()});
            await expect(page.getByTestId('plus-package-generate')).toBeEnabled();
            await page.getByTestId('plus-package-resources').check();
            await page.getByTestId('plus-package-generate').click();
            await expect(page.getByTestId('tw-plus-permission')).toBeVisible();
            await page.getByTestId('tw-plus-allow').click();
            await expect(page.getByTestId('plus-package-download')).toBeVisible();
            const pending = page.waitForEvent('download');
            await page.getByTestId('plus-package-download').click();
            const output = path.join(directory, 'sample.html');
            await (await pending).saveAs(output);
            await use(output);
        } finally {
            await creator.close();
            await fs.rm(directory, {recursive: true, force: true});
        }
    }
});

test('official Packager single HTML prompts before unsandboxed execution and runs offline', async ({page, context, packagedHTML}) => {
    const requests = [];
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    await context.setOffline(true);
    await page.goto(pathToFileURL(packagedHTML).href);
    await expect(page.getByTestId('tw-plus-permission')).toBeVisible();
    expect(await page.evaluate(() => vm.__plusPackageExecutions || 0)).toBe(0);
    await expect(page.getByTestId('tw-plus-permission').locator('[data-field="source"]')).toContainText('extensions/');
    await page.getByTestId('tw-plus-allow').click();
    await expect.poll(() => page.evaluate(() => vm.__plusPackageExecutions || 0)).toBe(1);
    await expect.poll(() => page.evaluate(() => vm.extensionManager.isExtensionLoaded('sample'))).toBe(true);
    expect(await page.evaluate(() => vm.runtime._primitives.sample_value())).toBe(42);
    expect(requests).toEqual([]);
});

test('generation-time consent does not grant execution permission in a distributed HTML', async ({page, context, packagedHTML}) => {
    await context.setOffline(true);
    await page.goto(pathToFileURL(packagedHTML).href);
    await expect(page.getByTestId('tw-plus-permission')).toBeVisible();
    await page.getByTestId('tw-plus-deny').click();
    await expect(page.getByTestId('tw-plus-permission')).toHaveCount(0);
    expect(await page.evaluate(() => vm.__plusPackageExecutions || 0)).toBe(0);
    expect(await page.evaluate(() => vm.extensionManager.isExtensionLoaded('sample'))).toBe(false);
});
