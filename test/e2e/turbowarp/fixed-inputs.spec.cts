const {test, expect, editorDialog, approveProjectExtensions} = require('./fixtures.cts');
const fixture = require('./fixed-project.cts');

const wording = {
    en: {title: 'Edit block', security: 'Extension Security', checkbox: 'Run without sandbox', allow: 'Allow', save: 'Save', cancel: 'Cancel',
        error: 'Check this value before saving.', readOnly: 'This input cannot be edited safely.',
        unverified: 'The expression is retained without evaluation. Its runtime validity has not been checked.',
        inactive: 'Hidden edits are retained in this dialog and will not be saved while hidden.', picker: 'COLOR color picker'},
    ja: {title: 'ブロックを編集', security: '拡張機能のセキュリティ', checkbox: 'サンドボックスなしで実行する', allow: '許可する', save: '保存', cancel: 'キャンセル',
        error: '保存する前に値を確認してください。', readOnly: 'この入力は編集できません。', unverified: '式の実行時の有効性は未検証です。',
        inactive: '非表示の編集内容はこの画面で保持されます。非表示のまま保存しても反映されません。', picker: 'COLOR 色を選択'}
};
const dialog = editorDialog;
const load = async (page, baseURL, lang) => {
    const url = new URL('editor.html', baseURL);
    url.search = new URLSearchParams({lang, project_url: await fixture.project()}).toString().toString();
    await page.goto(url.href);
    await approveProjectExtensions(page, [fixture.source], lang);
    await expect(page.locator('.blocklyBlockCanvas [data-id="fixed-root"]')).toHaveCount(1);
};
const raw = page => page.evaluate(() => {
    const blocks = window.vm.editingTarget.blocks;
    const root = blocks.getBlock('fixed-root');
    const field = (argument, name) => blocks.getBlock(root.inputs[argument].block).fields[name].value;
    return {mode: root.fields.MODE.value, number: field('NUMBER', 'NUM'), timeout: field('TIMEOUT', 'NUM'), color: field('COLOR', 'COLOUR'),
        reporter: root.inputs.CONDITION.block, evaluations: globalThis.__fixedFixtureExecutions};
});
const open = async (page, lang) => {
    const icon = page.getByRole('button', {name: wording[lang].title, exact: true});
    await icon.focus();await page.keyboard.press('Enter');await expect(dialog(page, lang)).toBeVisible();
    await expect(dialog(page)).toHaveAccessibleName(lang === 'en' ? /^Edit fixed / : /^fixed .*を編集$/);
};

// How fixed inputs validate, save, keep hidden drafts and follow the native dropdown is tested by
// @kubohiroya/turbowarp-extension-data-editor on the Editor's pinned VM and Scratch Blocks
// (test/runtime/fixed-inputs.browser.ts). Here the Editor checks what it owns: the GUI's own wording
// for the dialog, in both languages.
for (const lang of ['en', 'ja']) test(`fixed native fields speak the GUI's ${lang} messages`, async ({page, baseURL, evidence}) => {
    evidence.stage('fixed-messages');await load(page, baseURL, lang);
    expect(await page.evaluate(() => globalThis.__fixedFixtureAvailable)).toBe(true);
    await open(page, lang);const view = dialog(page, lang);const text = wording[lang];
    const condition = view.locator('[data-fixed-argument="CONDITION"]');
    await expect(condition.getByText(text.readOnly, {exact: true})).toBeVisible();
    await expect(condition.getByText(text.unverified, {exact: true})).toBeVisible();
    await expect(view.locator(`input[type="color"][aria-label="${text.picker}"]`)).toHaveValue('#112233');
    const number = view.getByRole('textbox', {name: 'NUMBER', exact: true});
    await number.fill('1e');await expect(number).toHaveAttribute('aria-invalid', 'true');
    const describedBy = await number.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();await expect(view.locator(`[id="${describedBy.split(/\s+/).find(id => id.endsWith('-error'))}"]`)).toHaveText(text.error);
    await expect(view.getByRole('button', {name: text.save, exact: true})).toBeDisabled();
    await number.fill('10');
    await view.getByRole('textbox', {name: 'TIMEOUT', exact: true}).fill('20');
    await view.getByRole('combobox', {name: 'MODE', exact: true}).selectOption('"forever"');
    await expect(view.locator('[data-fixed-inactive-draft]')).toContainText(text.inactive);
    await view.getByRole('button', {name: text.cancel, exact: true}).click();await expect(view).toHaveCount(0);
    expect(await raw(page)).toMatchObject({mode: 'timeout', number: '10', timeout: '10', evaluations: 0});
});

test('ordinary GUI startup exposes source and fixed editors without URL feature switches', async ({page, baseURL, evidence}) => {
    evidence.stage('standard-capabilities');await load(page, baseURL, 'en');
    // Extensions reach previews and an isolated preview VM through the GUI as well.
    expect(await page.evaluate(() => globalThis.__fixedFixtureCapabilities)).toEqual({dialogs: true,
        sourceForms: true, fixedInputs: true, previews: true, isolatedVm: true});
    expect(Array.from(new URL(page.url()).searchParams.keys()).sort()).toEqual(['lang', 'project_url']);
    await expect(page.locator('[data-block-editor-icon]')).toHaveCount(1);
    await open(page, 'en');
    await expect(dialog(page, 'en').getByRole('button', {name: 'Save', exact: true})).toBeVisible();
    await dialog(page, 'en').getByRole('button', {name: 'Cancel', exact: true}).click();
    expect((await raw(page)).evaluations).toBe(0);
});
