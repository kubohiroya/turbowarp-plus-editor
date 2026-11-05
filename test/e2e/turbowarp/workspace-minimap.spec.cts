const {test, expect} = require('./fixtures.cts');

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
    await expect(page.getByRole('button', {name: 'Add Extension', exact: true})).toBeVisible();
    await expect(minimap).toHaveCount(0);

    evidence.stage('default-plus-layout');
    await page.goto('editor.html?lang=en');
    await expect(page.locator('.blocklyToolboxDiv[data-horizontal-block-palette]')).toBeVisible();
    await expect(minimap).toBeVisible();

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
    const fittedArea = await minimap.evaluate((element: SVGSVGElement) => {
        const {x, y, width, height} = element.querySelector('g').getBBox();
        const rendered = window.ScratchBlocks.getMainWorkspace().getAllBlocks(false);
        const halfMeanWidth = rendered.reduce((sum, block) => sum + block.width, 0) / (2 * rendered.length);
        return [x - halfMeanWidth, y - halfMeanWidth, width + 2 * halfMeanWidth, height + 2 * halfMeanWidth].join(' ');
    });
    await expect(minimap).toHaveAttribute('viewBox', fittedArea);

    evidence.stage('pan-zoom-resize');
    const beforePan = await viewport.getAttribute('x');
    const panX = workspace.x + workspace.width - 85;
    const panY = workspace.y + workspace.height / 2;
    await page.mouse.move(panX, panY);
    await page.mouse.down();
    await page.mouse.move(panX - 120, panY - 90, {steps: 8});
    await page.mouse.up();
    await expect(viewport).not.toHaveAttribute('x', beforePan);
    const beforeZoom = await viewport.getAttribute('width');
    await page.evaluate(() => window.ScratchBlocks.getMainWorkspace().zoomCenter(1));
    await expect(viewport).not.toHaveAttribute('width', beforeZoom);
    const beforeResize = await viewport.getAttribute('width');
    await page.setViewportSize({width: 1120, height: 780});
    await expect(viewport).not.toHaveAttribute('width', beforeResize);
    await expect(minimap).toHaveAttribute('viewBox', fittedArea);

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
    await expect(minimap).toHaveAttribute('viewBox', fittedArea);

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
});
