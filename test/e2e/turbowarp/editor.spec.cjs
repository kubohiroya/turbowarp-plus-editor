const fs = require('node:fs/promises');
const {createHash} = require('node:crypto');
const JSZip = require('@turbowarp/jszip');
const {selectNativeProject} = require('./native-picker.cjs');
const {test, expect, editorDialog, approveProjectExtensions} = require('./fixtures.cjs');

const savedValue = {duration: 9, label: '最新版「秋」 & "scene"'};
const iconSelector = '[data-block-editor-icon]';
const modal = editorDialog;
const label = page => modal(page).getByRole('textbox', {name: 'Scene label*', exact: true});
const duration = page => modal(page).getByRole('spinbutton', {name: 'Duration (seconds)*', exact: true});
const save = page => modal(page).locator('[data-block-editor-save]');
const cancel = page => modal(page).getByRole('button', {name: 'キャンセル', exact: true});

const start = async page => {
    await page.goto('editor.html?lang=ja');
    await expect(page.getByRole('button', {name: '拡張機能を追加', exact: true})).toBeVisible();
};

const loadSample = async (page, baseURL) => {
    const response = await page.request.get(new URL('static/extensions/block-editor.js', baseURL).href);
    expect(response.ok()).toBeTruthy();
    const source = await response.text();
    await page.getByRole('button', {name: '拡張機能を追加', exact: true}).click();
    await page.getByText('カスタム拡張機能', {exact: true}).click();
    const loader = page.getByRole('dialog');
    await loader.getByText('テキスト', {exact: true}).click();
    await loader.locator('textarea').fill(source);
    await loader.getByRole('checkbox', {name: 'サンドボックスなしで実行する', exact: true}).check();
    await loader.getByRole('button', {name: '読み込む', exact: true}).click();
    await expect(loader).toHaveCount(0);
    await page.locator('.scratchCategoryMenuItemLabel').filter({hasText: 'Block editor demo'})
        .click();
    const block = page.locator('.blocklyFlyout .blocklyDraggable').filter({hasText: 'scene properties'});
    await expect(block).toHaveCount(1);
    // Hover waits for the flyout animation before measuring the drag origin.
    await block.hover();
    const from = await block.boundingBox();
    const workspace = await page.locator('.blocklySvg').first()
        .boundingBox();
    expect(from).not.toBeNull();
    expect(workspace).not.toBeNull();
    await page.mouse.move(from.x + 100, from.y + 20);
    await page.mouse.down();
    await page.mouse.move(workspace.x + (workspace.width * 0.65), workspace.y + 200, {steps: 20});
    await page.mouse.up();
    await expect(page.locator('.blocklySvg > .blocklyWorkspace > .blocklyBlockCanvas > .blocklyDraggable').filter({
        hasText: 'scene properties'
    })).toHaveCount(1);
    return source;
};

const openEditor = async page => {
    await page.getByRole('button', {name: 'ブロックを編集', exact: true}).click();
    await expect(modal(page)).toBeVisible();
    await expect(modal(page)).toHaveAccessibleName(/scene properties.*を編集$/);
};

const expectValue = async (page, value) => {
    await expect(label(page)).toHaveValue(value.label);
    await expect(duration(page)).toHaveValue(String(value.duration));
};

const blockText = page => page.locator(iconSelector).evaluate(icon => icon.closest('.blocklyDraggable').textContent);

test('専用エディターの検証・保存・キャンセルと実sb3の保存/再読込', async ({
    page, baseURL, browser, contextOptions, userAgent, viewport, locale, evidence
}, testInfo) => {
    evidence.stage('sample-ui');
    await start(page);
    const source = await loadSample(page, baseURL);
    await expect(page.locator(iconSelector)).toHaveCount(1);
    await openEditor(page);
    await expectValue(page, {label: 'Opening', duration: 2});
    const original = await blockText(page);

    evidence.stage('validation');
    for (const [value, message] of [['0', 'must be >= 1'], ['61', 'must be <= 60']]) {
        await duration(page).fill(value);
        await expect(modal(page)).toContainText(message);
        await expect(save(page)).toBeDisabled();
        expect(await blockText(page)).toBe(original);
    }
    await duration(page).fill(String(savedValue.duration));
    await label(page).fill('');
    await expect(modal(page)).toContainText('must have required property');
    await expect(save(page)).toBeDisabled();
    expect(await blockText(page)).toBe(original);

    evidence.stage('save-and-cancel');
    await label(page).fill(savedValue.label);
    await expect(save(page)).toBeEnabled();
    await save(page).click();
    await expect(modal(page)).toHaveCount(0);
    await openEditor(page);
    await expectValue(page, savedValue);
    const committed = await blockText(page);
    await label(page).fill('破棄する下書き');
    await duration(page).fill('13');
    await cancel(page).click();
    await expect(modal(page)).toHaveCount(0);
    expect(await blockText(page)).toBe(committed);
    await openEditor(page);
    await expectValue(page, savedValue);
    await cancel(page).click();

    evidence.stage('sb3-download');
    await page.getByPlaceholder('プロジェクトのタイトルを入力', {exact: true}).fill('block-editor-e2e');
    await page.getByText('ファイル', {exact: true}).click();
    const downloadPending = page.waitForEvent('download');
    // This menu always downloads a new file, including browsers with the native save API.
    await page.getByRole('listitem').filter({
        hasText: /^(別ファイルで保存する\.\.\.|コンピューターに保存する)$/
    })
        .click();
    const download = await downloadPending;
    expect(download.suggestedFilename()).toBe('block-editor-e2e.sb3');
    const filename = testInfo.outputPath('roundtrip.sb3');
    await download.saveAs(filename);
    const bytes = await fs.readFile(filename);
    await testInfo.attach('roundtrip.sb3', {path: filename, contentType: 'application/octet-stream'});
    evidence.stage('sb3-data-check');
    const zip = await JSZip.loadAsync(bytes, {checkCRC32: true});
    const project = JSON.parse(await zip.file('project.json').async('string'));
    const blocks = project.targets.flatMap(target => Object.values(target.blocks));
    const scenes = blocks.filter(block => block.opcode === 'blockeditordemo_scene');
    expect(scenes).toHaveLength(1);
    expect(JSON.parse(scenes[0].inputs.PROPERTIES[1][1])).toEqual(savedValue);
    for (const key of ['draft', 'schema', 'revision', 'editorId']) expect(scenes[0]).not.toHaveProperty(key);
    const extensionURL = project.extensionURLs.blockeditordemo;
    expect(decodeURIComponent(extensionURL.slice(extensionURL.indexOf(',') + 1))).toBe(source);
    await testInfo.attach('sb3-check.json', {body: JSON.stringify({
        size: bytes.length,
        sha256: createHash('sha256').update(bytes)
            .digest('hex'),
        savedValue
    }, null, 2),
    contentType: 'application/json'});

    evidence.stage('reload-route');
    const reloadedContext = await browser.newContext({...contextOptions, baseURL, userAgent, viewport, locale});
    let reloadSucceeded = false;
    try {
        const reloaded = await reloadedContext.newPage();
        evidence.observe(reloaded);
        if (testInfo.project.name === 'chromium-file-input') {
            await start(reloaded);
            // The app uses file input for Android user agents even when the native API exists.
            expect(await reloaded.evaluate(() => navigator.userAgent)).toContain('Android');
            await reloaded.getByText('ファイル', {exact: true}).click();
            const chooserPending = reloaded.waitForEvent('filechooser');
            await reloaded.getByText('コンピューターから読み込む', {exact: true}).click();
            await (await chooserPending).setFiles(filename);
        } else if (testInfo.project.name === 'chrome-macos-native') {
            await start(reloaded);
            expect(await reloaded.evaluate(() => typeof window.showOpenFilePicker)).toBe('function');
            expect(await reloaded.evaluate(() => navigator.userAgent)).not.toContain('Android');
            await reloaded.bringToFront();
            await reloaded.getByText('ファイル', {exact: true}).click();
            // Start the real picker without waiting for the browser to handle a native modal.
            await reloaded.getByText('コンピューターから読み込む', {exact: true}).click({noWaitAfter: true});
            evidence.stage('native-os-picker');
            await selectNativeProject(browser, filename, testInfo);
            evidence.nativeSelected();
            await testInfo.attach('native-picker.json', {body: JSON.stringify({
                route: 'File System Access API / macOS Open panel',
                nativeOSPicker: 'selected-file',
                APIReplaced: false
            }),
            contentType: 'application/json'});
        } else {
            const url = new URL('editor.html', baseURL);
            url.search = new URLSearchParams({
                lang: 'ja',
                project_url: `data:application/octet-stream;base64,${bytes.toString('base64')}`
            });
            await reloaded.goto(url.href);
        }
        evidence.stage('extension-security');
        await approveProjectExtensions(reloaded, [source], 'ja');
        await expect(reloaded.locator(iconSelector)).toHaveCount(1);
        evidence.stage('restored-form');
        await openEditor(reloaded);
        await expectValue(reloaded, savedValue);
        await duration(reloaded).fill('0');
        await expect(save(reloaded)).toBeDisabled();
        await expect(modal(reloaded)).toContainText('must be >= 1');
        await cancel(reloaded).click();
        await openEditor(reloaded);
        await expectValue(reloaded, savedValue);
        await testInfo.attach('restored.png', {body: await reloaded.screenshot(), contentType: 'image/png'});
        reloadSucceeded = true;
        evidence.stage('completed');
        if (testInfo.project.name === 'chrome-macos-native') {
            evidence.nativePassed();
            await testInfo.attach('native-restoration.json', {body: JSON.stringify({
                nativeOSPicker: 'passed', savedValue, restored: true
            }),
            contentType: 'application/json'});
        }
    } finally {
        try {
            if (!reloadSucceeded) {
                const lastPage = reloadedContext.pages().at(-1);
                if (lastPage && !lastPage.isClosed()) {
                    await testInfo.attach('reload-failure.png', {
                        body: await lastPage.screenshot(), contentType: 'image/png'
                    });
                }
            }
        } finally {
            // Playwright Test manages traces for contexts created through the browser fixture.
            await reloadedContext.close();
        }
    }
});

test('通常起動で専用エディターを利用できる', async ({page, baseURL, evidence}) => {
    evidence.stage('standard-default');
    await start(page);
    await loadSample(page, baseURL);
    await expect(page.locator(iconSelector)).toHaveCount(1);
    await openEditor(page);
    await expect(modal(page)).toBeVisible();
    await cancel(page).click();
    await expect(modal(page)).toHaveCount(0);
});
