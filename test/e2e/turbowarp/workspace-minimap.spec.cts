const {test, expect} = require('./fixtures.cts');

test('the workspace minimap follows blocks, viewport and code tab visibility', async ({page, evidence}) => {
    const minimap = page.locator('[data-workspace-minimap]');
    const paths = minimap.locator('path');
    const viewport = minimap.locator('rect');
    await page.goto('editor.html?lang=en');
    await expect(page.getByRole('button', {name: 'Add Extension', exact: true})).toBeVisible();
    await expect(minimap).toHaveCount(0);

    evidence.stage('enabled');
    await page.goto('editor.html?lang=en&twPlusWorkspaceMinimap=1&twPlusHorizontalBlockPalette=1');
    await expect(minimap).toBeVisible();
    await expect(minimap).toHaveCSS('pointer-events', 'none');
    await expect(minimap).toHaveCSS('opacity', '0.78');
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
    expect(map.x).toBeGreaterThanOrEqual(palette.x + palette.width);
    expect(map.x - palette.x - palette.width).toBeLessThan(24);
    const bottomGap = workspace.y + workspace.height - map.y - map.height;
    expect(bottomGap).toBeGreaterThan(0);
    expect(bottomGap).toBeLessThan(24);
    await expect(minimap.locator('path[transform="translate(1200 900)"]')).toHaveCount(1);
    await page.evaluate(() => window.ScratchBlocks.getMainWorkspace().getBlockById('minimap-distant').moveBy(70, 0));
    await expect(paths).toHaveCount(2);
    await expect(minimap.locator('path[transform="translate(1270 900)"]')).toHaveCount(1);

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
