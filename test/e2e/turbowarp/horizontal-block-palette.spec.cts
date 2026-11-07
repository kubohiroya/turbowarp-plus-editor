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
    const preview = page.locator('[data-palette-delete-preview]');

    evidence.stage('switch-to-horizontal');
    await expect(flyout).toBeVisible();
    const vertical = await toolbox.boundingBox();
    await useLayout(page, 'Use horizontal palette');
    await expect(flyout).toBeHidden();
    const horizontal = await toolbox.boundingBox();
    const moveToPalette = () => page.mouse.move(horizontal.x + horizontal.width / 2,
        horizontal.y + horizontal.height / 2, {steps: 14});
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
    await moveToPalette();
    await expect(preview).toBeVisible();
    await page.mouse.up();
    await expect(block).toHaveCount(0);

    evidence.stage('return-to-palette');
    await motion.click();
    await expect(source).toBeVisible();
    const next = await source.boundingBox();
    await page.mouse.move(next.x + 12, next.y + 12);
    await page.mouse.down();
    await page.mouse.move(surface.x + surface.width * 0.65, surface.y + 260, {steps: 16});
    await expect(flyout).toBeHidden();
    await expect(preview).toHaveCount(0);
    await moveToPalette();
    await expect(preview).toBeVisible();
    await page.mouse.up();
    await expect(preview).toHaveCount(0);
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
    const search = page.getByRole('searchbox', {name: 'Search blocks'});
    await search.fill('set');
    await expect(flyout.getByText('set', {exact: true})).toBeVisible();
    await expect(flyout.getByText('change', {exact: true})).toHaveCount(0);

    await toolbox.locator('.scratchCategoryId-myBlocks').click();
    await expect(search).toHaveValue('');
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

test('横パレットの見出しとラベルを検索し、絞り込んだブロックを追加できる', async ({page}) => {
    await page.addInitScript(() => {
        localStorage.setItem('tw:addons', JSON.stringify({
            _: 5, 'hide-flyout': {enabled: true, toggle: 'cathover', speed: 'none'}
        }));
    });
    await page.goto('editor.html?lang=ja');
    const motion = page.locator('[data-horizontal-block-palette] .scratchCategoryId-motion');
    const flyout = page.locator('.blocklyFlyout');
    const search = page.getByRole('searchbox', {name: 'ブロックを検索'});
    const blocks = flyout.locator('.blocklyBlockCanvas > .blocklyDraggable');
    const workspace = page.locator('.blocklySvg').first();
    const placed = workspace.locator('> .blocklyWorkspace > .blocklyBlockCanvas > .blocklyDraggable');

    await motion.click();
    await expect(search).toBeVisible();
    const fullCount = await blocks.count();
    expect(fullCount).toBeGreaterThan(1);
    const input = await search.boundingBox();
    const pin = await flyout.locator('.sa-lock-button').boundingBox();
    expect(input.x + input.width).toBeLessThan(pin.x);

    await search.fill('動');
    await expect(blocks).toHaveCount(fullCount);
    await search.fill('表示にない語句');
    await expect(blocks).toHaveCount(0);
    await expect(flyout.getByText('一致するブロックがありません', {exact: true})).toBeVisible();
    await search.clear();
    await expect(blocks).toHaveCount(fullCount);

    await search.evaluate(element => {
        element.value = '歩動';
        element.dispatchEvent(new InputEvent('input', {bubbles: true, isComposing: true}));
    });
    await expect(blocks).toHaveCount(fullCount);
    await search.dispatchEvent('compositionend');
    await expect(blocks).toHaveCount(1);
    await expect(search).toBeFocused();
    await expect(blocks.getByText('歩動かす', {exact: true})).toBeVisible();

    const source = await blocks.boundingBox();
    const surface = await workspace.boundingBox();
    await page.mouse.move(source.x + 12, source.y + 12);
    await page.mouse.down();
    await page.mouse.move(surface.x + surface.width * 0.65, surface.y + 260, {steps: 16});
    await page.mouse.up();
    await expect(placed).toHaveCount(1);
    await expect(search).toBeHidden();
});

test('既定のファイルメニュー構成で横パレットのピンと縦パレットの自動非表示が動く', async ({page}) => {
    await page.emulateMedia({colorScheme: 'light'});
    await page.addInitScript(() => {
        localStorage.setItem('tw:addons', JSON.stringify({
            _: 5,
            'hide-flyout': {enabled: true, toggle: 'cathover', speed: 'none'}
        }));
    });
    await page.goto('editor.html?lang=en&twPlusHorizontalBlockPalette=1');
    await expect(page.getByRole('button', {name: 'Add Extension', exact: true})).toHaveCount(0);
    const toolbox = page.locator('.blocklyToolboxDiv');
    const control = toolbox.locator('.scratchCategoryId-control');
    const flyout = page.locator('.blocklyFlyout');
    const scrollbar = page.locator('.blocklyFlyoutScrollbar');
    const handle = page.locator('[data-palette-resize-handle]');
    const lock = flyout.locator('.sa-lock-object');
    const pinButton = lock.locator('button');
    const pinMask = () => pinButton.evaluate(button => getComputedStyle(button, '::before').maskImage);
    const unpinnedColor = 'rgba(128, 128, 128, 0.88)';
    const workspace = page.locator('.blocklySvg').first();
    const outside = {x: 12, y: 430};
    const clickOutside = () => workspace.click({position: outside});
    const moveOutside = async () => {
        const {x, y} = await workspace.boundingBox();
        await page.mouse.move(x + outside.x, y + outside.y, {steps: 12});
    };
    const expectPinAppearance = async (color, border = 'rgba(0, 0, 0, 0)') => {
        await expect(pinButton).toHaveCSS('color', color);
        await expect(pinButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(pinButton).toHaveCSS('border-top-color', border);
        await expect(pinButton).toHaveCSS('filter', 'none');
    };
    const expectPinInCorner = async () => {
        await expect(pinButton).toBeVisible();
        const panel = await flyout.boundingBox();
        const button = await pinButton.boundingBox();
        expect(Math.abs(panel.x + panel.width - button.x - button.width - 15)).toBeLessThanOrEqual(1);
        expect(Math.abs(button.y - panel.y - 3)).toBeLessThanOrEqual(1);
    };

    await expect(toolbox).toHaveAttribute('data-horizontal-block-palette', '');
    await expect(lock).toBeAttached();
    await control.click();
    await expect(control).toHaveAttribute('aria-expanded', 'true');
    await expect(handle).toBeVisible();
    await expect(scrollbar).toBeVisible();
    const panelBox = await flyout.boundingBox();
    const scrollbarBox = await scrollbar.boundingBox();
    const handleBox = await handle.boundingBox();
    const {x, y, width} = await control.boundingBox();

    await page.mouse.move(x + width / 2, y - 5);
    expect(await flyout.boundingBox()).toEqual(panelBox);
    expect(await scrollbar.boundingBox()).toEqual(scrollbarBox);
    expect(await handle.boundingBox()).toEqual(handleBox);
    await control.hover();
    expect(await flyout.boundingBox()).toEqual(panelBox);
    await expectPinInCorner();
    await expect(pinButton.locator('img')).toBeHidden();
    const unpinnedMask = await pinMask();
    expect(unpinnedMask).toMatch(/^url\(/);
    await expectPinAppearance(unpinnedColor);

    for (const delta of [60, -90]) {
        const {width: oldWidth} = await flyout.boundingBox();
        const grip = await handle.boundingBox();
        const startX = grip.x + grip.width / 2;
        const startY = grip.y + grip.height / 2;
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + delta, startY, {steps: 6});
        expect((await flyout.boundingBox()).width).toBeCloseTo(oldWidth + delta);
        await expectPinInCorner();
        await page.mouse.up();
        await expectPinInCorner();
    }
    await pinButton.click();
    await expect(lock).toHaveClass(/\blocked\b/);
    const pinnedMask = await pinMask();
    expect(pinnedMask).toMatch(/^url\(/);
    expect(pinnedMask).not.toBe(unpinnedMask);
    await expectPinAppearance('rgb(64, 64, 64)', 'rgb(64, 64, 64)');
    await moveOutside();
    expect(await control.getAttribute('aria-expanded')).toBe('true');
    await clickOutside();
    expect(await control.getAttribute('aria-expanded')).toBe('true');
    await expect(flyout).toBeVisible();
    await expect(handle).toBeVisible();

    const source = flyout.locator('.blocklyDraggable').filter({has: page.getByText('wait', {exact: true})}).first();
    await expect(source).toBeVisible();
    const from = await source.boundingBox();
    await page.mouse.move(from.x + 12, from.y + 12);
    await page.mouse.down();
    try {
        await moveOutside();
        expect(await control.getAttribute('aria-expanded')).toBe('true');
    } finally {
        await page.mouse.up();
    }
    await expect(workspace.locator('> .blocklyWorkspace > .blocklyBlockCanvas > .blocklyDraggable')).toHaveCount(1);
    await expect(flyout).toBeVisible();

    await pinButton.click();
    await expect(lock).not.toHaveClass(/\blocked\b/);
    expect(await pinMask()).toBe(unpinnedMask);
    await expectPinAppearance(unpinnedColor);

    await clickOutside();
    await expect(control).toHaveAttribute('aria-expanded', 'false');
    await expect(flyout).toBeHidden();
    await expect(handle).toBeHidden();

    await page.getByText('Settings', {exact: true}).click();
    await page.getByText('Switch To Dark Mode', {exact: true}).click();
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
    await control.click();
    await expectPinAppearance(unpinnedColor);
    await pinButton.click();
    await expectPinAppearance('rgb(212, 212, 212)', 'rgb(212, 212, 212)');
    await pinButton.click();
    await expectPinAppearance(unpinnedColor);

    await page.keyboard.press('Escape');
    await expect(flyout).toBeHidden();
    await expect(handle).toBeHidden();
    await useLayout(page, 'Use vertical palette');
    await expect(lock).toBeVisible();
    await expect(pinButton.locator('img')).toBeVisible();
    await toolbox.hover();
    const verticalX = (await flyout.boundingBox()).x;
    await page.mouse.move(1, 1);
    await expect.poll(async () => (await flyout.boundingBox()).x).toBeLessThan(verticalX);
    await toolbox.hover();
    await expect.poll(async () => (await flyout.boundingBox()).x).toBeCloseTo(verticalX);
});

test('横パレットの小窓を編集領域内でリサイズし、カテゴリ別に復元する', async ({page, evidence}) => {
    await page.goto('editor.html?lang=en');
    const toolbox = page.locator('.blocklyToolboxDiv');
    const motion = toolbox.locator('.scratchCategoryId-motion');
    const looks = toolbox.locator('.scratchCategoryId-looks');
    const surface = page.locator('.blocklySvg').first();
    const flyout = page.locator('.blocklyFlyout');
    const handle = page.locator('[data-palette-resize-handle]');
    const viewport = page.viewportSize();
    const size = async () => {
        const {width, height} = await flyout.boundingBox();
        return {width, height};
    };
    const sizeDifference = async expected => {
        const actual = await size();
        return Math.max(Math.abs(actual.width - expected.width), Math.abs(actual.height - expected.height));
    };
    const dragHandle = async (dx, dy) => {
        const {x, y, width, height} = await handle.boundingBox();
        const startX = x + width / 2;
        const startY = y + height / 2;
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + dx, startY + dy, {steps: 8});
        await expect(flyout).toBeVisible();
        await page.mouse.up();
    };
    const fitsSurface = async () => {
        const box = await flyout.boundingBox();
        const editor = await surface.boundingBox();
        const menu = await toolbox.boundingBox();
        const view = page.viewportSize();
        return box.x >= Math.max(0, editor.x) - 1 && box.y >= Math.max(0, editor.y) - 1 &&
            box.x + box.width <= Math.min(view.width, editor.x + editor.width, menu.x + menu.width) + 1 &&
            box.y + box.height <= Math.min(view.height, editor.y + editor.height) + 1;
    };

    evidence.stage('resize-and-switch-category');
    await expect(toolbox).toHaveAttribute('data-horizontal-block-palette', '');
    await expect(handle).toBeHidden();
    await motion.click();
    await expect(handle).toBeVisible();
    const initial = await size();
    await dragHandle(44, 56);
    const motionSize = await size();
    expect(motionSize.width).toBeCloseTo(initial.width + 44);
    expect(motionSize.height).toBeCloseTo(initial.height + 56);
    await looks.click();
    expect(await size()).toEqual(initial);
    await dragHandle(-40, -50);
    const looksSize = await size();
    expect(looksSize.width).toBeCloseTo(initial.width - 40);
    expect(looksSize.height).toBeCloseTo(initial.height - 50);
    await motion.click();
    expect(await size()).toEqual(motionSize);

    evidence.stage('reload-saved-sizes');
    await page.reload();
    await expect(toolbox).toHaveAttribute('data-horizontal-block-palette', '');
    await looks.click();
    expect(await size()).toEqual(looksSize);
    await motion.click();
    expect(await size()).toEqual(motionSize);

    evidence.stage('clamp-to-visible-editor');
    const corner = await handle.boundingBox();
    await dragHandle(viewport.width - corner.x - corner.width / 2 - 1,
        viewport.height - corner.y - corner.height / 2 - 1);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tw-plus-palette-size:motion')));
    await expect.poll(() => sizeDifference(saved)).toBeLessThanOrEqual(1);
    const largest = await size();
    expect(largest.width).toBeGreaterThan(motionSize.width);
    expect(largest.height).toBeGreaterThan(motionSize.height);
    expect(await fitsSurface()).toBe(true);
    await page.setViewportSize({width: 900, height: 510});
    await expect.poll(fitsSurface).toBe(true);
    await expect.poll(async () => (await size()).height).toBeLessThan(largest.height);
    await page.keyboard.press('Escape');
    await expect(handle).toBeHidden();
    await motion.click();
    expect(await fitsSurface()).toBe(true);
    await page.setViewportSize(viewport);
    await expect.poll(() => sizeDifference(saved)).toBeLessThanOrEqual(1);
});

for (const horizontal of [false, true]) {
    test(`長押しでカテゴリを並べ替え、パレット外へのドロップで取り消す (${horizontal ? '横' : '縦'})`,
        async ({page, evidence}) => {
            await page.goto('editor.html?lang=en&twPlusStandardLayout=0&twPlusHorizontalBlockPalette=1');
            const toolbox = page.locator('.blocklyToolboxDiv');
            const motion = toolbox.locator('.scratchCategoryId-motion');
            const looks = toolbox.locator('.scratchCategoryId-looks');
            const sound = toolbox.locator('.scratchCategoryId-sound');
            const preview = page.locator('[data-palette-reorder-preview]');
            const order = () => toolbox.locator('.scratchCategoryMenuItemLabel').allTextContents();
            const moveTo = async locator => {
                const {x, y, width, height} = await locator.boundingBox();
                await page.mouse.move(x + width / 2, y + height / 2, {steps: 5});
                return {x, y, width, height};
            };

            await expect(sound).toBeVisible();
            if (horizontal) await useLayout(page, 'Use horizontal palette');
            const initial = await order();

            evidence.stage('reorder-categories');
            const start = await moveTo(motion);
            await page.mouse.down();
            await expect(motion).toHaveAttribute('data-palette-reorder-source', '');
            await expect(preview).toHaveText('Motion');
            await expect(preview).toHaveCSS('opacity', '0.65');
            expect(await preview.boundingBox()).toEqual(start);
            const destination = await moveTo(sound);
            await expect(sound).toHaveAttribute('data-palette-reorder-target', '');
            const moved = await preview.boundingBox();
            expect(moved.x + moved.width / 2).toBeCloseTo(destination.x + destination.width / 2);
            expect(moved.y + moved.height / 2).toBeCloseTo(destination.y + destination.height / 2);
            await page.mouse.up();
            await expect(preview).toHaveCount(0);
            await expect(toolbox).not.toHaveAttribute('data-palette-reordering');
            const expected = ['Looks', 'Sound', 'Motion', ...initial.slice(3)];
            expect(await order()).toEqual(expected);

            // Switch layout and rebuild the toolbox to check the order lives beyond the current DOM.
            await useLayout(page, horizontal ? 'Use vertical palette' : 'Use horizontal palette');
            await useLayout(page, horizontal ? 'Use horizontal palette' : 'Use vertical palette');
            await page.evaluate(() => {
                const workspace = window.ScratchBlocks.getMainWorkspace();
                workspace.updateToolbox(workspace.options.languageTree);
            });
            await expect.poll(order).toEqual(expected);

            evidence.stage('cancel-outside');
            await moveTo(looks);
            await page.mouse.down();
            await expect(looks).toHaveAttribute('data-palette-reorder-source', '');
            await moveTo(motion);
            await expect(motion).toHaveAttribute('data-palette-reorder-target', '');
            await page.mouse.move(500, 350, {steps: 6});
            await expect(preview).toBeInViewport();
            const outside = await preview.boundingBox();
            expect(outside.x + outside.width / 2).toBeCloseTo(500);
            expect(outside.y + outside.height / 2).toBeCloseTo(350);
            await page.mouse.up();
            await expect(preview).toHaveCount(0);
            await expect(toolbox).not.toHaveAttribute('data-palette-reordering');
            expect(await order()).toEqual(expected);

            await moveTo(looks);
            await page.mouse.down();
            await expect(preview).toHaveText('Looks');
            await page.keyboard.press('Escape');
            await expect(preview).toHaveCount(0);
            await page.mouse.up();
            expect(await order()).toEqual(expected);

            await looks.click();
            if (horizontal) await expect(looks).toHaveAttribute('aria-expanded', 'true');
            else await expect(looks).toHaveClass(/categorySelected/);
        });
}

test('カテゴリの並べ替えを無効にしても短押しで選択できる', async ({page}) => {
    await page.goto('editor.html?lang=en&twPlusPaletteCategoryReorder=0');
    const toolbox = page.locator('.blocklyToolboxDiv');
    const looks = toolbox.locator('.scratchCategoryId-looks');
    await expect(toolbox).toHaveAttribute('data-horizontal-block-palette', '');
    await looks.click({delay: 600});
    await expect(toolbox).not.toHaveAttribute('data-palette-reordering');
    await expect(looks).toHaveAttribute('aria-expanded', 'true');
});

test.describe('タッチ操作', () => {
    test.use({hasTouch: true});

    test('長押しでカテゴリを先頭に移動できる', async ({page}) => {
        await page.goto('editor.html?lang=en');
        const toolbox = page.locator('.blocklyToolboxDiv');
        const motion = toolbox.locator('.scratchCategoryId-motion');
        const looks = toolbox.locator('.scratchCategoryId-looks');
        await expect(toolbox).toHaveAttribute('data-horizontal-block-palette', '');
        const touchPoint = async locator => {
            const {x, y, width, height} = await locator.boundingBox();
            return {x: x + width / 2, y: y + height / 2};
        };
        const session = await page.context().newCDPSession(page);
        await session.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [await touchPoint(looks)]});
        await expect(looks).toHaveAttribute('data-palette-reorder-source', '');
        await session.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [await touchPoint(motion)]});
        await expect(motion).toHaveAttribute('data-palette-reorder-target', '');
        await session.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
        await expect(toolbox.locator('.scratchCategoryMenuItemLabel').first()).toHaveText('Looks');
        await expect(toolbox).not.toHaveAttribute('data-palette-reordering');
        await expect(page.locator('.blocklyFlyout')).toBeHidden();
        await looks.tap();
        await expect(looks).toHaveAttribute('aria-expanded', 'true');
    });
});
