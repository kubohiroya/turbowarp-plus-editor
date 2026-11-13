const {test, expect} = require('./fixtures.cts');

async function openLayoutMenu(page, background, label, position) {
    await background.click({button: 'right', position});
    const trigger = page.getByRole('menuitem', {name: label, exact: true});
    await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    const submenu = page.getByRole('menu', {name: label, exact: true});
    return {trigger, submenu};
}

async function expectLayoutSelection(submenu, label) {
    await expect(submenu.getByRole('menuitemradio')).toHaveCount(3);
    const checked = submenu.getByRole('menuitemradio', {checked: true});
    await expect(checked).toHaveCount(1);
    await expect(checked).toHaveText(label);
}

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
    const surface = page.locator('.tw-script-view-surface');
    const workspace = page.locator('.injectionDiv').filter({has: surface});
    const background = workspace.locator('.blocklyMainBackground');
    const backgroundPosition = {x: 255, y: 185};
    const serialPosition = {x: 175, y: 145};
    const layoutLabel = 'コードの並びの見え方を変更する';
    await edit.hover();
    await expect(workspace.locator('[data-workspace-minimap]')).toBeHidden();
    await expect(workspace.locator('.blocklyZoom')).toBeHidden();
    await workspace.hover({position: {x: 220, y: 150}});
    await expect(workspace.locator('[data-workspace-minimap]')).toBeVisible();
    await expect(workspace.locator('.blocklyZoom')).toBeVisible();
    await expect(page.locator('.tw-script-views')).toHaveCount(0);

    const block = workspace.locator('.blocklyBlockCanvas [data-id="upper-left"]');
    await block.click({button: 'right', position: {x: 25, y: 18}});
    await expect(page.locator('.blocklyWidgetDiv .blocklyContextMenu')).toBeVisible();
    await expect(page.getByRole('menuitem', {name: layoutLabel})).toHaveCount(0);
    await workspace.click({position: {x: 425, y: 360}});
    await expect(page.locator('.blocklyWidgetDiv .blocklyContextMenu')).toBeHidden();

    const normal = await openLayoutMenu(page, background, layoutLabel, backgroundPosition);
    await expect(page.getByRole('menuitem', {name: '取り消し', exact: true})).toBeVisible();
    await normal.trigger.hover();
    await expectLayoutSelection(normal.submenu, '通常配置の見え方');
    await normal.submenu.getByRole('menuitemradio', {name: 'Z配置の見え方', exact: true}).click();
    await expect.poll(() => readOrder(surface)).toEqual(zOrder);
    const scale = () => page.evaluate(() => window.ScratchBlocks.getMainWorkspace().scale);
    const beforeZoom = await scale();
    await workspace.locator('[data-plus-zoom-action="in"]').click();
    await expect.poll(scale).toBeGreaterThan(beforeZoom);

    const z = await openLayoutMenu(page, surface, layoutLabel, serialPosition);
    await z.trigger.click();
    await expectLayoutSelection(z.submenu, 'Z配置の見え方');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect.poll(() => readOrder(surface)).toEqual(nOrder);

    const n = await openLayoutMenu(page, surface, layoutLabel, serialPosition);
    await n.trigger.hover();
    await expectLayoutSelection(n.submenu, 'N配置の見え方');
    await n.submenu.getByRole('menuitemradio', {name: '通常配置の見え方', exact: true}).click();
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
    const surface = page.locator('.tw-script-view-surface');
    const editing = page.locator('.injectionDiv').filter({has: surface});
    const label = 'Change code layout view';
    await expect(inactive.locator('.tw-script-view-surface')).toHaveCount(1);
    await inactive.hover({position: {x: 90, y: 180}});
    await expect(inactive.locator('[data-dockview-costume-thumbnail] img[src]')).toBeVisible();
    const preview = await openLayoutMenu(page, inactive, label, {x: 90, y: 180});
    await preview.trigger.hover();
    await expectLayoutSelection(preview.submenu, 'Normal layout view');
    await preview.submenu.getByRole('menuitemradio', {name: 'N layout view', exact: true}).click();
    await expect(inactive.locator('.tw-script-view-surface')).toBeVisible();
    await expect(editing.locator('.tw-script-view-surface')).toBeHidden();

    await editing.hover({position: {x: 200, y: 180}});
    await expect(inactive.locator('[data-dockview-costume-thumbnail] img[src]')).toBeHidden();
    const active = await openLayoutMenu(page, editing.locator('.blocklyMainBackground'), label, {x: 210, y: 160});
    await active.trigger.hover();
    await expectLayoutSelection(active.submenu, 'Normal layout view');
    await page.keyboard.press('Escape');

    await page.getByRole('button', {name: 'Stage opening options', exact: true}).click();
    await page.getByRole('menuitem', {name: 'Show in a tab', exact: true}).click();
    await page.getByRole('tab', {name: 'Stage', exact: true}).click();
    await page.getByText('Edit', {exact: true}).click();
    await expect(page.getByRole('button', {name: 'Rearrange Code Blocks'})).toBeDisabled();
});
