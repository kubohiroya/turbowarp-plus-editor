const {test, expect, editorDialog, approveProjectExtensions} = require('./fixtures.cts');
const fixture = require('./preview-project.cts');

const icon = (page, id) => page.locator(`.blocklyBlockCanvas [data-id="${id}"] [data-block-editor-icon]`);
const hover = page => page.locator('[data-preview-fixture-hover]');
const visual = page => editorDialog(page).locator('[data-block-preview-visual]');
const shown = page => visual(page).locator('[data-preview-fixture-value]');
const add = page => visual(page).getByRole('button', {name: 'Add 5', exact: true});
const number = page => editorDialog(page).getByRole('textbox', {name: 'NUMBER', exact: true});
const project = page => page.evaluate(() => window.vm.toJSON(undefined, {allowOptimization: false}));
const counts = page => page.evaluate(() => {
    const {hovers, hoverReleases, mounts, unmounts, quits} = globalThis.__previewFixture;
    return {hovers, hoverReleases, mounts, unmounts, quits};
});
const native = (page, blockId) => page.evaluate(id => {
    const blocks = window.vm.editingTarget.blocks;
    return blocks.getBlock(blocks.getBlock(id).inputs.NUMBER.block).fields.NUM.value;
}, blockId);
const listeners = page => page.evaluate(() => Object.fromEntries(window.vm.runtime.eventNames()
    .map(name => [String(name), window.vm.runtime.listenerCount(name)])));

async function load(page, baseURL) {
    const url = new URL('editor.html', baseURL);
    url.search = new URLSearchParams({lang: 'en', project_url: await fixture.project()}).toString();
    await page.goto(url.href);
    await approveProjectExtensions(page, [fixture.source], 'en');
    await expect(icon(page, 'preview-root')).toHaveCount(1);
    await expect(icon(page, 'plain-root')).toHaveCount(1);
    expect(await page.evaluate(() => globalThis.__previewFixture.capabilities)).toEqual({
        preview: true, fixed: true, isolatedVm: true
    });
}

async function close(page) {
    await editorDialog(page).getByRole('button', {name: 'Cancel', exact: true}).click();
    await expect(editorDialog(page)).toHaveCount(0);
    // Focus returns to the icon, which may legitimately start a new hover.
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.mouse.move(5, 5);
    await expect(hover(page)).toHaveCount(0);
}

test('blocks without a registered preview keep their existing form and never start a preview', async ({page, baseURL, evidence}) => {
    evidence.stage('block-preview-unregistered');
    await load(page, baseURL);
    const original = await project(page);
    await icon(page, 'plain-root').hover();
    await expect(hover(page)).toHaveCount(0);
    await icon(page, 'plain-root').click();
    await expect(editorDialog(page)).toBeVisible();
    await expect(number(page)).toHaveValue('10');
    await expect(editorDialog(page).locator('[data-block-preview-layout]')).toHaveCount(0);
    await close(page);
    expect(await counts(page)).toEqual({hovers: 0, hoverReleases: 0, mounts: 0, unmounts: 0, quits: 0});
    expect(await project(page)).toBe(original);
});

test('registered previews share the form draft, save atomically and release every preview resource', async ({page, baseURL, evidence}, testInfo) => {
    evidence.stage('block-preview-hover');
    await load(page, baseURL);
    const original = await project(page);
    const beforeListeners = await listeners(page);
    await icon(page, 'preview-root').hover();
    await expect(hover(page)).toHaveText('NUMBER 10');
    await page.mouse.move(5, 5);
    await expect(hover(page)).toHaveCount(0);
    expect(await counts(page)).toMatchObject({hovers: 1, hoverReleases: 1});

    evidence.stage('block-preview-shared-draft');
    await icon(page, 'preview-root').click();
    await expect(shown(page)).toHaveText('10');
    await expect(hover(page)).toHaveCount(0);
    await expect(editorDialog(page).locator('[data-block-preview-form]')).toBeVisible();
    await number(page).fill('20');
    await expect(shown(page)).toHaveText('20');
    await add(page).click();
    await expect(number(page)).toHaveValue('25');
    await expect(shown(page)).toHaveText('25');
    // Previews and forms only stage drafts; the existing Save remains the sole persistence path.
    expect(await project(page)).toBe(original);
    expect(await page.evaluate(() => {
        const preview = globalThis.__previewFixture.previewVms.at(-1);
        return {separate: preview !== window.vm && preview.runtime !== window.vm.runtime,
            previewHasFixture: typeof preview.runtime._primitives.previewfixture_place === 'function',
            hostHasFixture: typeof window.vm.runtime._primitives.previewfixture_place === 'function'};
    })).toEqual({separate: true, previewHasFixture: false, hostHasFixture: true});
    await testInfo.attach('block-preview-dialog.png', {body: await page.screenshot(), contentType: 'image/png'});

    evidence.stage('block-preview-atomic-save');
    await editorDialog(page).locator('[data-block-editor-save]').click();
    await expect(editorDialog(page)).toHaveCount(0);
    await expect.poll(() => native(page, 'preview-root')).toBe('25');
    expect(await counts(page)).toMatchObject({mounts: 1, unmounts: 1, quits: 1});
    await page.evaluate(() => window.ScratchBlocks.getMainWorkspace().undo(false));
    await expect.poll(() => native(page, 'preview-root')).toBe('10');
    await page.evaluate(() => window.ScratchBlocks.getMainWorkspace().undo(true));
    await expect.poll(() => native(page, 'preview-root')).toBe('25');
    await page.evaluate(() => window.ScratchBlocks.getMainWorkspace().undo(false));
    await expect.poll(() => native(page, 'preview-root')).toBe('10');

    evidence.stage('block-preview-cancel-cleanup');
    const beforeCancel = await project(page);
    await icon(page, 'preview-root').click();
    await add(page).click();
    await expect(number(page)).toHaveValue('15');
    await close(page);
    await expect(visual(page)).toHaveCount(0);
    expect(await project(page)).toBe(beforeCancel);
    const released = await counts(page);
    expect(released.hoverReleases).toBe(released.hovers);
    expect(released).toMatchObject({mounts: 2, unmounts: 2, quits: 2});
    await expect.poll(() => listeners(page)).toEqual(beforeListeners);
});
