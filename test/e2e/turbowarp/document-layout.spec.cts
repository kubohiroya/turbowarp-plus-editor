const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {test, expect, approveProjectExtensions} = require('./fixtures.cts');

// The document editor must not change the Editor's own layout: the standard menu bar keeps its
// height, the page never grows past the window, and without the startup flag nothing of the
// editor is attached at all (#6). The project is the test-only `twpeyamlsettings` owner, built by
// the same scripts the browser regressions use, so the hats exist whether or not the flag is set.
const root = path.resolve(__dirname, '../../..');
const run = (script, ...args) => {
    const result = spawnSync(process.execPath, [path.join(root, script), ...args], {cwd: root, encoding: 'utf8'});
    if (result.status !== 0) throw new Error(`${script} failed: ${result.stderr}`);
};
const settingsProject = () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'twpe-document-layout-'));
    try {
        const base = path.join(directory, 'base.sb3'), settings = path.join(directory, 'settings.sb3');
        run('test/fixtures/yaml-editor/base-project.ts', base);
        run('scripts/yaml-editor/build-settings-fixture.ts', base, settings);
        return fs.readFileSync(settings);
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
};
const extensionSource = async bytes => {
    const JSZip = require('@turbowarp/jszip');
    const project = JSON.parse(await (await JSZip.loadAsync(bytes)).file('project.json').async('string'));
    const url = project.extensionURLs.twpeyamlsettings;
    return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64').toString('utf8');
};
const hat = 'twpeyamlsettings_embeddedYaml';

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

test('the startup flag adds hat icons and a dialog without changing the menu bar or page height', async ({page, baseURL, evidence}, testInfo) => {
    const bytes = settingsProject();
    const source = await extensionSource(bytes);
    const projectURL = new URL('static/document-layout.sb3', baseURL).href;
    await page.route(projectURL, route => route.fulfill({status: 200, contentType: 'application/octet-stream', body: bytes}));

    const open = async enabled => {
        const url = new URL('editor.html', baseURL);
        url.search = new URLSearchParams({lang: 'ja', ...(enabled ? {twPlusYamlEditor: '1'} : {}), project_url: projectURL}).toString();
        await page.goto(url.href);
        await approveProjectExtensions(page, [source], 'ja');
        await page.locator('[class*="stage-selector_stage-selector"]').click();
        // The hats are on the workspace in both runs; only the icons depend on the flag.
        await expect.poll(() => page.evaluate(type => window.ScratchBlocks?.getMainWorkspace()?.getAllBlocks()
            .filter(block => block.type === type).length || 0, hat)).toBe(2);
    };

    evidence.stage('flag-off');
    await open(false);
    await expect(page.locator('[data-twpe-yaml-hat-icon]')).toHaveCount(0);
    await expect(page.getByRole('dialog', {name: 'データソース', exact: true})).toHaveCount(0);
    const off = await layout(page);
    expect(off.menuBarHeight).toBeGreaterThan(0);
    expect(off.scrollHeight).toBe(off.innerHeight);
    expect(await scrolledBy(page)).toEqual({x: 0, y: 0});
    await testInfo.attach('flag-off.png', {body: await page.screenshot(), contentType: 'image/png'});

    evidence.stage('flag-on');
    await open(true);
    await expect(page.locator('[data-twpe-yaml-hat-icon]')).toHaveCount(2);
    const on = await layout(page);
    expect(on.menuBarHeight).toBe(off.menuBarHeight);
    expect(on.scrollHeight).toBe(on.innerHeight);
    expect(await scrolledBy(page)).toEqual({x: 0, y: 0});

    evidence.stage('dialog-open');
    await page.locator('[data-twpe-yaml-hat-icon]').first().focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', {name: 'データソース', exact: true});
    await expect(dialog).toBeVisible();
    const withDialog = await layout(page);
    expect(withDialog.menuBarHeight).toBe(off.menuBarHeight);
    expect(withDialog.scrollHeight).toBe(withDialog.innerHeight);
    expect(withDialog.scrollWidth).toBe(withDialog.innerWidth);
    expect(await scrolledBy(page)).toEqual({x: 0, y: 0});
    await testInfo.attach('dialog-open.png', {body: await page.screenshot(), contentType: 'image/png'});
    await testInfo.attach('document-layout.json', {body: JSON.stringify({off, on, withDialog}, null, 2), contentType: 'application/json'});
});
