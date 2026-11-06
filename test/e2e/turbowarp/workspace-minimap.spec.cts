const {test, expect} = require('./fixtures.cts');

test('the sprite costume stays aligned above the minimap when its code is undocked', async ({page}) => {
    await page.goto('editor.html?lang=en&twPlusDockview=0');
    await page.waitForFunction(() => window.vm?.editingTarget && window.ScratchBlocks?.getMainWorkspace());
    await page.locator('[data-plus-workspace-watermark]').waitFor({state: 'attached'});
    // Scratch GUI ignores asset-only updates within 500 ms of rendering its watermark.
    await page.clock.install();
    await page.clock.fastForward(501);
    const watermark = page.locator('[data-plus-workspace-watermark] img[src]');
    await page.evaluate(async () => {
        const target = vm.editingTarget;
        const storage = vm.runtime.storage;
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="20"/></svg>';
        const asset = storage.createAsset(storage.AssetType.ImageVector, 'svg', new TextEncoder().encode(svg), null, true);
        await vm.addCostume(`${asset.assetId}.svg`, {name: 'Watermark fixture', asset, assetId: asset.assetId,
            dataFormat: 'svg', rotationCenterX: 20, rotationCenterY: 20}, target.id);
        target.setCostume(target.getCostumes().length - 1);
        vm.emitTargetsUpdate();
    });
    const minimap = page.locator('[data-workspace-minimap]');
    const checkWatermark = async () => {
        await expect(watermark).toBeVisible();
        await expect.poll(async () => {
            const image = await watermark.boundingBox();
            const map = await minimap.boundingBox();
            return image && map && Math.abs(image.x + image.width - map.x - map.width) <= 2 &&
                image.y + image.height <= map.y;
        }).toBe(true);
    };
    await checkWatermark();
    const viewportSize = page.viewportSize();
    await page.setViewportSize({width: 850, height: 540});
    await checkWatermark();
    await expect.poll(() => watermark.evaluate(img => {
        const rect = img.getBoundingClientRect();
        // Give the pointer-transparent image a hit area to detect occlusion by the floating stage.
        const saved = img.style.pointerEvents;
        img.style.pointerEvents = 'auto';
        const topmost = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        img.style.pointerEvents = saved;
        return img.naturalWidth > 0 && rect.right <= innerWidth && rect.bottom <= innerHeight && topmost === img;
    })).toBe(true);
    await page.setViewportSize(viewportSize);

    await page.getByRole('tab', {name: 'Code', exact: true}).focus();
    await page.getByRole('button', {name: 'Open in another window', exact: true}).click();
    const code = page.getByRole('region', {name: /^Code · /});
    await expect(code.locator('[data-plus-workspace-watermark] img[src]')).toBeVisible();
    await checkWatermark();
    await code.getByRole('button', {name: 'Window layout'}).click();
    await code.getByRole('button', {name: 'Maximize this window'}).click();
    await checkWatermark();
    await code.getByRole('button', {name: 'Window layout'}).click();
    await code.getByRole('button', {name: 'Return to the editor (dock)'}).click();
    await expect(code).toHaveCount(0);
    await checkWatermark();
});

test('the workspace minimap follows blocks, viewport and code tab visibility', async ({page, evidence}) => {
    const minimap = page.locator('[data-workspace-minimap]');
    const paths = minimap.locator('path');
    const viewport = minimap.locator('rect');
    const viewportCenter = () => viewport.evaluate((element: SVGRectElement) => {
        const x = element.x.baseVal.value + element.width.baseVal.value / 2;
        const y = element.y.baseVal.value + element.height.baseVal.value / 2;
        const screen = new DOMPoint(x, y).matrixTransform(element.getScreenCTM());
        return {x: screen.x, y: screen.y};
    });
    evidence.stage('explicit-opt-out');
    await page.goto('editor.html?lang=en&twPlusWorkspaceMinimap=0');
    await expect(page.locator('.blocklyToolboxDiv')).toBeVisible();
    await expect(minimap).toHaveCount(0);

    evidence.stage('default-plus-layout');
    await page.goto('editor.html?lang=en');
    await expect(page.locator('.blocklyToolboxDiv[data-horizontal-block-palette]')).toBeVisible();
    await expect(minimap).toBeVisible();
    const zoom = (action: string) => page.locator(`[data-plus-zoom-action="${action}"]`);
    const [minus, plus, reset] = await Promise.all(['out', 'in', 'reset'].map(action => zoom(action).boundingBox()));
    const mapPosition = await minimap.boundingBox();
    expect(minus.y).toBe(plus.y);
    expect(minus.y).toBe(reset.y);
    expect(minus.x).toBeLessThan(plus.x);
    expect(plus.x).toBeLessThan(reset.x);
    expect(mapPosition.x + mapPosition.width).toBeCloseTo(reset.x + reset.width);
    expect(mapPosition.y + mapPosition.height).toBeLessThan(reset.y);
    const scale = () => page.evaluate(() => window.ScratchBlocks.getMainWorkspace().scale);
    const initialScale = await scale();
    await zoom('out').click();
    await expect.poll(scale).toBeLessThan(initialScale);
    await zoom('in').click();
    await expect.poll(scale).toBeCloseTo(initialScale);
    await zoom('reset').click();
    await expect.poll(scale).toBe(initialScale);

    evidence.stage('classic-layout');
    await page.goto('editor.html?lang=en&twPlusStandardLayout=0&twPlusHorizontalBlockPalette=1');
    await expect(minimap).toBeVisible();
    await expect(minimap).toHaveCSS('cursor', 'pointer');
    await expect(minimap).toHaveCSS('background-color', /\/ 0\.5\)$/);
    await expect.poll(() => page.evaluate(() => Boolean(vm.editingTarget && window.ScratchBlocks?.getMainWorkspace()))).toBe(true);
    await page.evaluate(() => {
        vm.editingTarget.blocks.createBlock({
            id: 'minimap-hat', opcode: 'event_whenflagclicked', topLevel: true, shadow: false,
            parent: null, next: null, x: 60, y: 60, fields: {}, inputs: {}
        });
        vm.editingTarget.blocks.createBlock({
            id: 'minimap-distant', opcode: 'looks_show', topLevel: true, shadow: false,
            parent: null, next: null, x: 1200, y: 900, fields: {}, inputs: {}
        });
        vm.refreshWorkspace();
    });
    await expect(paths).toHaveCount(2);
    const palette = await page.locator('.blocklyFlyoutBackground').first().boundingBox();
    const workspace = await minimap.locator('..').boundingBox();
    const map = await minimap.boundingBox();
    expect(map.width).toBeCloseTo(131.2, 1);
    expect(map.height).toBeCloseTo(83.2, 1);
    expect(map.x).toBeGreaterThanOrEqual(palette.x + palette.width);
    expect(map.x - palette.x - palette.width).toBeLessThan(24);
    const bottomGap = workspace.y + workspace.height - map.y - map.height;
    expect(bottomGap).toBeGreaterThan(0);
    expect(bottomGap).toBeLessThan(24);
    await expect(minimap.locator('path[transform="translate(1200 900)"]')).toHaveCount(1);
    await page.evaluate(() => window.ScratchBlocks.getMainWorkspace().getBlockById('minimap-distant').moveBy(70, 0));
    await expect(paths).toHaveCount(2);
    await expect(minimap.locator('path[transform="translate(1270 900)"]')).toHaveCount(1);
    const scrollArea = () => page.evaluate(() => {
        const workspace = window.ScratchBlocks.getMainWorkspace();
        const metrics = workspace.getMetrics();
        return [metrics.contentLeft, metrics.contentTop, metrics.contentWidth, metrics.contentHeight]
            .map(value => value / workspace.scale).join(' ');
    });
    const viewportFits = () => minimap.evaluate((element: SVGSVGElement) => {
        const map = element.viewBox.baseVal;
        const box = element.querySelector('rect').getBBox();
        return box.x >= map.x - 1 && box.y >= map.y - 1 &&
            box.x + box.width <= map.x + map.width + 1 && box.y + box.height <= map.y + map.height + 1;
    });
    await expect(minimap).toHaveAttribute('viewBox', await scrollArea());

    evidence.stage('pan-zoom-resize');
    const beforePan = await viewport.getAttribute('x');
    const panX = workspace.x + workspace.width - 85;
    const panY = workspace.y + workspace.height / 2;
    await page.mouse.move(panX, panY);
    await page.mouse.down();
    await page.mouse.move(panX - 120, panY - 90, {steps: 8});
    await page.mouse.up();
    await expect(viewport).not.toHaveAttribute('x', beforePan);
    await expect.poll(viewportFits).toBe(true);
    const beforeZoom = await viewport.getAttribute('width');
    await page.evaluate(() => window.ScratchBlocks.getMainWorkspace().zoomCenter(1));
    await expect(viewport).not.toHaveAttribute('width', beforeZoom);
    const beforeResize = await viewport.getAttribute('width');
    await page.setViewportSize({width: 1120, height: 780});
    await expect(viewport).not.toHaveAttribute('width', beforeResize);
    await expect.poll(viewportFits).toBe(true);
    await expect(minimap).toHaveAttribute('viewBox', await scrollArea());

    evidence.stage('click-to-recenter');
    const target = {x: 950, y: 680};
    const click = await minimap.evaluate((element: SVGSVGElement, {x, y}) => {
        const screen = new DOMPoint(x, y).matrixTransform(element.getScreenCTM());
        return {x: screen.x, y: screen.y};
    }, target);
    await page.mouse.click(click.x, click.y);
    await expect.poll(async () => {
        const center = await viewportCenter();
        return Math.hypot(center.x - click.x, center.y - click.y);
    }).toBeLessThan(2);
    await expect(minimap).toHaveAttribute('viewBox', await scrollArea());

    evidence.stage('drag-viewport');
    const beforeDrag = await viewportCenter();
    const grab = {x: beforeDrag.x + 5, y: beforeDrag.y + 3};
    const delta = {x: -24, y: -15};
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + delta.x, grab.y + delta.y, {steps: 8});
    const dragError = async () => {
        const center = await viewportCenter();
        return Math.hypot(center.x - beforeDrag.x - delta.x, center.y - beforeDrag.y - delta.y);
    };
    await expect(minimap).toHaveAttribute('data-dragging', '');
    await expect.poll(dragError).toBeLessThan(2);
    await page.mouse.up();
    await expect(minimap).not.toHaveAttribute('data-dragging');
    await expect.poll(dragError).toBeLessThan(2);

    evidence.stage('horizontal-palette');
    const motion = page.locator('.blocklyToolboxDiv .scratchCategoryId-motion');
    const verticalLeft = await minimap.evaluate(element => element.getBoundingClientRect().left);
    await motion.click({button: 'right'});
    await page.getByRole('menuitem', {name: 'Use horizontal palette', exact: true}).click();
    await expect.poll(() => minimap.evaluate(element => element.getBoundingClientRect().left))
        .toBeLessThan(verticalLeft - 100);
    await expect(paths).toHaveCount(2);
    await motion.click({button: 'right'});
    await page.getByRole('menuitem', {name: 'Use vertical palette', exact: true}).click();
    await expect.poll(() => minimap.evaluate(element => element.getBoundingClientRect().left))
        .toBeCloseTo(verticalLeft);

    evidence.stage('tabs-and-targets');
    await page.getByRole('tab', {name: 'Costumes'}).click();
    await expect(minimap).toBeHidden();
    await page.getByRole('tab', {name: 'Code'}).click();
    await expect(minimap).toBeVisible();
    await expect(paths).toHaveCount(2);
    await page.locator('[class*="stage-selector_stage-selector"]').click();
    await expect(paths).toHaveCount(0);
    await expect(minimap).toBeVisible();
    const emptyMap = await minimap.getAttribute('viewBox');
    const emptyViewportX = await viewport.getAttribute('x');
    await page.evaluate(() => {
        const workspace = window.ScratchBlocks.getMainWorkspace();
        const metrics = workspace.getMetrics();
        workspace.scrollbar.set(metrics.viewWidth * 0.2, metrics.viewHeight * 0.2);
    });
    await expect(viewport).not.toHaveAttribute('x', emptyViewportX);
    await expect(minimap).toHaveAttribute('viewBox', emptyMap);
    await expect.poll(viewportFits).toBe(true);
});
