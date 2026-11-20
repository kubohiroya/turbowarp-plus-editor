const {createHash} = require('node:crypto');
const Zip = require('@turbowarp/jszip');
const {test, expect} = require('./fixtures.cts');
const {openExtensionLibrary} = require('./catalog.cts');
const packageFixture = require('./fixtures/resource-package.json');
const declaration = packageFixture.turbowarpExtension.resourceDeclaration;
const catalogURL = 'https://kubohiroya.github.io/turbowarp-plus-packages/extensions-v1.json';
const source = '// Name: Resource camera fixture\n// ID: resourcecamera\n' +
    'globalThis.__resourceFixtureStarted = (globalThis.__resourceFixtureStarted || 0) + 1;';
const sha256 = createHash('sha256').update(source).digest('hex');
const url = 'https://resource-fixture.invalid/camera.js';
const resources = page => page.locator('.twextsec-row').filter({has: page.locator('strong', {hasText: 'Resource camera fixture'})});

async function openEditor(page, locale) {
    await page.goto(`editor.html?lang=${locale}`);
    await page.waitForFunction(() => globalThis.vm?.runtime?.targets?.length > 0);
}

async function install(context) {
    await context.route(catalogURL, route => route.fulfill({json: {schemaVersion: 1, extensions: [
        {id: 'resourcecamera', name: 'Resource camera fixture', url, sha256, dependencies: [],
            package: packageFixture.name, version: packageFixture.version, resourceDeclaration: declaration},
        {id: 'resourceempty', name: 'Reviewed empty fixture', url: 'https://resource-fixture.invalid/empty.js',
            resourceDeclaration: {schemaVersion: 1, resources: []}},
        {id: 'resourceold', name: 'Undeclared fixture', url: 'https://resource-fixture.invalid/old.js'}
    ]}, headers: {'access-control-allow-origin': '*'}}));
    await context.route('https://extensions.turbowarp.org/generated-metadata/extensions-v0.json',
        route => route.fulfill({json: {extensions: []}, headers: {'access-control-allow-origin': '*'}}));
    await context.route(url, route => route.fulfill({body: source, contentType: 'application/javascript',
        headers: {'access-control-allow-origin': '*'}}));
    await context.addInitScript(() => {
        globalThis.__resourceDeviceCalls = [];
        if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => {
            globalThis.__resourceDeviceCalls.push('getUserMedia'); throw Error('A disclosure must not open a device');
        };
    });
}

async function projectURL(changed = false) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"></svg>';
    const assetId = createHash('md5').update(svg).digest('hex');
    const unknown = '// Name: Unlisted fixture\n// ID: unlistedresource\nglobalThis.__resourceUnknownStarted = 1;';
    const code = changed ? source + '\n// different version' : source;
    const project = {targets: [{isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, comments: {},
        blocks: {a: {opcode: 'resourcecamera_value', next: null, parent: null, inputs: {}, fields: {}, shadow: false,
            topLevel: true, x: 30, y: 40}, b: {opcode: 'unlistedresource_value', next: null, parent: null, inputs: {},
            fields: {}, shadow: false, topLevel: true, x: 30, y: 100}}, currentCostume: 0,
        costumes: [{name: 'Blank', assetId, dataFormat: 'svg', md5ext: `${assetId}.svg`, rotationCenterX: 240, rotationCenterY: 180}],
        sounds: [], volume: 100, tempo: 60, videoTransparency: 50, videoState: 'off', textToSpeechLanguage: null}],
        monitors: [], extensions: ['resourcecamera', 'unlistedresource'], extensionURLs: {
            resourcecamera: `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`,
            unlistedresource: `data:text/javascript;base64,${Buffer.from(unknown).toString('base64')}`
        }, meta: {semver: '3.0.0', vm: '2.0.0', agent: 'Resource declaration fixture'}};
    const zip = new Zip().file('project.json', JSON.stringify(project)).file(`${assetId}.svg`, svg);
    return `data:application/octet-stream;base64,${await zip.generateAsync({type: 'base64', compression: 'DEFLATE'})}`;
}

for (const locale of ['ja', 'en']) {
    test(`${locale}: the Plus add screen displays package resource declarations and preserves cancellation`, async ({page, context}, testInfo) => {
        await install(context);
        await openEditor(page, locale);
        await openExtensionLibrary(page, locale === 'ja' ? 'ファイル' : 'File', locale === 'ja' ? '機能拡張の追加' : 'Add Extension');
        await page.getByRole('button', {name: 'TurboWarp Plus', exact: true}).click();
        const row = resources(page);
        await expect(row.locator('.twextsec-resource-chip')).toHaveCount(3);
        await expect(row.locator('summary')).toContainText(locale === 'ja' ? '許可要求のみ' : 'permission request');
        await expect(row.locator('details')).not.toHaveAttribute('open', '');
        await expect(row.locator('.twextsec-resource-label').first()).toHaveCSS('position', 'absolute');
        await testInfo.attach(`resources-add-${locale}-collapsed.png`, {body: await row.screenshot(), contentType: 'image/png'});
        await row.locator('summary').click();
        await expect(row.locator('.twextsec-resource-label').first()).toHaveCSS('position', 'static');
        await testInfo.attach(`resources-add-${locale}-expanded.png`, {body: await row.screenshot(), contentType: 'image/png'});
        await expect(row.locator('details')).toHaveAttribute('open', '');
        await expect(row.locator('details')).toContainText(locale === 'ja' ? '音声トラックは取得直後に停止' : 'audio tracks are immediately stopped');
        await expect(row.getByRole('checkbox')).not.toBeChecked();
        await expect(page.getByText(locale === 'ja' ? 'リソース利用の申告：なし' : 'Resource use: none declared', {exact: true})).toBeVisible();
        await expect(page.getByText(locale === 'ja' ? 'リソース利用：未申告' : 'Resource use: not declared', {exact: true})).toBeVisible();
        await page.setViewportSize({width: 390, height: 844});
        await row.scrollIntoViewIfNeeded();
        const box = await row.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(390);
        await testInfo.attach(`resources-add-${locale}.png`, {body: await page.screenshot(), contentType: 'image/png'});
        const lastExplanation = row.locator('details > p');
        await lastExplanation.scrollIntoViewIfNeeded();
        await expect(lastExplanation).toBeInViewport({ratio: 1});
        await testInfo.attach(`resources-add-${locale}-end.png`, {body: await page.screenshot(), contentType: 'image/png'});
        expect(await page.evaluate(() => globalThis.__resourceDeviceCalls)).toEqual([]);
        expect(await page.evaluate(() => globalThis.__resourceFixtureStarted || 0)).toBe(0);
        await page.getByTestId('twextsec-cancel').click();
        await expect(page.locator('.twextsec-review')).toHaveCount(0);
    });
}

test('opening an embedded project resolves declarations before approval and starts nothing on cancel', async ({page, context}, testInfo) => {
    await install(context);
    await page.goto(`editor.html?lang=ja&project_url=${encodeURIComponent(await projectURL())}`);
    const row = resources(page);
    await expect(row.locator('.twextsec-resource-chip')).toHaveCount(3);
    await expect(row.locator('details')).not.toHaveAttribute('open', '');
    await expect(row.locator('.twextsec-resource-label').first()).toHaveCSS('position', 'absolute');
    await testInfo.attach('resources-open-ja-collapsed.png', {body: await row.screenshot(), contentType: 'image/png'});
    await row.locator('summary').click();
    await expect(row.locator('.twextsec-resource-label').first()).toHaveCSS('position', 'static');
    await testInfo.attach('resources-open-ja-expanded.png', {body: await row.screenshot(), contentType: 'image/png'});
    await row.locator('summary').press('Enter');
    await expect(row.locator('details')).not.toHaveAttribute('open', '');
    await row.locator('summary').press('Space');
    await expect(row.locator('details')).toHaveAttribute('open', '');
    await expect(row).toContainText('校正プロファイル');
    expect(await page.evaluate(() => globalThis.__resourceFixtureStarted || 0)).toBe(0);
    expect(await page.evaluate(() => globalThis.__resourceUnknownStarted || 0)).toBe(0);
    await testInfo.attach('resources-open-ja.png', {body: await row.screenshot(), contentType: 'image/png'});
    await page.getByTestId('twextsec-cancel').click();
    await expect(page.locator('.twextsec-review')).toHaveCount(0);
    expect(await page.evaluate(() => globalThis.__resourceDeviceCalls)).toEqual([]);
    expect(await page.evaluate(() => globalThis.__resourceFixtureStarted || 0)).toBe(0);
});

test('an embedded extension with a different digest does not inherit another version\'s resource declaration', async ({page, context}) => {
    await install(context);
    await page.goto(`editor.html?lang=ja&project_url=${encodeURIComponent(await projectURL(true))}`);
    const row = resources(page);
    await expect(row.locator('.twextsec-resource-status')).toHaveText('リソース利用：未申告');
    await expect(row.locator('.twextsec-resource-chip')).toHaveCount(0);
    await page.getByTestId('twextsec-cancel').click();
});
