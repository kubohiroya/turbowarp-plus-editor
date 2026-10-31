const {test, expect, editorDialog, approveProjectExtensions} = require('./fixtures.cts');
const {fixture} = require('./block-preview-project.cts');

const visual = page => page.locator('[data-dsl4-block-preview]');
const hover = page => page.locator('[data-dsl4-block-preview-hover]');
const field = (page, name) => editorDialog(page).locator(`[data-fixed-argument="${name}"] input`);

async function load(page, baseURL, enabled, testInfo) {
    const sample = await fixture();
    await testInfo.attach('published-fixture.json', {body: JSON.stringify(sample.metadata, null, 2),
        contentType: 'application/json'});
    await page.setViewportSize({width: 1560, height: 1040});
    const sourceURL = new URL('preview-authoring-fixture.sb3', baseURL).href;
    await page.route(sourceURL, route => route.fulfill({body: sample.bytes, contentType: 'application/octet-stream'}));
    const url = new URL('editor.html', baseURL);
    url.search = new URLSearchParams({lang: 'ja', twPlusYamlEditor: '1', project_url: sourceURL,
        ...(enabled ? {twPlusBlockPreview: '1'} : {})}).toString();
    await page.goto(url.href);
    await approveProjectExtensions(page, sample.sources, 'ja');
    await expect.poll(() => page.evaluate(() => globalThis.__blockPreviewHostCapabilities)).toEqual({
        preview: true, fixed: true, isolatedVm: true
    });
    await page.locator('[class*="stage-selector_stage-selector_"]').click();
    await page.waitForFunction(id => window.ScratchBlocks?.getMainWorkspace()?.getBlockById(id), sample.ids.scene);
    return sample;
}

async function icon(page, id) {
    await page.evaluate(blockId => {
        const block = window.ScratchBlocks.getMainWorkspace().getBlockById(blockId);
        block.inputList[0].fieldRow[0].fieldGroup_.setAttribute('data-preview-test-block', blockId);
    }, id);
    return page.locator(`[data-preview-test-block="${id}"]`);
}

async function close(page) {
    await editorDialog(page).getByRole('button', {name: 'キャンセル', exact: true}).click();
    await expect(editorDialog(page)).toHaveCount(0);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.mouse.move(10, 10);
    await expect(hover(page)).toHaveCount(0);
}

const actor = page => page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>('[data-dsl4-block-preview] canvas');
    const preview = window.__blockPreviewVms?.find(vm => vm.runtime.renderer?.canvas === canvas);
    const target = preview?.runtime.targets.find(t => !t.isStage && t.getName() === 'Hero');
    return target ? {x: target.x, y: target.y, size: target.size, visible: target.visible} : null;
});
const clones = page => page.evaluate(() => window.__blockPreviewVms.length);
const listeners = page => page.evaluate(() => Object.fromEntries(window.vm.runtime.eventNames()
    .map(name => [String(name), window.vm.runtime.listenerCount(name)])));
const nativeTransform = (page, blockId) => page.evaluate(id => {
    const blocks = window.vm.editingTarget.blocks;
    const block = blocks.getBlock(id);
    const value = name => {
        const shadow = blocks.getBlock(block.inputs[name].block);
        return Number(shadow.fields.NUM?.value ?? shadow.fields.TEXT?.value);
    };
    return {x: value('X'), y: value('Y'), scale: value('SCALE')};
}, blockId);

test('block previews default off while the named scene keeps its existing form', async ({page, baseURL, evidence}, testInfo) => {
    evidence.stage('block-preview-default-off');
    const sample = await load(page, baseURL, false, testInfo);
    const original = await page.evaluate(() => window.vm.toJSON(undefined, {allowOptimization: false}));
    const scene = await icon(page, sample.ids.scene);
    await scene.hover();
    // Observe beyond the hover-intent delay, rather than asserting absence before its timer runs.
    await page.waitForTimeout(400);
    await expect(hover(page)).toHaveCount(0);
    await scene.click();
    await expect(editorDialog(page)).toBeVisible();
    await expect(visual(page)).toHaveCount(0);
    await close(page);
    expect(await page.evaluate(() => window.vm.toJSON(undefined, {allowOptimization: false}))).toBe(original);
    expect(new URL(page.url()).searchParams.has('twPlusBlockPreview')).toBe(false);
});

test('opt-in previews use real scenes, live actor and Bubble settings, atomic saves and isolated cleanup', async ({page, baseURL, evidence}, testInfo) => {
    test.setTimeout(120_000);
    evidence.stage('block-preview-opt-in');
    const sample = await load(page, baseURL, true, testInfo);
    await page.evaluate(() => {
        window.__blockPreviewVms = [];
        const VM = window.vm.constructor;
        Object.defineProperty(window.vm, 'constructor', {configurable: true,
            value: new Proxy(VM, {construct(target, args, newTarget) {
                const preview = Reflect.construct(target, args, newTarget);
                window.__blockPreviewVms.push(preview);
                return preview;
            }})});
    });
    const original = await page.evaluate(() => window.vm.toJSON(undefined, {allowOptimization: false}));
    const beforeListeners = await listeners(page);
    const show = await icon(page, sample.ids.show);
    await show.hover();
    await expect(hover(page).locator('canvas')).toBeVisible({timeout: 30_000});
    await page.mouse.move(10, 10);
    await expect(hover(page)).toHaveCount(0);
    await show.click();
    const bounds = page.locator('[data-dsl4-actor-bounds]');
    await expect(bounds).toBeVisible({timeout: 30_000});
    await expect.poll(() => actor(page)).toEqual({x: -100, y: -20, size: 100, visible: true});
    evidence.stage('block-preview-drag-and-save');
    let rectangle = await bounds.boundingBox();
    const canvas = await visual(page).locator('canvas').boundingBox();
    const beforeDrag = await clones(page);
    await page.mouse.move(rectangle.x + rectangle.width / 2, rectangle.y + rectangle.height / 2);
    await page.mouse.down();
    await page.mouse.move(rectangle.x + rectangle.width / 2 + 40 * canvas.width / 480,
        rectangle.y + rectangle.height / 2 + 20 * canvas.height / 360, {steps: 6});
    await page.mouse.up();
    await expect.poll(async () => Math.abs(Number(await field(page, 'X').inputValue()) + 60) < 2).toBe(true);
    await expect.poll(async () => Math.abs(Number(await field(page, 'Y').inputValue()) + 40) < 2).toBe(true);
    await expect.poll(() => clones(page)).toBeGreaterThan(beforeDrag);
    await expect(bounds).toBeVisible();
    await expect.poll(async () => Math.abs((await actor(page))?.x + 60) < 2).toBe(true);
    rectangle = await bounds.boundingBox();
    await page.mouse.move(rectangle.x + rectangle.width - 1, rectangle.y + rectangle.height / 2);
    await page.mouse.down();
    await page.mouse.move(rectangle.x + rectangle.width + 24, rectangle.y + rectangle.height / 2, {steps: 6});
    await page.mouse.up();
    await expect.poll(async () => Number(await field(page, 'SCALE').inputValue())).toBeGreaterThan(100);
    const saved = {x: Number(await field(page, 'X').inputValue()), y: Number(await field(page, 'Y').inputValue()),
        scale: Number(await field(page, 'SCALE').inputValue())};
    expect(await page.evaluate(() => window.vm.toJSON(undefined, {allowOptimization: false}))).toBe(original);
    await editorDialog(page).locator('[data-block-editor-save]').click();
    await expect(editorDialog(page)).toHaveCount(0);
    await expect.poll(() => nativeTransform(page, sample.ids.show)).toEqual(saved);
    await page.evaluate(() => window.ScratchBlocks.getMainWorkspace().undo(false));
    await expect.poll(() => nativeTransform(page, sample.ids.show)).toEqual({x: -100, y: -20, scale: 100});
    await page.evaluate(() => window.ScratchBlocks.getMainWorkspace().undo(true));
    await expect.poll(() => nativeTransform(page, sample.ids.show)).toEqual(saved);
    await page.evaluate(() => window.ScratchBlocks.getMainWorkspace().undo(false));
    await expect.poll(() => nativeTransform(page, sample.ids.show)).toEqual({x: -100, y: -20, scale: 100});

    evidence.stage('block-preview-live-movement');
    await (await icon(page, sample.ids.moveTo)).click();
    await expect(bounds).toBeVisible({timeout: 30_000});
    const beforeMoveChange = await clones(page);
    await field(page, 'SECONDS').fill('2');
    await field(page, 'X').fill('160');
    await expect.poll(() => clones(page)).toBeGreaterThan(beforeMoveChange);
    await expect.poll(async () => Boolean((await actor(page))?.visible)).toBe(true);
    const moveStart = await actor(page);
    // Two real rendered samples must move towards the edited endpoint before it is reached.
    await page.waitForTimeout(250);
    const moveMiddle = await actor(page);
    expect(moveMiddle.x).toBeGreaterThan(moveStart.x + 2);
    expect(moveMiddle.x).toBeLessThan(160);
    const beforeEasing = await clones(page);
    await editorDialog(page).locator('[data-fixed-argument="EASING"] select').selectOption({label: 'linear'});
    await expect.poll(() => clones(page)).toBeGreaterThan(beforeEasing);
    await close(page);

    evidence.stage('block-preview-live-bubbles');
    for (const [command, text] of [['say', '設定をすぐ確認'], ['think', '心の声もすぐ確認']]) {
        await (await icon(page, sample.ids[command])).click();
        await expect(visual(page).locator('canvas')).toBeVisible({timeout: 30_000});
        const beforeTextChange = await clones(page);
        await editorDialog(page).locator('input[id$="_seconds"]').fill('3');
        if (command === 'say') await editorDialog(page).locator('input[id$="_styles_0"]').fill('alternate');
        await editorDialog(page).locator('input[id$="_text"],textarea[id$="_text"]').fill(text);
        await expect.poll(() => clones(page)).toBeGreaterThan(beforeTextChange);
        await expect(visual(page)).toContainText(text, {timeout: 15_000});
        // Rapid edits may overlap an aborted startup briefly; geometry belongs to the sole surviving stage.
        await expect(visual(page).locator('canvas')).toHaveCount(1, {timeout: 15_000});
        await expect(visual(page)).toContainText(text);
        const previewRect = await visual(page).locator('canvas').boundingBox();
        const formRect = await page.locator('[data-block-preview-form]').boundingBox();
        expect(previewRect.x + previewRect.width).toBeLessThanOrEqual(formRect.x - 8);
        if (command === 'say') await testInfo.attach('live-bubble.png', {body: await page.screenshot(), contentType: 'image/png'});
        await close(page);
    }

    evidence.stage('block-preview-scene-and-cleanup');
    await (await icon(page, sample.ids.scene)).click();
    await expect(visual(page).locator('canvas')).toBeVisible({timeout: 30_000});
    await expect.poll(async () => Boolean((await actor(page))?.visible)).toBe(true);
    await editorDialog(page).getByRole('button', {name: '停止', exact: true}).click();
    const stopped = await actor(page);
    await page.waitForTimeout(200);
    expect(await actor(page)).toEqual(stopped);
    const beforeReplay = await clones(page);
    await editorDialog(page).getByRole('button', {name: 'この場面を再生', exact: true}).click();
    await expect.poll(() => clones(page)).toBeGreaterThan(beforeReplay);
    await expect.poll(async () => Boolean((await actor(page))?.visible)).toBe(true);
    await close(page);
    await expect(visual(page)).toHaveCount(0);
    await expect.poll(() => listeners(page)).toEqual(beforeListeners);
    const host = await page.evaluate(async () => {
        globalThis.__blockPreviewProbeLabel = 'after previews';
        await window.vm.extensionManager.refreshBlocks('blockpreviewprobe');
        const category = window.vm.runtime._blockInfo.find(info => info.id === 'blockpreviewprobe');
        const mainActor = window.vm.runtime.targets.find(target => !target.isStage && target.getName() === 'Hero');
        return {probeText: category.blocks[0].info.text,
            previewHasProbe: window.__blockPreviewVms.some(vm => typeof vm.runtime._primitives.blockpreviewprobe_value === 'function'),
            actor: {x: mainActor.x, y: mainActor.y, size: mainActor.size, visible: mainActor.visible}};
    });
    expect(host).toEqual({probeText: 'after previews', previewHasProbe: false,
        actor: {x: -160, y: 0, size: 100, visible: false}});
    await testInfo.attach('preview-results.json', {body: JSON.stringify({saved, moveStart, moveMiddle,
        stopped, host, previewsCreated: await clones(page)}, null, 2), contentType: 'application/json'});
});
