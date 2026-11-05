const selectBackdrop = require('../../fixtures/select-backdrop.ts').default;
const {test, expect, approveProjectExtensions} = require('./fixtures.cts');
const {settingsProject, plainProject, extensionSource, settingsHat: hat} = require('./settings-project.cts');

// The document editor must not change the Editor's own layout: the standard menu bar keeps its
// height and the page never grows past the window (#6). There is no startup switch, so the
// comparison is between a project with a provider's documents and a plain one. The provider is the
// test-only `twpeyamlsettings` owner, built by the same scripts the browser regressions use; the
// plain project is the same SB3 without it, and nothing of the editor shows on it.

const layout = page => page.evaluate(() => {
    const bar = document.querySelector('[class*="menu-bar_menu-bar_"]');
    return {menuBarHeight: bar ? bar.getBoundingClientRect().height : null,
        scrollHeight: document.documentElement.scrollHeight, innerHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth};
});
// Ask the page to scroll as far as it can; a page that does not overflow stays at the origin.
const scrolledBy = page => page.evaluate(() => {
    window.scrollTo(10000, 10000);
    const offset = {x: window.scrollX, y: window.scrollY};
    window.scrollTo(0, 0);
    return offset;
});

test('hats a provider owns get icons and a dialog without changing the menu bar or page height', async ({page, baseURL, evidence}, testInfo) => {
    const bytes = await settingsProject();
    const source = await extensionSource(bytes);
    const projectURL = new URL('static/document-layout.sb3', baseURL).href;
    const plainURL = new URL('static/document-layout-plain.sb3', baseURL).href;
    await page.route(projectURL, route => route.fulfill({status: 200, contentType: 'application/octet-stream', body: bytes}));
    await page.route(plainURL, route => route.fulfill({status: 200, contentType: 'application/octet-stream', body: plainProject()}));
    const goto = async target => {
        const url = new URL('editor.html', baseURL);
        url.search = new URLSearchParams({lang: 'ja', project_url: target}).toString();
        await page.goto(url.href);
    };

    evidence.stage('plain-project');
    await goto(plainURL);
    await selectBackdrop(page);
    await expect.poll(() => page.evaluate(() => window.vm?.runtime?.targets?.length || 0)).toBe(2);
    await expect(page.locator('[data-twpe-yaml-hat-icon]')).toHaveCount(0);
    await expect(page.getByRole('dialog', {name: 'データソース', exact: true})).toHaveCount(0);
    const plain = await layout(page);
    expect(plain.menuBarHeight).toBeGreaterThan(0);
    expect(plain.scrollHeight).toBe(plain.innerHeight);
    expect(await scrolledBy(page)).toEqual({x: 0, y: 0});
    await testInfo.attach('plain-project.png', {body: await page.screenshot(), contentType: 'image/png'});

    evidence.stage('provider-project');
    await goto(projectURL);
    await approveProjectExtensions(page, [source], 'ja');
    await selectBackdrop(page);
    await expect.poll(() => page.evaluate(type => window.ScratchBlocks?.getMainWorkspace()?.getAllBlocks()
        .filter(block => block.type === type).length || 0, hat)).toBe(2);
    await expect(page.locator('[data-twpe-yaml-hat-icon]')).toHaveCount(2);
    const provided = await layout(page);
    expect(provided.menuBarHeight).toBe(plain.menuBarHeight);
    expect(provided.scrollHeight).toBe(provided.innerHeight);
    expect(await scrolledBy(page)).toEqual({x: 0, y: 0});

    evidence.stage('dialog-open');
    await page.locator('[data-twpe-yaml-hat-icon]').first().focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', {name: 'データソース', exact: true});
    await expect(dialog).toBeVisible();
    const withDialog = await layout(page);
    expect(withDialog.menuBarHeight).toBe(plain.menuBarHeight);
    expect(withDialog.scrollHeight).toBe(withDialog.innerHeight);
    expect(withDialog.scrollWidth).toBe(withDialog.innerWidth);
    expect(await scrolledBy(page)).toEqual({x: 0, y: 0});
    await testInfo.attach('dialog-open.png', {body: await page.screenshot(), contentType: 'image/png'});
    await testInfo.attach('document-layout.json', {body: JSON.stringify({plain, provided, withDialog}, null, 2), contentType: 'application/json'});
});
