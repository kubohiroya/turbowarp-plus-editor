const {test, expect} = require('./fixtures.cts');

const useLayout = async (page, name) => {
    await page.locator('.blocklyToolboxDiv .scratchCategoryId-motion').click({button: 'right'});
    await page.getByRole('menuitem', {name, exact: true}).click();
};

test('横パレットでカテゴリを切り替え、実ブロックを追加・削除できる', async ({page, evidence}) => {
    await page.goto('editor.html?lang=en&twPlusStandardLayout=0&twPlusHorizontalBlockPalette=1');
    const toolbox = page.locator('.blocklyToolboxDiv');
    const flyout = page.locator('.blocklyFlyout');
    const motion = toolbox.locator('.scratchCategoryId-motion');
    const looks = toolbox.locator('.scratchCategoryId-looks');
    const workspace = page.locator('.blocklySvg').first();
    const block = workspace.locator('> .blocklyWorkspace > .blocklyBlockCanvas > .blocklyDraggable');

    evidence.stage('switch-to-horizontal');
    await expect(flyout).toBeVisible();
    const vertical = await toolbox.boundingBox();
    await useLayout(page, 'Use horizontal palette');
    await expect(flyout).toBeHidden();
    const horizontal = await toolbox.boundingBox();
    expect(horizontal.width).toBeGreaterThan(vertical.width);
    expect(horizontal.height).toBeLessThan(vertical.height);
    expect((await motion.boundingBox()).y).toBe((await looks.boundingBox()).y);

    evidence.stage('choose-category');
    await looks.click();
    await expect(looks).toHaveAttribute('aria-expanded', 'true');
    await expect(flyout.getByText('say', {exact: true}).first()).toBeVisible();
    await expect(flyout.getByText('move', {exact: true})).toHaveCount(0);
    const panel = await flyout.boundingBox();
    expect(Math.abs(panel.y - horizontal.y - horizontal.height)).toBeLessThanOrEqual(1);
    expect(panel.height).toBeLessThan(vertical.height);
    await flyout.hover();
    await page.mouse.wheel(0, 180);
    const getScrollPosition = () => page.evaluate(() =>
        window.ScratchBlocks.getMainWorkspace().getFlyout().getScrollPos());
    await expect.poll(getScrollPosition).toBeGreaterThan(0);
    const looksScrollPosition = await getScrollPosition();

    evidence.stage('restore-category-scroll');
    await page.keyboard.press('Escape');
    await expect(flyout).toBeHidden();
    await looks.click();
    await expect.poll(getScrollPosition).toBeCloseTo(looksScrollPosition);
    await motion.click();
    await expect.poll(getScrollPosition).toBeCloseTo(0);
    await looks.click();
    await expect.poll(getScrollPosition).toBeCloseTo(looksScrollPosition);
    await page.keyboard.press('Escape');
    await expect(flyout).toBeHidden();
    await motion.focus();
    await page.keyboard.press('Enter');
    const source = flyout.locator('.blocklyDraggable').filter({has: page.getByText('move', {exact: true})});
    await expect(source).toBeVisible();

    evidence.stage('drag-and-delete');
    const from = await source.boundingBox();
    const surface = await workspace.boundingBox();
    await page.mouse.move(from.x + 12, from.y + 12);
    await page.mouse.down();
    await page.mouse.move(from.x + 12, from.y + 34, {steps: 4});
    await expect(flyout).toBeVisible();
    await page.mouse.move(surface.x + surface.width * 0.65, surface.y + 260, {steps: 16});
    await expect(flyout).toBeHidden();
    await page.mouse.up();
    await expect(block).toHaveCount(1);
    await expect(flyout).toBeHidden();

    const placed = await block.boundingBox();
    await page.mouse.move(placed.x + 12, placed.y + 12);
    await page.mouse.down();
    await page.mouse.move(horizontal.x + horizontal.width / 2, horizontal.y + horizontal.height / 2, {steps: 14});
    await expect(page.locator('[data-palette-delete-preview]')).toBeVisible();
    await page.mouse.up();
    await expect(block).toHaveCount(0);

    evidence.stage('return-to-vertical');
    await useLayout(page, 'Use vertical palette');
    await expect(flyout).toBeVisible();
    await expect(toolbox).not.toHaveAttribute('data-horizontal-block-palette');
    await expect(flyout.getByText('move', {exact: true})).toBeAttached();
    await expect(flyout.getByText('say', {exact: true}).first()).toBeAttached();
});

test('横パレットは拡張と動的カテゴリを表示し、フラグOFFで元に戻る', async ({page, evidence}) => {
    await page.goto('editor.html?lang=en&twPlusStandardLayout=0&twPlusHorizontalBlockPalette=1');
    const toolbox = page.locator('.blocklyToolboxDiv');
    const flyout = page.locator('.blocklyFlyout');
    const addExtension = page.getByRole('button', {name: 'Add Extension', exact: true});
    const verticalButton = await addExtension.boundingBox();
    await useLayout(page, 'Use horizontal palette');
    const horizontalButton = await addExtension.boundingBox();
    const categories = await toolbox.boundingBox();
    expect(Math.abs(horizontalButton.y - categories.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(horizontalButton.x + horizontalButton.width - categories.x)).toBeLessThanOrEqual(2);
    expect(horizontalButton.y).toBeLessThan(verticalButton.y);
    const divider = page.getByRole('separator', {name: 'Editor and stage column width'});
    await divider.press('Home');
    const fixedButton = await addExtension.boundingBox();
    const scroll = await toolbox.evaluate(node => {
        node.scrollLeft = node.scrollWidth;
        return node.scrollLeft;
    });
    expect(scroll).toBeGreaterThan(0);
    expect(await addExtension.boundingBox()).toEqual(fixedButton);
    await toolbox.evaluate(node => { node.scrollLeft = 0; });
    await divider.press('Enter');

    evidence.stage('dynamic-category');
    await toolbox.locator('.scratchCategoryId-variables').click();
    await expect(flyout.getByText('Make a Variable', {exact: true})).toBeVisible();
    await flyout.getByText('Make a Variable', {exact: true}).click();
    await page.getByRole('textbox').fill('palette test variable');
    await page.getByRole('button', {name: 'OK', exact: true}).click();
    await toolbox.locator('.scratchCategoryId-variables').click();
    await expect(flyout.getByText('palette test variable', {exact: true}).first()).toBeVisible();

    await toolbox.locator('.scratchCategoryId-myBlocks').click();
    await expect(flyout.getByText('Make a Block', {exact: true})).toBeVisible();

    evidence.stage('extension-category');
    await addExtension.click();
    await page.getByText('Pen', {exact: true}).click();
    const pen = toolbox.locator('.scratchCategoryId-pen');
    await pen.click();
    await expect(flyout.getByText('pen down', {exact: true})).toBeVisible();
    await page.locator('.blocklySvg').first().click({position: {x: 12, y: 430}});
    await expect(flyout).toBeHidden();

    evidence.stage('flag-off');
    await page.goto('editor.html?lang=en&twPlusStandardLayout=0&twPlusHorizontalBlockPalette=0');
    await toolbox.locator('.scratchCategoryId-motion').click({button: 'right'});
    await expect(page.getByRole('menuitem', {name: 'Use horizontal palette'})).toHaveCount(0);
    await expect(toolbox).not.toHaveAttribute('data-horizontal-block-palette');
    await expect(flyout).toBeVisible();
});
