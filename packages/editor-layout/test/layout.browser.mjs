import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {chromium, expect} from '@playwright/test';

const require = createRequire(import.meta.url);
const origin = 'http://layout.test';
const example = '/example/index.html';
const files = new Map([[example, fileURLToPath(new URL('../example/index.html', import.meta.url))]]);
const source = fileURLToPath(new URL('../src/', import.meta.url));
for (const entry of await readdir(source, {withFileTypes: true})) {
    if (entry.isFile() && /\.(?:js|css)$/.test(entry.name)) {
        files.set(`/src/${entry.name}`, path.join(source, entry.name));
    }
}
for (const name of ['react', 'react-dom']) {
    const entry = `/umd/${name}.development.js`;
    files.set('/node_modules/' + name + entry, path.join(path.dirname(require.resolve(name + '/package.json')), entry));
}

async function openExample(t) {
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const page = await browser.newPage({viewport: {width: 900, height: 600}});
    await page.route(origin + '/**', async route => {
        const pathname = new URL(route.request().url()).pathname;
        const filename = files.get(pathname);
        if (!filename) return route.fulfill({status: 404});
        return route.fulfill({
            body: await readFile(filename),
            contentType: pathname === example ? 'text/html' : pathname.endsWith('.css') ? 'text/css' : 'application/javascript'
        });
    });
    return page;
}

test('the standalone host resizes, restores, and resets its dividers', {timeout: 30_000}, async t => {
    const page = await openExample(t);
    await page.goto(origin + example);
    const columns = page.getByRole('separator', {name: 'Editor width'});
    const rows = page.getByRole('separator', {name: 'Stage height'});
    const toggle = page.getByRole('button', {name: 'Split layout'});
    await expect(columns).toBeVisible();
    const initial = Number(await columns.getAttribute('aria-valuenow'));
    await columns.press('ArrowLeft');
    await expect(columns).toHaveAttribute('aria-valuenow', String(initial - 16));

    const divider = await rows.boundingBox();
    await page.mouse.move(divider.x + 30, divider.y + divider.height / 2);
    await page.mouse.down();
    await page.mouse.move(divider.x + 30, divider.y + 50, {steps: 5});
    await page.mouse.up();
    assert.ok(Number(await rows.getAttribute('aria-valuenow')) > 180);

    await page.setViewportSize({width: 450, height: 600});
    await expect(columns).toHaveAttribute('aria-valuemax', '230');
    await expect(columns).toHaveAttribute('aria-valuenow', '230');
    await page.setViewportSize({width: 420, height: 600});
    await expect(columns).toHaveCount(0);
    await expect(rows).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await page.setViewportSize({width: 900, height: 600});
    await expect(columns).toHaveAttribute('aria-valuenow', String(initial - 16));

    await toggle.click();
    await expect(columns).toHaveCount(0);
    await toggle.click();
    await expect(columns).toHaveAttribute('aria-valuenow', String(initial - 16));
    await page.reload();
    await expect(columns).toHaveAttribute('aria-valuenow', String(initial - 16));
    await columns.press('Enter');
    await expect(columns).toHaveAttribute('aria-valuenow', String(initial));
});


test('standard layout and stage visibility work in the standalone package', {timeout: 30_000}, async t => {
    const page = await openExample(t);
    await page.goto(origin + example + '?standard=1');
    const anchor = page.getByRole('button', {name: 'TurboWarp Plus layout'});
    const stageToggle = page.getByRole('button', {name: 'Show stage'});
    const stage = page.locator('[data-stage]');
    const editor = page.getByRole('textbox', {name: 'Editor'});
    await expect(anchor).toHaveAttribute('aria-pressed', 'true');
    await expect(stage).toBeVisible();
    await expect(stage).toHaveCSS('position', 'absolute');
    await expect(page.locator('html')).toHaveAttribute('data-palette', 'top');
    await editor.fill('draft');
    await stageToggle.click();
    await expect(stage).toBeHidden();
    await anchor.click();
    await expect(stage).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-palette', 'side');
    await anchor.click();
    await expect(stage).toBeHidden();
    await stageToggle.click();
    await expect(stage).toBeVisible();
    await expect(editor).toHaveValue('draft');

    await page.goto(origin + example + '?standard=0');
    await expect(stage).toBeVisible();
    await expect(anchor).toHaveCount(0);
});
