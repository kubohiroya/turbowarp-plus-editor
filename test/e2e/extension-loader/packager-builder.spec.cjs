const {test, expect} = require('./fixtures.cjs');
const {mkdtemp, rm} = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {project, digest} = require('./project.cjs');

test('local Packager asks permission, downloads one HTML and executes it offline only after recipient approval', async ({page, context}) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'tw-plus-package-e2e-'));
    try {
        await page.goto('plus-packager.html');
        await page.getByTestId('plus-package-file').setInputFiles({name: 'Plus fixture.sb3', mimeType: 'application/x.scratch.sb3', buffer: await project()});
        await expect(page.getByTestId('plus-package-generate')).toBeEnabled();
        await page.getByTestId('plus-package-generate').click();
        await expect(page.getByTestId('plus-package-status')).toContainText('確認してください');
        await expect(page.getByTestId('tw-plus-permission')).toHaveCount(0);
        await page.getByTestId('plus-package-resources').check();
        await page.getByTestId('plus-package-generate').click();
        await expect(page.getByTestId('tw-plus-permission')).toBeVisible();
        await expect(page.getByTestId('tw-plus-permission').locator('[data-field="sha256"]')).toHaveText(digest);
        await page.getByTestId('tw-plus-allow').click();
        await expect(page.getByTestId('plus-package-download')).toBeVisible();
        expect(await page.evaluate(() => globalThis.__plusFixtureStarted || 0)).toBe(0);
        const downloading = page.waitForEvent('download');
        await page.getByTestId('plus-package-download').click();
        const download = await downloading;
        const output = path.join(directory, 'package.html');
        await download.saveAs(output);
        await context.setOffline(true);
        const packaged = await context.newPage();
        const external = [];
        packaged.on('request', request => {
            if (/^https?:/.test(request.url())) external.push(request.url());
        });
        await packaged.goto(pathToFileURL(output).href);
        await expect(packaged.getByTestId('tw-plus-permission')).toBeVisible();
        expect(await packaged.evaluate(() => globalThis.__plusFixtureStarted || 0)).toBe(0);
        await packaged.getByTestId('tw-plus-allow').click();
        await expect.poll(() => packaged.evaluate(() => globalThis.__plusFixtureStarted || 0)).toBe(1);
        expect(await packaged.evaluate(() => vm.extensionManager.isExtensionLoaded('plusfixture'))).toBe(true);
        expect(await packaged.evaluate(() => vm.runtime._primitives.plusfixture_value())).toBe('verified VM');
        await expect(packaged.locator('#error')).toBeHidden();
        expect(external).toEqual([]);
        await packaged.close();
    } finally {
        await context.setOffline(false);
        await rm(directory, {recursive: true, force: true});
    }
});
