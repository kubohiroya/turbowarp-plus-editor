const {test, expect} = require('@playwright/test');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const filename = path.resolve(__dirname, '../../../.host/issue-4-artifacts/plus-offline.html');

test('official Packager single HTML prompts before unsandboxed execution and runs offline', async ({page, context}) => {
    const requests = [];
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    await context.setOffline(true);
    await page.goto(pathToFileURL(filename).href);
    await expect(page.getByTestId('tw-plus-permission')).toBeVisible();
    expect(await page.evaluate(() => vm.__plusPackageExecutions || 0)).toBe(0);
    await expect(page.getByTestId('tw-plus-permission').locator('[data-field="source"]')).toContainText('extensions/');
    await page.getByTestId('tw-plus-allow').click();
    await expect.poll(() => page.evaluate(() => vm.__plusPackageExecutions || 0)).toBe(1);
    await expect.poll(() => page.evaluate(() => vm.extensionManager.isExtensionLoaded('sample'))).toBe(true);
    expect(await page.evaluate(() => vm.runtime._primitives.sample_value())).toBe(42);
    expect(requests).toEqual([]);
});

test('generation-time consent does not grant execution permission in a distributed HTML', async ({page, context}) => {
    await context.setOffline(true);
    await page.goto(pathToFileURL(filename).href);
    await expect(page.getByTestId('tw-plus-permission')).toBeVisible();
    await page.getByTestId('tw-plus-deny').click();
    await expect(page.getByTestId('tw-plus-permission')).toHaveCount(0);
    expect(await page.evaluate(() => vm.__plusPackageExecutions || 0)).toBe(0);
    expect(await page.evaluate(() => vm.extensionManager.isExtensionLoaded('sample'))).toBe(false);
});
