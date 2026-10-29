const {test, expect, editorDialog, approveProjectExtensions} = require('./fixtures.cjs');
const fixture = require('./fixed-project.cjs');

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
    url.search = new URLSearchParams({lang, project_url: await fixture.project()});
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

for (const lang of ['en', 'ja']) test(`fixed native fields validate and save with keyboard and actual ${lang} GUI messages`, async ({page, baseURL, evidence}) => {
    evidence.stage('fixed-controls');await load(page, baseURL, lang);
    expect(await page.evaluate(() => globalThis.__fixedFixtureAvailable)).toBe(true);
    await open(page, lang);const view = dialog(page, lang);const text = wording[lang];
    await expect(view.locator('[data-block-editor-node]')).toHaveCount(0);
    const mode = view.getByRole('combobox', {name: 'MODE', exact: true});
    const number = view.getByRole('textbox', {name: 'NUMBER', exact: true});
    const color = view.getByRole('textbox', {name: 'COLOR', exact: true});
    await expect(mode).toHaveValue('"timeout"');await expect(number).toHaveValue('10');
    const condition = view.locator('[data-fixed-argument="CONDITION"]');
    await expect(condition).toBeVisible();await expect(condition).toHaveAttribute('disabled', '');
    await expect(condition.locator('output[aria-label="CONDITION"]')).toHaveCount(1);
    await expect(condition.locator('input, textarea, select')).toHaveCount(0);
    await expect(condition.getByText(text.readOnly, {exact: true})).toBeVisible();
    await expect(condition.getByText(text.unverified, {exact: true})).toBeVisible();
    const colorPicker = view.locator(`input[type="color"][aria-label="${text.picker}"]`);
    await expect(colorPicker).toHaveValue('#112233');
    const pickerBounds = await colorPicker.boundingBox();expect(pickerBounds).not.toBeNull();
    expect(pickerBounds.width).toBeGreaterThanOrEqual(40);expect(pickerBounds.height).toBeGreaterThanOrEqual(40);
    const contentHeight = await colorPicker.evaluate(element => {
        const style = getComputedStyle(element);
        return element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    });
    expect(contentHeight).toBeGreaterThan(0);
    const noHorizontalOverflow = await view.evaluate(element => element.scrollWidth <= element.clientWidth + 1);
    expect(noHorizontalOverflow).toBe(true);
    await test.info().attach(`fixed-color-geometry-${lang}.json`, {body: JSON.stringify({bounds: pickerBounds, contentHeight,
        noHorizontalOverflow}), contentType: 'application/json'});
    await test.info().attach(`fixed-form-${lang}.png`, {body: await page.screenshot(), contentType: 'image/png'});
    await number.focus();await expect(number).toBeFocused();await page.keyboard.press('Tab');
    expect(await view.evaluate(element => element.contains(element.ownerDocument.activeElement))).toBe(true);
    await number.fill('1e');await expect(number).toHaveValue('1e');await expect(number).toHaveAttribute('aria-invalid', 'true');
    const describedBy = await number.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();await expect(view.locator(`[id="${describedBy.split(/\s+/).find(id => id.endsWith('-error'))}"]`)).toHaveText(text.error);
    await expect(view.getByRole('button', {name: text.save, exact: true})).toBeDisabled();
    expect((await raw(page)).number).toBe('10');
    await number.fill('25');await color.fill('#445566');
    await expect(view.getByRole('button', {name: text.save, exact: true})).toBeEnabled();
    await view.getByRole('button', {name: text.save, exact: true}).click();await expect(view).toHaveCount(0);
    expect(await raw(page)).toMatchObject({mode: 'timeout', number: '25', timeout: '10', color: '#445566', reporter: 'fixed-context', evaluations: 0});
    await open(page, lang);await expect(dialog(page, lang).getByRole('textbox', {name: 'NUMBER', exact: true})).toHaveValue('25');
    await dialog(page, lang).getByRole('button', {name: text.cancel, exact: true}).click();
});

test('hidden branch drafts are retained in the dialog and excluded from the native saved values', async ({page, baseURL, evidence}) => {
    evidence.stage('fixed-hidden-draft');await load(page, baseURL, 'en');await open(page, 'en');const view = dialog(page, 'en');
    const timeout = view.getByRole('textbox', {name: 'TIMEOUT', exact: true});
    await timeout.fill('20');
    await view.getByRole('combobox', {name: 'MODE', exact: true}).selectOption('"forever"');
    await expect(timeout).toHaveCount(0);await expect(view.locator('[data-fixed-inactive-draft]')).toContainText(wording.en.inactive);
    await view.getByRole('combobox', {name: 'MODE', exact: true}).selectOption('"timeout"');
    await expect(timeout).toHaveValue('20');
    await view.getByRole('combobox', {name: 'MODE', exact: true}).selectOption('"forever"');
    await view.getByRole('button', {name: 'Save', exact: true}).click();await expect(view).toHaveCount(0);
    expect(await raw(page)).toMatchObject({mode: 'forever', timeout: '10', evaluations: 0});
});

test('the production Blockly dropdown updates the VM and the next fixed form without executing reporters', async ({page, baseURL, evidence}, testInfo) => {
    evidence.stage('fixed-native-dropdown');await load(page, baseURL, 'en');
    const native = page.locator('.blocklyBlockCanvas [data-id="fixed-root"] .blocklyDropdownText');
    await native.click();
    const dropdown = page.locator('.blocklyDropDownDiv');await expect(dropdown).toBeVisible();
    await testInfo.attach('native-blockly-dropdown.png', {body: await page.screenshot(), contentType: 'image/png'});
    await dropdown.locator('.goog-menuitem').filter({hasText: /^Forever$/}).click();
    await expect.poll(async () => (await raw(page)).mode).toBe('forever');
    await open(page, 'en');
    await expect(dialog(page, 'en').getByRole('combobox', {name: 'MODE', exact: true})).toHaveValue('"forever"');
    await expect(dialog(page, 'en').getByRole('textbox', {name: 'TIMEOUT', exact: true})).toHaveCount(0);
    await dialog(page, 'en').getByRole('button', {name: 'Cancel', exact: true}).click();
    await native.click();await expect(dropdown).toBeVisible();
    await dropdown.locator('.goog-menuitem').filter({hasText: /^Timeout$/}).click();
    await expect.poll(async () => (await raw(page)).mode).toBe('timeout');
    await open(page, 'en');
    await expect(dialog(page, 'en').getByRole('textbox', {name: 'TIMEOUT', exact: true})).toHaveValue('10');
    expect((await raw(page)).evaluations).toBe(0);
    await dialog(page, 'en').getByRole('button', {name: 'Cancel', exact: true}).click();
});

test('ordinary GUI startup exposes source and fixed editors without URL feature switches', async ({page, baseURL, evidence}) => {
    evidence.stage('standard-capabilities');await load(page, baseURL, 'en');
    expect(await page.evaluate(() => globalThis.__fixedFixtureCapabilities)).toEqual({dialogs: true,
        sourceForms: true, fixedInputs: true});
    expect(Array.from(new URL(page.url()).searchParams.keys()).sort()).toEqual(['lang', 'project_url']);
    await expect(page.locator('[data-block-editor-icon]')).toHaveCount(1);
    await open(page, 'en');
    await expect(dialog(page, 'en').getByRole('button', {name: 'Save', exact: true})).toBeVisible();
    await dialog(page, 'en').getByRole('button', {name: 'Cancel', exact: true}).click();
    expect((await raw(page)).evaluations).toBe(0);
});
