const {test, expect, editorDialog, approveProjectExtensions} = require('./fixtures.cjs');
const fixture = require('./theme-project.cjs');

const themes = {
    light: {red: 'rgb(198, 40, 40)',
        tint: 'rgba(198, 40, 40, 0.08)',
        border: 'rgba(0, 0, 0, 0.15)',
        background: 'rgb(255, 255, 255)'},
    dark: {red: 'rgb(255, 138, 138)',
        tint: 'rgba(255, 138, 138, 0.12)',
        border: 'rgba(255, 255, 255, 0.15)',
        background: 'rgb(30, 30, 30)'}
};
const paths = ['name', 'amount', 'mode', 'notes', 'nested_invalid'];
const dialog = editorDialog;
const section = (page, id) => dialog(page).locator(`[data-block-editor-node="theme-${id}"]`);
const form = (page, id = 'grand') => section(page, id).locator('.rjsf')
    .first();
const field = (scope, path) => scope.locator(`input[id$="_${path}"], textarea[id$="_${path}"], select[id$="_${path}"]`);
const save = page => dialog(page).locator('[data-block-editor-save]');
const canvas = page => page.locator('.blocklySvg > .blocklyWorkspace > .blocklyBlockCanvas').first();

const load = async (page, baseURL, theme) => {
    const url = new URL('editor.html', baseURL);
    url.search = new URLSearchParams({lang: 'en',
        project_url: await fixture.project()});
    await page.goto(url.href);
    await approveProjectExtensions(page, fixture.sources, 'en');
    await expect(page.locator('[data-block-editor-icon]')).toHaveCount(3);
    await page.getByText('Settings', {exact: true}).click();
    const switchTo = page.getByText(theme === 'dark' ? 'Switch To Dark Mode' : 'Switch To Light Mode', {exact: true});
    if (await switchTo.count()) await switchTo.click();
    else await page.getByText('Settings', {exact: true}).click();
    // The menu's inverse action proves the host theme changed, rather than only CSS media emulation.
    await page.getByText('Settings', {exact: true}).click();
    await expect(page.getByText(theme === 'dark' ? 'Switch To Light Mode' : 'Switch To Dark Mode', {exact: true}))
        .toBeVisible();
    await page.getByText('Settings', {exact: true}).click();
};

const open = async (page, id) => {
    await page.locator(`.blocklyBlockCanvas [data-id="theme-${id}"] > [data-block-editor-icon]`).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toHaveAccessibleName(/^Edit Theme (group|item)/);
};

const errorFor = async control => {
    const id = await control.getAttribute('id');
    return control.page().locator(`[id="${id}__error"]`);
};
const expectInvalid = async (control, colours) => {
    await expect(control).toHaveAttribute('aria-invalid', 'true');
    await expect(control).toHaveCSS('border-top-color', colours.red);
    await expect.poll(() => control.evaluate(el => getComputedStyle(el).backgroundImage)).toContain(colours.tint);
    const error = await errorFor(control);
    await expect(error).toBeVisible();
    await expect(error).not.toHaveText('');
    const id = await error.getAttribute('id');
    expect((await control.getAttribute('aria-describedby')).split(/\s+/)).toContain(id);
    await expect(error).toHaveCSS('border-left-color', colours.red);
};
const expectValid = async (control, colours) => {
    await expect(control).not.toHaveAttribute('aria-invalid', 'true');
    await expect(control).not.toHaveAttribute('data-block-editor-invalid', 'true');
    await expect(control).toHaveCSS('border-top-color', colours.border);
    await expect(control).toHaveCSS('background-image', 'none');
    await expect(control).toHaveCSS('background-color', colours.background);
    await expect(await errorFor(control)).toHaveCount(0);
};

const readStyles = control => control.evaluate(el => {
    const css = getComputedStyle(el);
    const error = el.ownerDocument.getElementById(`${el.id}__error`);
    return {id: el.id,
        value: el.value,
        border: css.borderTopColor,
        background: css.backgroundImage,
        backgroundColor: css.backgroundColor,
        invalid: el.getAttribute('aria-invalid'),
        descriptions: el.getAttribute('aria-describedby'),
        error: error?.textContent || ''};
});
const readBlocks = async page => {
    const blocks = {};
    for (const id of ['root', 'grand', 'sibling']) {
        const node = section(page, id);
        const name = node.locator(`[data-block-editor-node-name="theme-${id}"]`);
        const icon = node.locator(`[data-block-editor-node-icon="theme-${id}"]`);
        await expect(name).toHaveText(id === 'root' ? 'Theme group' : 'Theme item');
        await expect(icon).toBeVisible();
        await expect.poll(() => icon.evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);
        blocks[id] = await node.evaluate(el => {
            const css = getComputedStyle(el);
            return {border: css.borderTopColor, background: css.backgroundImage};
        });
        const colour = id === 'grand' ? '102, 51, 153' : '8, 127, 140';
        expect(blocks[id].border).toBe(`rgb(${colour})`);
        expect(blocks[id].background).toContain(`rgba(${colour}, 0.08)`);
    }
    return blocks;
};
const snapshot = async page => ({blocks: await readBlocks(page),
    fields: Object.fromEntries(await Promise.all(paths.map(async path =>
        [path, await readStyles(field(form(page), path))]))),
    validSibling: await readStyles(field(form(page), 'nested_valid'))});

const capture = async (page, testInfo, name) => {
    await field(form(page), 'amount').scrollIntoViewIfNeeded();
    const path = testInfo.outputPath(name);
    await page.screenshot({path});
    await testInfo.attach(name, {path, contentType: 'image/png'});
};

const correct = async scope => {
    await field(scope, 'name').fill('Corrected name');
    await field(scope, 'amount').fill('3');
    await field(scope, 'mode').selectOption({label: 'b'});
    await field(scope, 'notes').fill('OK notes');
    await field(scope, 'nested_invalid').fill('OK');
};

for (const [theme, colours] of Object.entries(themes)) {
    test(`invalid表示と修正後の解除・ブロック色の保持 (${theme})`, {
        annotation: {type: 'theme', description: theme}
    }, async ({page, baseURL, evidence}, testInfo) => {
        const measurements = {theme, ...evidence.deployment(), url: baseURL};
        try {
            evidence.stage('theme-project');
            await load(page, baseURL, theme);
            const original = await canvas(page).textContent();
            await open(page, 'root');
            const shortcutKey = form(page).locator('input[id$="_shortcuts_ArrowRight-key"]');
            const shortcut = form(page).locator('[data-block-editor-item]').filter({
                has: page.locator('input[id$="_shortcuts_ArrowRight-key"]')
            });
            await shortcutKey.scrollIntoViewIfNeeded();
            await expect(shortcut.locator('label')).toHaveText(['キー', '値']);
            await expect(shortcut.locator('input')).toHaveCount(2);
            await expect(shortcutKey).toHaveValue('ArrowRight');
            await expect(shortcut.getByLabel('値', {exact: true})).toHaveValue('rehearsal.skipAction');
            await expect(shortcut).toHaveCSS('border-top-style', 'solid');
            const inline = await shortcut.locator('[data-block-editor-pair-row]').evaluateAll(rows => rows.every(row => {
                const label = row.querySelector('label').getBoundingClientRect();
                const input = row.querySelector('input').getBoundingClientRect();
                return Math.abs((label.top + label.bottom) - (input.top + input.bottom)) < 2;
            }));
            await testInfo.attach('pair-geometry.json', {body: JSON.stringify(await shortcut.locator('[data-block-editor-pair-row]').evaluateAll(rows => rows.map(row => {
                const label = row.querySelector('label');const input = row.querySelector('input');
                return {label: label.getBoundingClientRect().toJSON(), input: input.getBoundingClientRect().toJSON(),
                    labelStyle: {margin: getComputedStyle(label).margin, alignSelf: getComputedStyle(label).alignSelf},
                    inputStyle: {margin: getComputedStyle(input).margin, alignSelf: getComputedStyle(input).alignSelf},
                    rowStyle: {display: getComputedStyle(row).display, alignItems: getComputedStyle(row).alignItems}};
            }))), contentType: 'application/json'});
            expect(inline).toBe(true);
            await shortcut.getByRole('button', {name: '項目のメニュー', exact: true}).click();
            await expect(shortcut.getByRole('menuitem')).toBeVisible();
            await shortcut.getByRole('menuitem').press('Escape');
            await expect(shortcut.getByRole('menu')).toHaveCount(0);
            await expect(dialog(page)).toBeVisible();
            await testInfo.attach(`${theme}-key-value.png`, {body: await page.screenshot(), contentType: 'image/png'});
            evidence.stage('theme-initial-invalid');
            for (const path of paths) await expectInvalid(field(form(page), path), colours);
            for (const [id, path] of [['grand', 'nested_valid'], ['grand', 'items_0_label'],
                ['root', 'name'], ['sibling', 'amount']]) await expectValid(field(form(page, id), path), colours);
            await expect(save(page)).toBeDisabled();
            measurements.before = await snapshot(page);
            await capture(page, testInfo, `${theme}-invalid.png`);

            evidence.stage('theme-corrected');
            await correct(form(page));
            for (const path of paths) await expectValid(field(form(page), path), colours);
            await expect(save(page)).toBeEnabled();
            measurements.after = await snapshot(page);
            expect(measurements.after.blocks).toEqual(measurements.before.blocks);
            expect(measurements.after.validSibling).toEqual(measurements.before.validSibling);
            await capture(page, testInfo, `${theme}-valid.png`);
            expect(await canvas(page).textContent()).toBe(original);

            evidence.stage('theme-live-and-collapse');
            await field(form(page), 'name').fill('');
            await expectInvalid(field(form(page), 'name'), colours);
            await expect(await errorFor(field(form(page), 'name'))).toContainText('required');
            await field(form(page), 'name').fill('Corrected name');
            await expectValid(field(form(page), 'name'), colours);
            const amount = field(form(page), 'amount');
            await amount.fill('0');
            await expectInvalid(amount, colours);
            await expect(amount).toBeFocused();
            await expect(amount).toHaveCSS('outline-style', /auto|solid/);
            await dialog(page).locator('[data-block-editor-toggle="theme-grand"]')
                .click();
            await dialog(page).locator('[data-block-editor-toggle="theme-middle"]')
                .click();
            await expect(section(page, 'grand')).toHaveCount(0);
            await expect(save(page)).toBeDisabled();
            await dialog(page).locator('[data-block-editor-issue]')
                .first()
                .click();
            await expect(field(form(page), 'amount')).toBeFocused();
            await expectInvalid(field(form(page), 'amount'), colours);
            await expect(field(form(page), 'name')).toHaveValue('Corrected name');
            await field(form(page), 'amount').fill('3');
            await expectValid(field(form(page), 'amount'), colours);

            evidence.stage('theme-group-errors');
            const optional = field(form(page), 'group_other');
            await optional.fill('');
            const objectGroup = form(page).locator('.field-object.has-error')
                .filter({
                    has: page.locator('input[id$="_group_valid"]')
                })
                .last();
            await expect(objectGroup).toHaveAttribute('aria-invalid', 'true');
            await expect(objectGroup.locator('.error-detail')).toContainText('2');
            await expectValid(field(form(page), 'group_valid'), colours);
            await expectValid(optional, colours);
            await expect(save(page)).toBeDisabled();
            await optional.fill('Restored property');
            await expect(save(page)).toBeEnabled();

            const array = form(page).locator('.field-array')
                .first();
            await array.getByRole('button', {name: '項目のメニュー', exact: true}).last().click();
            await expect(array.locator('.array-item')).toHaveCount(2);
            await array.getByRole('menuitem', {name: '🗑️この項目を削除', exact: true}).click();
            await expect(array).toHaveAttribute('aria-invalid', 'true');
            await expect(array.locator('.error-detail')).toContainText('2');
            await expectValid(field(form(page), 'items_0_label'), colours);
            await expect(save(page)).toBeDisabled();
            await array.getByRole('button', {name: '➕項目を追加', exact: true}).click();
            await field(form(page), 'items_1_label').fill('Restored valid item');
            await expect(save(page)).toBeEnabled();
            expect(await readBlocks(page)).toEqual(measurements.before.blocks);

            evidence.stage('theme-cancel');
            await dialog(page).getByRole('button', {name: 'Cancel', exact: true})
                .click();
            await expect(dialog(page)).toHaveCount(0);
            expect(await canvas(page).textContent()).toBe(original);
            await open(page, 'root');
            for (const path of paths) await expectInvalid(field(form(page), path), colours);
            await expect(field(form(page), 'name')).toHaveValue('');
            await dialog(page).getByRole('button', {name: 'Cancel', exact: true})
                .click();

            evidence.stage('theme-single');
            await load(page, baseURL, theme);
            await open(page, 'grand');
            await expect(dialog(page).locator('[data-block-editor-node]')).toHaveCount(1);
            const single = form(page);
            for (const path of paths) await expectInvalid(field(single, path), colours);
            await expect(save(page)).toBeDisabled();
            await correct(single);
            for (const path of paths) await expectValid(field(single, path), colours);
            await expect(save(page)).toBeEnabled();
            await field(single, 'amount').press('Escape');
            await expect(dialog(page)).toHaveCount(0);
            measurements.completed = true;
            evidence.stage('completed');
        } finally {
            measurements.stage = evidence.currentStage();
            measurements.status = testInfo.status;
            await testInfo.attach(`${theme}-styles.json`, {body: JSON.stringify(measurements, null, 2),
                contentType: 'application/json'});
        }
    });
}
