const {test, expect, approveProjectExtensions} = require('./fixtures.cts');
const {settingsProject, extensionSource, settingsHat} = require('./settings-project.cts');

// A document the Editor cannot open must say so and leave the project as it was (#3, #6). Who
// decides is not the Editor: the registry does not list a hat whose provider never registered, and
// the owner refuses a document it lists. The test-only `twpeyamlsettings` owner refuses `locked`
// when a project carries it; the other hat names a provider no extension registers.
const unavailable = 'この文書は現在利用できません。';
const refusal = 'The settings owner keeps this document locked.';
const project = page => page.evaluate(() => window.vm.toJSON(undefined, {allowOptimization: false}));

const lockedProject = () => settingsProject(async value => {
    const {createEmbeddedYamlMarker} = await import('@kubohiroya/turbowarp-document-source');
    value.extensionStorage.twpeyamlsettings.documents.locked = 'state: locked\n';
    const stage = value.targets.find(target => target.isStage);
    stage.blocks['locked-hat'] = createEmbeddedYamlMarker({opcode: settingsHat,
        reference: {providerId: 'twpeyamlsettings', documentId: 'locked'}, x: 32, y: 330});
    stage.blocks['unregistered-hat'] = createEmbeddedYamlMarker({opcode: settingsHat,
        reference: {providerId: 'twpeunregistered', documentId: 'settings'}, x: 32, y: 480});
});
// The document editor decorates a hat's icon field; find the one that belongs to a block.
const iconOf = async (page, blockId) => {
    const index = await page.evaluate(id => {
        const field = window.ScratchBlocks.getMainWorkspace().getBlockById(id)?.inputList?.[0]?.fieldRow?.[0];
        return [...document.querySelectorAll('[data-twpe-yaml-hat-icon]')].indexOf(field?.fieldGroup_);
    }, blockId);
    expect(index).toBeGreaterThanOrEqual(0);
    return page.locator('[data-twpe-yaml-hat-icon]').nth(index);
};
const load = async (page, baseURL) => {
    const bytes = await lockedProject();
    const projectURL = new URL('static/document-refusal.sb3', baseURL).href;
    await page.route(projectURL, route => route.fulfill({status: 200, contentType: 'application/octet-stream', body: bytes}));
    const url = new URL('editor.html', baseURL);
    url.search = new URLSearchParams({lang: 'ja', twPlusYamlEditor: '1', project_url: projectURL}).toString();
    await page.goto(url.href);
    await approveProjectExtensions(page, [await extensionSource(bytes)], 'ja');
    await page.locator('[class*="stage-selector_stage-selector"]').click();
    await expect(page.locator('[data-twpe-yaml-hat-icon]')).toHaveCount(4);
    // Count the VM's own change notifications from here on; a refusal must not emit one.
    await page.evaluate(() => {
        const counter = {count: 0};
        window.vm.on('PROJECT_CHANGED', () => { counter.count++; });
        Object.defineProperty(window, 'twpeProjectChanges', {get: () => counter.count});
    });
};
const changes = page => page.evaluate(() => Reflect.get(window, 'twpeProjectChanges'));
const openFrom = async (page, icon) => {
    await icon.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', {name: 'データソース', exact: true});
    await expect(dialog).toBeVisible();
    return dialog;
};

test('a hat whose provider is not registered is disabled and opens as unavailable without changing the project', async ({page, baseURL, evidence}, testInfo) => {
    await load(page, baseURL);
    const icon = await iconOf(page, 'unregistered-hat');
    await expect(icon).toHaveAttribute('aria-disabled', 'true');
    await expect(await iconOf(page, 'locked-hat')).toHaveAttribute('aria-disabled', 'false');
    const before = await project(page);

    evidence.stage('unregistered-provider');
    const dialog = await openFrom(page, icon);
    await expect(dialog.locator('.twpe-yaml-error')).toContainText(unavailable);
    await expect(dialog.locator('.twpe-yaml-save')).toBeDisabled();
    await testInfo.attach('unregistered-provider.png', {body: await page.screenshot(), contentType: 'image/png'});
    await dialog.getByRole('button', {name: 'キャンセル', exact: true}).click();
    await expect(dialog).toBeHidden();
    expect(await project(page)).toBe(before);
    expect(await changes(page)).toBe(0);
});

test('an owner refusal shows its reason without changing the project', async ({page, baseURL, evidence}, testInfo) => {
    await load(page, baseURL);
    const before = await project(page);

    evidence.stage('owner-refusal');
    const dialog = await openFrom(page, await iconOf(page, 'locked-hat'));
    await expect(dialog.locator('.twpe-yaml-error')).toHaveText(`${unavailable} ${refusal}`);
    await expect(dialog.locator('.twpe-yaml-save')).toBeDisabled();
    await testInfo.attach('owner-refusal.png', {body: await page.screenshot(), contentType: 'image/png'});
    await dialog.getByRole('button', {name: 'キャンセル', exact: true}).click();
    await expect(dialog).toBeHidden();
    expect(await project(page)).toBe(before);
    expect(await changes(page)).toBe(0);
});
