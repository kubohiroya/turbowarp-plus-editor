const selectBackdrop = require('../../fixtures/select-backdrop.ts').default;
const {test, expect, approveProjectExtensions} = require('./fixtures.cts');
const {settingsProject, extensionSource, settingsHat} = require('./settings-project.cts');

// Source locations reach the built Editor through the same socket as the document editor
// (`attachToWorkspace`), with no startup switch: whether a document's location can be changed is
// its provider's decision (#27). The owner is the test-only
// `twpeyamlsettings`, which marks its source locations editable. What a fetch may
// do, cancellation and reuse of the previewed source are the document editor's own tests; this only
// shows that the controls arrive, that a preview goes through the real VM untouched, and that a
// save patches the real VM.
const sourceURL = 'https://settings.example.test/settings.yml';
const remote = 'volume: 20\nmode: production\n';
const project = page => page.evaluate(() => window.vm.toJSON(undefined, {allowOptimization: false}));

const prepare = async (page, baseURL, bytes) => {
    const projectURL = new URL('static/document-source.sb3', baseURL).href;
    await page.route(projectURL, route => route.fulfill({status: 200, contentType: 'application/octet-stream', body: bytes}));
    const requests = [];
    await page.route('https://settings.example.test/**', route => {
        requests.push(route.request().url());
        return route.fulfill({status: 200, contentType: 'text/yaml', headers: {'Access-Control-Allow-Origin': '*'}, body: remote});
    });
    return {projectURL, requests};
};
const open = async (page, baseURL, projectURL, flags, source) => {
    const url = new URL('editor.html', baseURL);
    url.search = new URLSearchParams({lang: 'ja', ...flags, project_url: projectURL}).toString();
    await page.goto(url.href);
    await approveProjectExtensions(page, [source], 'ja');
    await selectBackdrop(page);
    await expect.poll(() => page.evaluate(type => window.ScratchBlocks?.getMainWorkspace()?.getAllBlocks()
        .filter(block => block.type === type).length || 0, settingsHat)).toBe(2);
    await expect(page.locator('[data-twpe-yaml-hat-icon]')).toHaveCount(2);
};
const openDocument = async page => {
    await page.locator('[data-twpe-yaml-hat-icon]').first().focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', {name: 'データソース', exact: true});
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', {name: 'YAMLテキスト', exact: true})).toHaveValue('volume: 50\nmode: rehearsal\n');
    return dialog;
};

test('the dialog offers source locations and previews a URL without changing the project', async ({page, baseURL, evidence}, testInfo) => {
    const bytes = await settingsProject();
    const {projectURL, requests} = await prepare(page, baseURL, bytes);
    await open(page, baseURL, projectURL, {}, await extensionSource(bytes));
    const before = await project(page);

    evidence.stage('source-controls');
    const dialog = await openDocument(page);
    const location = dialog.getByLabel('参照元', {exact: true});
    await expect(location).toBeVisible();
    await location.selectOption('url');
    await dialog.getByRole('textbox', {name: 'HTTPS URL', exact: true}).fill(sourceURL);
    expect(requests).toEqual([]);

    evidence.stage('url-preview');
    await dialog.getByRole('button', {name: '取得してプレビュー', exact: true}).click();
    await expect(dialog.getByRole('textbox', {name: 'YAMLテキスト', exact: true})).toHaveValue(remote);
    await expect(dialog.locator('.twpe-yaml-save')).toBeEnabled();
    expect(requests).toEqual([sourceURL]);
    expect(await project(page)).toBe(before);
    await testInfo.attach('url-preview.png', {body: await page.screenshot(), contentType: 'image/png'});

    evidence.stage('url-save');
    await dialog.locator('.twpe-yaml-save').click();
    await expect(dialog).toBeHidden();
    // The saved location is a differential patch of the real VM, kept in the owner's storage.
    const saved = JSON.parse(await project(page)).extensionStorage.twpeyamlsettings;
    expect(Object.values<any>(saved.documentSourceLocations.urls).map(entry => entry.url)).toEqual([sourceURL]);
    expect(saved.documents.labels).toBe('title: Chapter 1\n');
    expect(requests).toEqual([sourceURL]);
});

// The abolished switches are not read any more: turning them off leaves the hats' icons and the
// source controls where they are, and still nothing is fetched until a preview is asked for.
test('the removed switches turned off change nothing and nothing is fetched before a preview', async ({page, baseURL, evidence}) => {
    const bytes = await settingsProject();
    const {projectURL, requests} = await prepare(page, baseURL, bytes);
    await open(page, baseURL, projectURL, {twPlusYamlEditor: '0', twPlusDocumentSource: '0'}, await extensionSource(bytes));
    const before = await project(page);

    evidence.stage('source-controls-regardless');
    const dialog = await openDocument(page);
    const location = dialog.getByLabel('参照元', {exact: true});
    await expect(location).toBeVisible();
    await location.selectOption('url');
    await dialog.getByRole('textbox', {name: 'HTTPS URL', exact: true}).fill(sourceURL);
    await expect(dialog.getByRole('button', {name: '取得してプレビュー', exact: true})).toBeVisible();
    await dialog.getByRole('button', {name: 'キャンセル', exact: true}).click();
    const confirmation = page.getByRole('dialog', {name: '変更を保存して文書を閉じますか？', exact: true});
    await expect(confirmation.getByRole('button', {name: '保存して閉じる', exact: true})).toBeDisabled();
    await confirmation.getByRole('button', {name: '破棄して閉じる', exact: true}).click();
    await expect(dialog).toBeHidden();
    expect(requests).toEqual([]);
    expect(await project(page)).toBe(before);
});
