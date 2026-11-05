const {test, expect} = require('./fixtures.cts');
const {devices} = require('@playwright/test');
const Zip = require('@turbowarp/jszip');
const {specifications, installFixtures, selection, row, openCatalog, saveSB3, reopenSB3} =
    require('./catalog.cts');

test.use({userAgent: devices['Pixel 7'].userAgent});

const firstURI = 'https://example.invalid/first.sb3';
const nextURI = 'https://example.invalid/published.sb3';
const uriField = page => page.getByRole('textbox', {name: '作品の URI'});
const uriDialog = page => page.getByRole('dialog', {name: '作品のプロパティ', exact: true});
const propertiesMenuItem = page => page.getByRole('button', {name: '作品のプロパティ…', exact: true});
const openFileMenu = page => page.getByText('ファイル', {exact: true}).locator('xpath=ancestor::div[1]').click();

async function openProperties(page) {
    await openFileMenu(page);
    await propertiesMenuItem(page).click();
    await expect(uriDialog(page)).toBeVisible();
}

async function openEditor(page, query = '') {
    await page.goto(`editor.html?lang=ja${query}`);
    await page.waitForFunction(() => globalThis.vm?.runtime?.targets?.length > 0);
}

async function setURI(page, uri) {
    await uriField(page).fill(uri);
    await uriDialog(page).getByRole('button', {name: '適用', exact: true}).click();
    await expect(uriDialog(page)).toHaveCount(0);
}

async function readSB3(bytes) {
    const zip = await Zip.loadAsync(bytes);
    const project = JSON.parse(await zip.file('project.json').async('string'));
    return {zip, project};
}

test('a regular project saves an explicitly chosen URI and shows it after reopening the SB3', async ({page, context}) => {
    await installFixtures(context);
    await openEditor(page);
    const before = await readSB3(await saveSB3(page));
    expect(before.project.turboWarpPlus).toBeUndefined();

    await openProperties(page);
    await expect(uriField(page)).toHaveValue('');
    const author = uriDialog(page).getByRole('combobox', {name: '作者名'});
    await author.fill('テスト作者');
    await uriField(page).fill('http://example.invalid/project.sb3');
    await uriDialog(page).getByRole('button', {name: '適用', exact: true}).click();
    await expect(uriDialog(page).getByRole('alert')).toContainText('HTTPS URI');
    const authorAfterRejection = await page.evaluate(() => JSON.parse(vm.toJSON()).turboWarpPlusProject?.author);
    expect(authorAfterRejection).toBe(before.project.turboWarpPlusProject?.author);
    await setURI(page, firstURI);

    const saved = await saveSB3(page);
    const {project} = await readSB3(saved);
    expect(project.turboWarpPlus).toEqual({schemaVersion: 1, uri: firstURI, extensions: []});
    expect(project.targets).toEqual(before.project.targets);
    expect(project.turboWarpPlusProject.author).toBe('テスト作者');

    await openEditor(page);
    await reopenSB3(page, saved, 'uri-project.sb3');
    await page.waitForFunction(uri => {
        try { return JSON.parse(vm.toJSON()).turboWarpPlus?.uri === uri; }
        catch { return false; }
    }, firstURI);
    await openProperties(page);
    await expect(uriField(page)).toHaveValue(firstURI);
    await expect(author).toHaveValue('テスト作者');
    await uriField(page).fill(nextURI);
    await uriDialog(page).getByRole('button', {name: 'キャンセル', exact: true}).click();
    await expect(uriDialog(page)).toHaveCount(0);
    const reopened = await readSB3(await saveSB3(page));
    expect(reopened.project.turboWarpPlus.uri).toBe(firstURI);
});

test('changing the URI preserves the embedded extension and its contents when saving and reopening', async ({page, context}) => {
    const spec = specifications.find(item => item.distribution === 'embedded-file');
    await installFixtures(context, [spec]);
    await openEditor(page);
    await openProperties(page);
    await setURI(page, firstURI);
    await openCatalog(page, 1);
    await expect(page.getByRole('dialog', {name: '機能拡張を作品に追加する'})).toBeVisible();
    await expect(selection(page)).toContainText('作品に追加する機能拡張を選んでください。');
    await expect(uriField(page)).toHaveCount(0);
    await row(page, spec).getByRole('checkbox').check();
    await row(page, spec).getByRole('radio', {name: '作品の中から', exact: true}).check();
    await selection(page).getByRole('button', {name: '追加', exact: true}).click();
    await expect(selection(page)).toHaveCount(0);

    await openProperties(page);
    await expect(uriField(page)).toHaveValue(firstURI);
    await setURI(page, nextURI);
    const saved = await saveSB3(page);
    const {zip, project} = await readSB3(saved);
    expect(project.turboWarpPlus.uri).toBe(nextURI);
    const [extension] = project.turboWarpPlus.extensions;
    expect(extension).toMatchObject({id: spec.id, sha256: spec.sha256, source: {type: 'embedded-file'}});
    expect(await zip.file(extension.source.path).async('nodebuffer')).toEqual(spec.bytes);

    await openEditor(page);
    await reopenSB3(page, saved, 'embedded-uri-project.sb3');
    await expect.poll(() => page.evaluate(id => vm.extensionManager.isExtensionLoaded(id), spec.id)).toBe(true);
    await openProperties(page);
    await expect(uriField(page)).toHaveValue(nextURI);
});

test('explicit opt-out hides the URI field in project properties', async ({page}) => {
    await openEditor(page, '&twPlusManualProjectURI=0');
    await openProperties(page);
    await expect(uriDialog(page).getByRole('textbox', {name: '作品タイトル'})).toBeVisible();
    await expect(uriField(page)).toHaveCount(0);
});
