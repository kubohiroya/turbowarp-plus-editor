const {test, expect, approveProjectExtensions} = require('./fixtures.cts');
const {settingsProject, extensionSource} = require('./settings-project.cts');
const selectBackdrop = require('../../fixtures/select-backdrop.ts').default;

test('project search filters uses across sprites and reveals the selected YAML range', async ({page, baseURL}) => {
    const match = '検索対象';
    const bytes = await settingsProject(project => {
        const [stage, sprite] = project.targets;
        stage.comments = {searchNote: {
            blockId: null, x: 400, y: 400, width: 150, height: 90, minimized: false, text: `コメント ${match}`
        }};
        sprite.blocks.searchSay = {
            opcode: 'looks_say', next: null, parent: null, inputs: {MESSAGE: [1, [10, match]]},
            fields: {}, shadow: false, topLevel: true, x: 460, y: 460
        };
        project.extensionStorage.twpeyamlsettings.documents.settings = [
            `first: ${match}`,
            ...Array.from({length: 150}, (_, index) => `key${index}: 値`),
            `last: 📚${match}`
        ].join('\r\n');
    });
    const projectURL = new URL('static/project-search.sb3', baseURL).href;
    await page.route(projectURL, route => route.fulfill({contentType: 'application/octet-stream', body: bytes}));
    const url = new URL('editor.html', baseURL);
    url.search = new URLSearchParams({lang: 'ja', project_url: projectURL}).toString();
    await page.goto(url.href);
    await approveProjectExtensions(page, [await extensionSource(bytes)], 'ja');
    await selectBackdrop(page);

    const search = page.getByRole('combobox', {name: '作品全体を検索'});
    const matches = page.getByRole('listbox', {name: '検索結果'}).getByRole('option');
    await search.fill(match);
    await expect(matches).toHaveCount(4);
    await search.press('Tab');
    await expect(page.getByRole('checkbox', {name: 'ブロック名'})).toBeFocused();
    await page.getByRole('checkbox', {name: 'コメント文'}).uncheck();
    await page.getByRole('checkbox', {name: 'YAML 本文'}).uncheck();
    await expect(matches).toHaveCount(1);
    await matches.getByText(match, {exact: true}).click();
    await expect.poll(() => page.evaluate(() => {
        const vm = window.vm;
        return !vm.editingTarget.isStage && Boolean(window.ScratchBlocks.getMainWorkspace().getBlockById('searchSay'));
    })).toBe(true);

    await search.click();
    await search.fill(match);
    await page.getByRole('checkbox', {name: 'YAML 本文'}).check();
    await matches.filter({hasText: `last: 📚${match}`}).click();
    const preview = page.locator('.twpe-yaml-source-preview textarea:visible');
    await expect(preview).toBeFocused();
    await expect.poll(() => preview.evaluate(field => ({
        selected: field.value.slice(field.selectionStart, field.selectionEnd),
        scrolled: field.scrollTop > 0
    }))).toEqual({selected: match, scrolled: true});
});
