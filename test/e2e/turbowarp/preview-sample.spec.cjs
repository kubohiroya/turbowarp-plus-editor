const {createHash} = require('node:crypto');
const JSZip = require('@turbowarp/jszip');
const {test, expect, editorDialog, approveProjectExtensions} = require('./fixtures.cjs');

const samplePath = 'samples/block-preview/block-preview-rc77.sb3';
const visual = page => page.locator('[data-dsl4-block-preview]');
const hover = page => page.locator('[data-dsl4-block-preview-hover]');

async function icon(page, blockId) {
    await page.evaluate(id => {
        const block = window.ScratchBlocks.getMainWorkspace().getBlockById(id);
        block.inputList[0].fieldRow[0].fieldGroup_.setAttribute('data-public-preview-block', id);
    }, blockId);
    return page.locator(`[data-public-preview-block="${blockId}"]`);
}

async function cancel(page) {
    await editorDialog(page).getByRole('button', {name: 'キャンセル', exact: true}).click();
    await expect(editorDialog(page)).toHaveCount(0);
    await page.evaluate(() => document.activeElement?.blur());
    await page.mouse.move(10, 10);
    await expect(hover(page)).toHaveCount(0);
}

test('the public preview sample opens from the landing page and uses its real published SB3', async ({page, request, baseURL, evidence}, testInfo) => {
    test.setTimeout(120_000);
    evidence.stage('public-preview-sample-assets');
    const projectURL = new URL(samplePath, baseURL).href;
    const metadataResponse = await request.get(new URL('samples/block-preview/metadata.json', baseURL).href);
    expect(metadataResponse.ok()).toBe(true);
    const metadata = await metadataResponse.json();
    const response = await request.get(projectURL);
    expect(response.ok()).toBe(true);
    const bytes = await response.body();
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    expect(metadata.appVersion).toBe('4.0.0-rc.77');
    expect(metadata.sha256).toBe(sha256);
    const archive = await JSZip.loadAsync(bytes);
    const project = JSON.parse(await archive.file('project.json').async('string'));
    const actor = project.targets.find(target => !target.isStage);
    expect(actor, 'The first actor explains how to select the script').toBeTruthy();
    expect(metadata.initialTarget).toBe(actor.name);
    const scriptTarget = project.targets.find(target => target.name === metadata.scriptTarget);
    expect(scriptTarget?.isStage, 'App rc.77 expects its named preview script on Stage').toBe(true);
    const instructions = Object.values(actor.comments).find(comment => !comment.minimized &&
        comment.text.includes('ステージ'));
    expect(instructions, 'The initially selected actor must show the native target-selection instructions').toBeTruthy();
    const allowedExtensions = ['kubohiroyakamishibai4', 'kubohiroyakamishibaiauthoring4', 'kubohiroyaembeddedyaml'];
    expect(project.extensions.every(id => allowedExtensions.includes(id))).toBe(true);
    expect(project.extensions).not.toContain('blockpreviewprobe');
    const sources = Object.values(project.extensionURLs).map(url => {
        expect(url.startsWith('data:text/javascript')).toBe(true);
        const offset = url.indexOf(',');
        return url.slice(0, offset).endsWith(';base64') ? Buffer.from(url.slice(offset + 1), 'base64').toString('utf8') :
            decodeURIComponent(url.slice(offset + 1));
    });
    expect(sources.some(source => source.includes('twPlusBlockPreview') &&
        source.includes('// Version: 4.0.0-rc.77'))).toBe(true);
    expect(sources.every(source => !source.includes('__blockPreviewProbeLabel'))).toBe(true);
    for (const command of ['scene', 'show', 'moveTo', 'say']) {
        expect(typeof metadata.ids[command]).toBe('string');
        expect(scriptTarget.blocks[metadata.ids[command]].opcode).toMatch(new RegExp(`_${command}$`));
    }

    const failures = [];
    page.on('response', resource => {
        if (resource.url().startsWith(baseURL) && resource.status() >= 400)
            failures.push({type: 'http', url: resource.url(), status: resource.status()});
    });
    page.on('requestfailed', resource => {
        if (resource.url().startsWith(baseURL) && !resource.failure()?.errorText.includes('ERR_ABORTED'))
            failures.push({type: 'requestfailed', url: resource.url(), failure: resource.failure()});
    });
    await page.setViewportSize({width: 1560, height: 1040});
    await page.goto('?lang=ja');
    evidence.stage('public-preview-sample-landing');
    const ordinary = new URL(await page.locator('a[data-editor]').getAttribute('href'), baseURL);
    expect(ordinary.searchParams.has('twPlusBlockPreview')).toBe(false);
    expect(ordinary.searchParams.has('twPlusYamlEditor')).toBe(false);
    expect(ordinary.searchParams.has('project_url')).toBe(false);
    const guide = new URL(await page.locator('a[data-preview-guide]').getAttribute('href'), baseURL);
    expect(guide.origin).toBe(new URL(baseURL).origin);
    expect(guide.pathname).toBe(new URL('samples/block-preview/index.html', baseURL).pathname);
    expect(guide.searchParams.get('lang')).toBe('ja');
    expect((await request.get(guide.href)).ok()).toBe(true);
    const button = page.locator('a[data-preview-sample]');
    await expect(button).toHaveText('プレビュー体験サンプルを開く');
    const launch = new URL(await button.getAttribute('href'), baseURL);
    expect(launch.pathname).toBe(new URL('editor.html', baseURL).pathname);
    expect(launch.searchParams.get('project_url')).toBe(projectURL);
    expect(launch.searchParams.get('twPlusBlockPreview')).toBe('1');
    expect(launch.searchParams.get('twPlusYamlEditor')).toBe('1');
    evidence.stage('public-preview-sample-guide');
    const guideScript = page.waitForResponse(resource => resource.url() ===
        new URL('samples/block-preview/guide.js', baseURL).href);
    await page.goto(guide.href);
    expect((await guideScript).ok()).toBe(true);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await expect(page.getByRole('heading', {name: 'ブロックアイコンのプレビューを試す', exact: true})).toBeVisible();
    await page.getByRole('button', {name: 'English', exact: true}).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(new URL(page.url()).searchParams.get('lang')).toBe('en');
    const guideButton = page.locator('a[data-preview-sample]');
    await expect(guideButton).toHaveText('Open the preview sample');
    const guideLaunch = new URL(await guideButton.getAttribute('href'), baseURL);
    expect(guideLaunch.searchParams.get('lang')).toBe('en');
    expect(guideLaunch.searchParams.get('project_url')).toBe(projectURL);
    expect(guideLaunch.searchParams.get('twPlusBlockPreview')).toBe('1');
    expect(guideLaunch.searchParams.get('twPlusYamlEditor')).toBe('1');
    await page.locator('[data-guide-home]').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.getByRole('button', {name: '日本語', exact: true}).click();
    await expect(button).toHaveText('プレビュー体験サンプルを開く');
    expect(await button.getAttribute('href')).toBe(launch.href);
    evidence.stage('public-preview-sample-launch');
    const servedProject = page.waitForResponse(resource => resource.url() === projectURL);
    await button.click();
    await expect(page).toHaveURL(launch.href);
    const loaded = await servedProject;
    expect(loaded.ok()).toBe(true);
    expect(createHash('sha256').update(await loaded.body()).digest('hex')).toBe(sha256);
    await approveProjectExtensions(page, sources, 'ja');
    await page.waitForFunction(name => window.vm?.editingTarget?.getName() === name &&
        window.ScratchBlocks?.getMainWorkspace(), actor.name);
    await expect(page.locator('textarea.scratchCommentTextarea')).toBeVisible();
    await expect(page.locator('textarea.scratchCommentTextarea')).toHaveValue(instructions.text);
    await page.locator('[class*="stage-selector_stage-selector_"]').click();
    await page.waitForFunction(({name, id}) => window.vm?.editingTarget?.getName() === name &&
        window.ScratchBlocks?.getMainWorkspace()?.getBlockById(id), {name: scriptTarget.name, id: metadata.ids.scene});
    evidence.stage('public-preview-sample-visible-blocks');
    const scene = await icon(page, metadata.ids.scene);
    await expect(scene).toBeInViewport();
    const show = await icon(page, metadata.ids.show);
    await expect(show).toBeVisible();
    const original = await page.evaluate(() => window.vm.toJSON(undefined, {allowOptimization: false}));
    await show.hover();
    await expect(hover(page).locator('canvas')).toBeVisible({timeout: 30_000});
    await page.mouse.move(10, 10);
    await expect(hover(page)).toHaveCount(0);
    await show.click();
    await expect(page.locator('[data-dsl4-actor-bounds]')).toBeVisible({timeout: 30_000});
    await cancel(page);

    evidence.stage('public-preview-sample-live-bubble');
    await (await icon(page, metadata.ids.say)).click();
    await expect(visual(page).locator('canvas')).toBeVisible({timeout: 30_000});
    await editorDialog(page).locator('input[id$="_seconds"]').fill('4');
    await editorDialog(page).locator('input[id$="_text"],textarea[id$="_text"]').fill('公開サンプルでプレビュー');
    await expect(visual(page)).toContainText('公開サンプルでプレビュー', {timeout: 15_000});
    await expect(visual(page).locator('canvas')).toHaveCount(1);
    await testInfo.attach('public-preview-sample.png', {body: await page.screenshot(), contentType: 'image/png'});
    await cancel(page);
    expect(await page.evaluate(() => window.vm.toJSON(undefined, {allowOptimization: false}))).toBe(original);
    expect(await page.evaluate(() => Object.keys(JSON.parse(window.vm.toJSON()).extensionURLs).sort()))
        .toEqual(Object.keys(project.extensionURLs).sort());
    expect(failures, 'The actual published sample and its application assets must load successfully').toEqual([]);
    await testInfo.attach('public-preview-sample.json', {body: JSON.stringify({projectURL, sha256, metadata, guideLaunch: guideLaunch.href,
        initialTarget: actor.name, extensions: project.extensions, failures, projectResponseReplaced: false}, null, 2),
    contentType: 'application/json'});
});
