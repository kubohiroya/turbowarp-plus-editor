const {test, expect} = require('./fixtures.cts');
const Zip = require('@turbowarp/jszip');
const {readFile} = require('node:fs/promises');
const path = require('node:path');

const fileMenu = page => page.getByText('ファイル', {exact: true});
const menuItem = (page, name) => page.getByRole('button', {name, exact: true});
const saveDialog = page => page.getByRole('dialog', {name: '名前を変えて保存', exact: true});

async function openEditor(page) {
    await page.goto('editor.html?lang=ja');
    await page.waitForFunction(() => globalThis.vm?.runtime?.targets?.length > 0);
}

test('Save As assigns the next overwrite destination and cancelling keeps the previous file', async ({page}) => {
    await page.addInitScript(() => {
        globalThis.fileWorkflow = {writes: [], picks: [], cancel: false};
        window.showSaveFilePicker = async options => {
            const state = globalThis.fileWorkflow;
            state.picks.push(options.suggestedName);
            if (state.cancel) throw new DOMException('Cancelled', 'AbortError');
            return {
                name: options.suggestedName,
                async createWritable() {
                    const parts = [];
                    return {
                        write(chunk) {parts.push(chunk);},
                        close() {state.writes.push({name: options.suggestedName, blob: new Blob(parts)});},
                        abort() {}
                    };
                }
            };
        };
    });
    await openEditor(page);
    await fileMenu(page).click();
    const ordered = ['新しいプロジェクトを作成', 'SB3ファイルを開く…', 'プロジェクトを保存', '名前を変えて保存…',
        '書き出し…', '作品のプロパティ', '組み込みデータ…', '機能拡張…', '復元ポイント'];
    const menu = page.getByRole('list').filter({has: menuItem(page, ordered[0])});
    const labels = await menu.getByRole('button').evaluateAll(buttons => buttons.map(button => {
        const label = button.cloneNode(true);
        label.querySelector('kbd')?.remove();
        return label.textContent;
    }));
    expect(labels.filter(label => ordered.includes(label))).toEqual(ordered);
    await expect(menuItem(page, 'プロジェクトを保存')).toBeDisabled();
    await menuItem(page, '名前を変えて保存…').click();
    await saveDialog(page).getByRole('textbox', {name: '名前'}).fill('次の作品');
    await saveDialog(page).getByRole('combobox', {name: '保存形式'}).selectOption('embedded');
    await saveDialog(page).getByRole('button', {name: '保存先を選ぶ…'}).click();
    await expect(saveDialog(page)).toHaveCount(0);

    await page.evaluate(() => {globalThis.fileWorkflow.cancel = true;});
    await fileMenu(page).click();
    await menuItem(page, '名前を変えて保存…').click();
    await saveDialog(page).getByRole('textbox', {name: '名前'}).fill('キャンセルした名前');
    await saveDialog(page).getByRole('button', {name: '保存先を選ぶ…'}).click();
    await saveDialog(page).getByRole('button', {name: 'キャンセル'}).click();

    await fileMenu(page).click();
    await menuItem(page, 'プロジェクトを保存').click();
    await expect.poll(() => page.evaluate(() => globalThis.fileWorkflow.writes.map(write => write.name)))
        .toEqual(['次の作品.sb3', '次の作品.sb3']);
    const data = await page.evaluate(async () =>
        [...new Uint8Array(await globalThis.fileWorkflow.writes[1].blob.arrayBuffer())]);
    const zip = await Zip.loadAsync(Buffer.from(data));
    expect(JSON.parse(await zip.file('project.json').async('string')).targets.length).toBeGreaterThan(0);
});

test('downloads produce an editable SB3 and keep Save disabled without a writable handle', async ({page}) => {
    await page.addInitScript(() => {window.showSaveFilePicker = undefined;});
    await openEditor(page);
    await fileMenu(page).click();
    await expect(menuItem(page, 'プロジェクトを保存')).toBeDisabled();
    await menuItem(page, '名前を変えて保存…').click();
    await saveDialog(page).getByRole('textbox', {name: '名前'}).fill('downloaded');
    const pending = page.waitForEvent('download');
    await saveDialog(page).getByRole('button', {name: '保存', exact: true}).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe('downloaded.sb3');
    const zip = await Zip.loadAsync(await readFile(await download.path()));
    expect(JSON.parse(await zip.file('project.json').async('string')).targets.length).toBeGreaterThan(0);
    await fileMenu(page).click();
    await expect(menuItem(page, 'プロジェクトを保存')).toBeDisabled();
});

for (const filename of ['single_sound.sb', 'unknown-opcode.sb2']) {
    test(`opens legacy ${filename} through the SB3 picker without making it an overwrite target`, async ({page}) => {
        const root = process.env.E2E_LEGACY_PROJECT_FIXTURES;
        test.skip(!root, 'Set E2E_LEGACY_PROJECT_FIXTURES to the pinned Scratch VM test/fixtures directory');
        const bytes = await readFile(path.join(root, filename));
        await page.addInitScript(({bytes, filename}) => {
            window.showSaveFilePicker = undefined;
            window.showOpenFilePicker = async options => {
                globalThis.projectPickerOptions = options;
                return [{name: filename, getFile: () => new File([new Uint8Array(bytes)], filename)}];
            };
        }, {bytes: [...bytes], filename});
        await openEditor(page);
        await fileMenu(page).click();
        await menuItem(page, 'SB3ファイルを開く…').click();
        await expect(page.getByPlaceholder('プロジェクトのタイトルを入力')).toHaveValue(filename.replace(/\.sb2?$/, ''));
        expect(await page.evaluate(() => globalThis.projectPickerOptions.types.map(type => type.accept['*/*'])))
            .toEqual([['.sb3'], ['.sb', '.sb2']]);
        await fileMenu(page).click();
        await expect(menuItem(page, 'プロジェクトを保存')).toBeDisabled();
        await menuItem(page, '名前を変えて保存…').click();
        const pending = page.waitForEvent('download');
        await saveDialog(page).getByRole('button', {name: '保存', exact: true}).click();
        const download = await pending;
        expect(download.suggestedFilename()).toBe(filename.replace(/\.sb2?$/, '.sb3'));
        const zip = await Zip.loadAsync(await readFile(await download.path()));
        expect(JSON.parse(await zip.file('project.json').async('string')).meta.semver).toBe('3.0.0');
    });
}
