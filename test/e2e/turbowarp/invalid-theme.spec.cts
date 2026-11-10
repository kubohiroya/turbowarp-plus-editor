const {test, expect, editorDialog, approveProjectExtensions} = require('./fixtures.cts');
const fixture = require('./theme-project.cts');
const {openDisplaySettings, projectInfoMenuButton} = require('../../fixtures/layout-menu.ts');

const themes = {
    light: {red: 'rgb(198, 40, 40)',
        errorText: 'rgb(166, 27, 27)',
        tint: 'rgba(198, 40, 40, 0.08)',
        border: 'rgba(0, 0, 0, 0.15)',
        background: 'rgb(255, 255, 255)'},
    dark: {red: 'rgb(255, 138, 138)',
        errorText: 'rgb(255, 179, 179)',
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

const load = async (page, baseURL, theme) => {
    await page.emulateMedia({colorScheme: theme === 'dark' ? 'light' : 'dark'});
    const url = new URL('editor.html', baseURL);
    url.search = new URLSearchParams({lang: 'en',
        project_url: await fixture.project()}).toString();
    await page.goto(url.href);
    await approveProjectExtensions(page, fixture.sources, 'en');
    await expect(page.locator('[data-block-editor-icon]')).toHaveCount(3);
    const display = await openDisplaySettings(page);
    const switchTo = display.getByText(theme === 'dark' ? 'Switch To Dark Mode' : 'Switch To Light Mode', {exact: true});
    if (await switchTo.count()) {
        await switchTo.click();
        await expect(display).toHaveCount(0);
        await openDisplaySettings(page);
    }
    // The menu's inverse action proves the host theme changed, rather than only CSS media emulation.
    await expect(display.getByText(theme === 'dark' ? 'Switch To Light Mode' : 'Switch To Dark Mode', {exact: true}))
        .toBeVisible();
    await projectInfoMenuButton(page).click();
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
    await expect(error).toHaveCSS('color', colours.errorText);
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

for (const [theme, colours] of Object.entries<any>(themes)) {
    // How nested forms validate, collapse, report object and array errors and cancel is tested by
    // @kubohiroya/turbowarp-extension-data-editor on the Editor's pinned VM and Scratch Blocks
    // (test/runtime/hierarchy-invalid.browser.ts). Here the Editor checks what it owns: the colours its
    // stylesheet and the GUI's theme give invalid fields, valid fields and blocks, light and dark.
    test(`invalid表示と修正後の解除・ブロック色の保持 (${theme})`, {
        annotation: {type: 'theme', description: theme}
    }, async ({page, baseURL, evidence}, testInfo) => {
        const measurements = {theme, ...evidence.deployment(), url: baseURL};
        try {
            evidence.stage('theme-project');
            await load(page, baseURL, theme);
            await open(page, 'root');
            evidence.stage('theme-initial-invalid');
            for (const path of paths) await expectInvalid(field(form(page), path), colours);
            for (const [id, path] of [['grand', 'nested_valid'], ['grand', 'items_0_label'],
                ['root', 'name'], ['sibling', 'amount']]) await expectValid(field(form(page, id), path), colours);
            measurements.before = await snapshot(page);
            await capture(page, testInfo, `${theme}-invalid.png`);
            evidence.stage('theme-corrected');
            await correct(form(page));
            for (const path of paths) await expectValid(field(form(page), path), colours);
            measurements.after = await snapshot(page);
            expect(measurements.after.blocks).toEqual(measurements.before.blocks);
            expect(measurements.after.validSibling).toEqual(measurements.before.validSibling);
            await capture(page, testInfo, `${theme}-valid.png`);
            await dialog(page).getByRole('button', {name: 'Cancel', exact: true}).click();
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
