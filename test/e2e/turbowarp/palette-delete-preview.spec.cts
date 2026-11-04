const {test, expect} = require('./fixtures.cts');

for (const enabled of [true, false]) {
    test(`パレットへのドロップでブロックを削除できる（削除予告 ${enabled ? 'ON' : '既定OFF'}）`, async ({page, evidence}) => {
        evidence.stage('palette-to-workspace');
        await page.goto(`editor.html?lang=en&twPlusStandardLayout=0${enabled ? '&twPlusPaletteDeletePreview=1' : ''}`);
        const flyout = page.locator('.blocklyFlyout');
        const source = flyout.locator('.blocklyDraggable').filter({has: page.getByText('move', {exact: true})});
        const block = page.locator('.blocklySvg > .blocklyWorkspace > .blocklyBlockCanvas > .blocklyDraggable');
        const preview = page.locator('[data-palette-delete-preview]');
        await source.hover();
        const from = await source.boundingBox();
        const palette = await flyout.locator('.blocklyFlyoutBackground').boundingBox();
        const workspace = await page.locator('.blocklySvg').first().boundingBox();
        const inPalette = {x: palette.x + palette.width / 2, y: palette.y + palette.height / 2};
        const inWorkspace = {x: workspace.x + workspace.width * 0.75, y: workspace.y + 170};
        const move = point => page.mouse.move(point.x, point.y, {steps: 12});
        const startFromWorkspace = async () => {
            const bounds = await block.boundingBox();
            await page.mouse.move(bounds.x + 12, bounds.y + 12);
            await page.mouse.down();
        };

        await page.mouse.move(from.x + 12, from.y + 12);
        await page.mouse.down();
        await move(inWorkspace);
        await move(inPalette);
        await expect(preview).toHaveCount(0);
        await move(inWorkspace);
        await page.mouse.up();
        await expect(block).toHaveCount(1);

        evidence.stage('workspace-to-palette');
        await startFromWorkspace();
        await move(inPalette);
        await expect(preview).toHaveCount(enabled ? 1 : 0);
        if (enabled) {
            await expect(preview).toHaveCSS('backdrop-filter', 'blur(4px)');
            await expect(preview).toHaveCSS('pointer-events', 'none');
            expect(await preview.evaluate(element => getComputedStyle(element, '::before').backgroundImage))
                .toMatch(/url\(/);
            await move(inWorkspace);
            await expect(preview).toHaveCount(0);
            await move(inPalette);
            await expect(preview).toHaveCount(1);
        }
        await page.mouse.up();
        await expect(preview).toHaveCount(0);
        await expect(block).toHaveCount(0);

        evidence.stage('undo-deletion');
        await page.evaluate(() => window.ScratchBlocks.getMainWorkspace().undo(false));
        await expect(block).toHaveCount(1);
        if (enabled) {
            evidence.stage('non-deletable-block');
            await page.evaluate(() => window.ScratchBlocks.getMainWorkspace().getTopBlocks()[0].setDeletable(false));
            await startFromWorkspace();
            await move(inPalette);
            await expect(preview).toHaveCount(0);
            await move(inWorkspace);
            await page.mouse.up();
            await page.evaluate(() => window.ScratchBlocks.getMainWorkspace().getTopBlocks()[0].setDeletable(true));

            evidence.stage('cancel-gesture');
            await startFromWorkspace();
            await move(inPalette);
            await expect(preview).toHaveCount(1);
            await page.evaluate(() => window.ScratchBlocks.getMainWorkspace().cancelCurrentGesture());
            await expect(preview).toHaveCount(0);
            await page.mouse.up();
        }
    });
}
