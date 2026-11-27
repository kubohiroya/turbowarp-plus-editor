const {test, expect} = require('./fixtures.cts');
const {fixture, installFixtures, row, form, selection, saveSB3, reopenSB3} = require('./catalog.cts');

const alternative = fixture('palettealternative', 'embedded-file', ['variables', 'lists']);
const variableOnly = fixture('palettevariables', 'embedded-file', ['variables']);
const plain = fixture('paletteordinary', 'embedded-file');
const extensions = [alternative, variableOnly, plain];

const offer = page => page.locator('.tw-palette-replacement-dialog');
const group = (dialog, id) => dialog.locator(`[data-group="${id}"] input[type=checkbox]`);
const confirm = dialog => dialog.getByRole('button', {name: '確定', exact: true}).click();

async function expectNoOffer(page) {
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(offer(page)).toHaveCount(0);
}

async function openPaletteMenu(page) {
    const menu = page.locator('.tw-palette-menu-button:visible').first();
    if (!(await menu.isVisible())) {
        await page.locator('.injectionDiv:visible').first().hover({position: {x: 200, y: 150}});
    }
    await menu.click();
}

async function settings(page) {
    await openPaletteMenu(page);
    await page.getByText('ブロックグループの表示・非表示の設定', {exact: true}).click();
    return page.getByRole('dialog', {name: 'パレット内のブロックグループの表示・非表示の設定'});
}

async function add(page, extension) {
    await openPaletteMenu(page);
    await page.getByText('機能拡張を追加', {exact: true}).click();
    await page.getByText('TurboWarp Plus', {exact: true}).click();
    await expect(selection(page).locator('.twextsec-row')).toHaveCount(extensions.length);
    await row(page, extension).getByRole('checkbox').check();
    await form(page, extension).check();
    await selection(page).getByRole('button', {name: '追加', exact: true}).click();
    await expect(selection(page)).toHaveCount(0);
    await expect.poll(() => page.evaluate(id => vm.extensionManager.isExtensionLoaded(id), extension.id)).toBe(true);
}

const selectStage = (page, stage) => page.evaluate(stage => {
    const target = vm.runtime.targets.find(target => target.isStage === stage);
    vm.setEditingTarget(target.id);
}, stage);

const projectData = page => page.evaluate(() => {
    const project = JSON.parse(vm.toJSON());
    const stage = project.targets.find(target => target.isStage);
    const sprite = project.targets.find(target => !target.isStage);
    return {
        variable: stage.variables.palettevar,
        list: stage.lists.palettelist,
        block: Object.values(sprite.blocks as Record<string, {opcode?: string}>).find(block => block.opcode === 'data_setvariableto'),
        monitor: project.monitors.find(monitor => monitor.id === 'palettevar')?.visible
    };
});

test('replacement offers change only the active palette and never appear while reopening a project', async ({page, context}) => {
    await installFixtures(context, extensions);
    await context.addInitScript(() => {
        delete (window as any).showSaveFilePicker;
        delete (window as any).showOpenFilePicker;
    });
    await page.goto('editor.html?lang=ja&twPlusStandardLayout=1');
    await page.waitForFunction(() => window.vm?.editingTarget && window.ScratchBlocks?.getMainWorkspace());
    await selectStage(page, false);
    await add(page, plain);
    await expectNoOffer(page);
    await add(page, alternative);
    await expect(offer(page)).toHaveAccessibleName('標準の変数・リストを隠しますか？');
    await offer(page).getByRole('button', {name: '表示したまま'}).click();
    await add(page, variableOnly);
    await expect(offer(page)).toHaveAccessibleName('標準の変数を隠しますか？');
    await offer(page).getByRole('button', {name: '表示したまま'}).click();

    await page.evaluate(() => {
        const stage = vm.runtime.getTargetForStage();
        stage.createVariable('palettevar', 'Palette fixture', '');
        stage.variables.palettevar.value = 27;
        stage.createVariable('palettelist', 'Palette fixture list', 'list');
        stage.variables.palettelist.value = ['hello'];
        const fields = {VARIABLE: {name: 'VARIABLE', id: 'palettevar', value: 'Palette fixture'}};
        vm.editingTarget.blocks.createBlock({id: 'paletteblock', opcode: 'data_setvariableto', fields,
            inputs: {}, parent: null, next: null, shadow: false, topLevel: true, x: 200, y: 100});
        const monitors = vm.runtime.monitorBlocks;
        monitors.createBlock({id: 'palettevar', opcode: 'data_variable', fields, inputs: {}, topLevel: true, shadow: false});
        monitors.changeBlock({id: 'palettevar', element: 'checkbox', value: true});
        vm.emitWorkspaceUpdate();
    });
    const before = await projectData(page);
    expect(before.variable).toEqual(['Palette fixture', 27]);
    expect(before.list).toEqual(['Palette fixture list', ['hello']]);
    expect(before.block).toBeTruthy();
    expect(before.monitor).toBe(true);

    let dialog = await settings(page);
    await expect(group(dialog, 'variables')).toBeChecked();
    await expect(group(dialog, 'lists')).toBeChecked();
    await group(dialog, alternative.id).uncheck();
    await confirm(dialog);

    dialog = await settings(page);
    await group(dialog, alternative.id).check();
    await confirm(dialog);
    await expect(offer(page)).toHaveAccessibleName('標準の変数・リストを隠しますか？');
    await offer(page).getByRole('button', {name: '隠す', exact: true}).click();
    dialog = await settings(page);
    await expect(group(dialog, alternative.id)).toBeChecked();
    await expect(group(dialog, 'variables')).not.toBeChecked();
    await expect(group(dialog, 'lists')).not.toBeChecked();
    await dialog.getByRole('button', {name: 'キャンセル', exact: true}).click();
    expect(await projectData(page)).toEqual(before);
    await expect.poll(() => page.evaluate(() => window.ScratchBlocks.getMainWorkspace().getAllBlocks(false)
        .some(block => block.type === 'data_setvariableto' && block.isMovable()))).toBe(true);

    dialog = await settings(page);
    await group(dialog, variableOnly.id).uncheck();
    await confirm(dialog);
    dialog = await settings(page);
    await group(dialog, variableOnly.id).check();
    await confirm(dialog);
    await expectNoOffer(page);
    await selectStage(page, true);
    dialog = await settings(page);
    await expect(group(dialog, 'variables')).toBeChecked();
    await expect(group(dialog, 'lists')).toBeChecked();
    await group(dialog, variableOnly.id).uncheck();
    await confirm(dialog);
    dialog = await settings(page);
    await group(dialog, variableOnly.id).check();
    await confirm(dialog);
    await expect(offer(page)).toHaveAccessibleName('標準の変数を隠しますか？');
    await expect(offer(page)).toContainText('ステージ');
    await offer(page).getByRole('button', {name: '隠す', exact: true}).click();
    dialog = await settings(page);
    await expect(group(dialog, 'variables')).not.toBeChecked();
    await expect(group(dialog, 'lists')).toBeChecked();
    await dialog.getByRole('button', {name: 'キャンセル', exact: true}).click();

    const reopened = await reopenSB3(page, await saveSB3(page));
    await expect.poll(() => reopened.evaluate(id => window.vm?.extensionManager.isExtensionLoaded(id), alternative.id)).toBe(true);
    await expectNoOffer(reopened);
    await selectStage(reopened, false);
    dialog = await settings(reopened);
    await expect(group(dialog, 'variables')).not.toBeChecked();
    await expect(group(dialog, 'lists')).not.toBeChecked();
    await group(dialog, 'variables').check();
    await group(dialog, 'lists').check();
    await confirm(dialog);
    await expectNoOffer(reopened);
    await selectStage(reopened, true);
    dialog = await settings(reopened);
    await expect(group(dialog, 'variables')).not.toBeChecked();
    await expect(group(dialog, 'lists')).toBeChecked();
    await dialog.getByRole('button', {name: 'キャンセル', exact: true}).click();
    expect(await projectData(reopened)).toEqual(before);
});


test('classic layout offers replacement after adding from its palette menu', async ({page, context}) => {
    await installFixtures(context, extensions);
    await page.goto('editor.html?lang=ja&twPlusStandardLayout=0');
    await page.waitForFunction(() => window.vm?.editingTarget && window.ScratchBlocks?.getMainWorkspace());
    await add(page, variableOnly);
    await expect(offer(page)).toHaveAccessibleName('標準の変数を隠しますか？');
    await offer(page).getByRole('button', {name: '隠す', exact: true}).click();
    const dialog = await settings(page);
    await expect(group(dialog, 'variables')).not.toBeChecked();
    await expect(group(dialog, 'lists')).toBeChecked();
    await dialog.getByRole('button', {name: 'キャンセル', exact: true}).click();
});
