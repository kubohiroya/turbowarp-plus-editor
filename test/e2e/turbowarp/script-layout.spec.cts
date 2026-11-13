const {test, expect} = require('./fixtures.cts');

test('code view order and rearrangement preview preserve script connections and support undo', async ({page}) => {
    await page.goto('editor.html?lang=ja');
    await page.waitForFunction(() => window.vm?.editingTarget && window.ScratchBlocks?.getMainWorkspace());
    const roots = [
        {id: 'upper-right', x: 420, y: 80},
        {id: 'lower-left', x: 80, y: 270},
        {id: 'lower-right', x: 420, y: 270},
        {id: 'upper-left', x: 80, y: 90}
    ];
    await page.evaluate(roots => {
        const target = window.vm.editingTarget;
        for (const root of roots) {
            target.blocks.createBlock({...root, opcode: 'event_whenflagclicked', topLevel: true,
                parent: null, next: root.id === 'upper-left' ? 'child' : null, shadow: false, fields: {}, inputs: {}});
        }
        target.blocks.createBlock({id: 'child', opcode: 'looks_show', topLevel: false, parent: 'upper-left',
            next: null, shadow: false, fields: {}, inputs: {}});
        window.vm.refreshWorkspace();
    }, roots);

    const original = roots.map(({x, y}) => [x, y]);
    const positions = () => page.evaluate(roots => roots.map(({id}) => {
        const {x, y} = window.vm.editingTarget.blocks.getBlock(id);
        return [x, y];
    }), roots);
    const readOrder = locator => locator.locator('[data-script-view-block]').evaluateAll(
        nodes => nodes.map(node => node.getAttribute('data-script-view-block')));
    const zOrder = ['upper-left', 'upper-right', 'lower-left', 'lower-right'];
    const nOrder = ['upper-left', 'lower-left', 'upper-right', 'lower-right'];
    const edit = page.getByText('編集', {exact: true});
    const viewBar = page.locator('.tw-script-views');
    const workspace = page.locator('.injectionDiv').filter({has: viewBar});
    await edit.hover();
    await expect(viewBar).toBeHidden();
    await expect(workspace.locator('[data-workspace-minimap]')).toBeHidden();
    await expect(workspace.locator('.blocklyZoom')).toBeHidden();
    await workspace.hover({position: {x: 220, y: 150}});
    await expect(workspace.locator('[data-workspace-minimap]')).toBeVisible();
    await expect(workspace.locator('.blocklyZoom')).toBeVisible();
    const free = viewBar.getByRole('button', {name: '自由配置ビュー'});
    await expect(free).toHaveAttribute('aria-pressed', 'true');
    const surface = workspace.locator('.tw-script-view-surface');
    await viewBar.getByRole('button', {name: 'Z直列ビュー'}).click();
    await expect.poll(() => readOrder(surface)).toEqual(zOrder);
    const scale = () => page.evaluate(() => window.ScratchBlocks.getMainWorkspace().scale);
    const beforeZoom = await scale();
    await workspace.locator('[data-plus-zoom-action="in"]').click();
    await expect.poll(scale).toBeGreaterThan(beforeZoom);
    const nView = viewBar.getByRole('button', {name: 'N直列ビュー'});
    await expect(nView.locator('span')).toHaveCSS('transform', 'matrix(1, 0, 0, -1, 0, 0)');
    await nView.click();
    await expect.poll(() => readOrder(surface)).toEqual(nOrder);
    await free.click();
    await expect(surface).toBeHidden();
    expect(await positions()).toEqual(original);

    const rearrange = page.getByRole('button', {name: 'コードブロックの再配置'});
    await edit.click();
    await expect(rearrange).toBeEnabled();
    await rearrange.click();
    const dialog = page.getByRole('dialog', {name: 'コードブロックの再配置'});
    const preview = dialog.locator('.tw-script-layout-preview');
    await expect.poll(() => readOrder(preview)).toEqual(zOrder);
    await dialog.getByLabel('方向').selectOption('horizontal');
    await expect.poll(() => readOrder(preview)).toEqual(zOrder);
    await dialog.getByLabel('方向').selectOption('vertical');
    await dialog.getByLabel('順序').selectOption('n');
    await expect.poll(() => readOrder(preview)).toEqual(nOrder);
    await dialog.getByLabel('方向').selectOption('horizontal');
    await expect.poll(() => readOrder(preview)).toEqual(nOrder);
    await dialog.getByRole('button', {name: 'キャンセル'}).click();
    expect(await positions()).toEqual(original);

    await edit.click();
    await rearrange.click();
    await dialog.getByLabel('順序').selectOption('n');
    await dialog.getByLabel('方向').selectOption('horizontal');
    const previewPositions = await preview.locator('[data-script-view-block]').evaluateAll(nodes =>
        Object.fromEntries(nodes.map(node => [
            node.getAttribute('data-script-view-block'),
            node.getAttribute('transform').match(/-?\d+(?:\.\d+)?/g).map(Number)
        ])));
    await dialog.getByRole('button', {name: '再配置する'}).click();
    await expect(dialog).toBeHidden();
    const moved = roots.map(({id}) => previewPositions[id]);
    await expect.poll(positions).toEqual(moved);
    expect(await page.evaluate(() => window.vm.editingTarget.blocks.getBlock('upper-left').next)).toBe('child');
    await edit.click();
    await page.getByRole('button', {name: '元に戻す', exact: true}).click();
    await expect.poll(positions).toEqual(original);
    await edit.click();
    await page.getByRole('button', {name: '繰り返し', exact: true}).click();
    await expect.poll(positions).toEqual(moved);

    await page.getByRole('tab', {name: 'コスチューム', exact: true}).click();
    await edit.click();
    await expect(rearrange).toBeDisabled();
    await edit.click();
    await page.getByRole('tab', {name: '音', exact: true}).click();
    await edit.click();
    await expect(rearrange).toBeDisabled();
});

test('the hovered code panel owns its controls in a split editor', async ({page}) => {
    await page.goto('editor.html?lang=en');
    const layout = page.getByRole('button', {name: 'Editor panel layout', exact: true});
    await layout.click();
    await page.getByRole('menuitem', {name: 'Split right', exact: true}).click();
    const inactive = page.locator('[data-code-preview]');
    const editing = page.locator('.injectionDiv').filter({has: page.locator(':scope > .tw-script-views')});
    await expect(inactive).toHaveCount(1);
    const inactiveBar = inactive.locator('.tw-script-views');
    const editingBar = editing.locator('.tw-script-views');
    await inactive.hover({position: {x: 90, y: 180}});
    await expect(inactiveBar.getByRole('button', {name: 'Free layout view'})).toHaveAttribute('aria-pressed', 'true');
    await expect(inactive.locator('[data-dockview-costume-thumbnail] img[src]')).toBeVisible();
    await expect(editingBar).toBeHidden();
    await inactiveBar.getByRole('button', {name: 'N serial view'}).click();
    await expect(inactiveBar.getByRole('button', {name: 'N serial view'})).toHaveAttribute('aria-pressed', 'true');
    await editing.hover({position: {x: 90, y: 180}});
    await expect(editingBar).toBeVisible();
    await expect(inactiveBar).toBeHidden();
    await expect(inactive.locator('[data-dockview-costume-thumbnail] img[src]')).toBeHidden();

    await page.getByRole('button', {name: 'Stage opening options', exact: true}).click();
    await page.getByRole('menuitem', {name: 'Show in a tab', exact: true}).click();
    await page.getByRole('tab', {name: 'Stage', exact: true}).click();
    await page.getByText('Edit', {exact: true}).click();
    await expect(page.getByRole('button', {name: 'Rearrange Code Blocks'})).toBeDisabled();
});
