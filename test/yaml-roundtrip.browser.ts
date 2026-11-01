import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, cp, copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {chromium, expect} from '@playwright/test';
import JSZip from '@turbowarp/jszip';
import {startYamlEditorHost} from '../scripts/yaml-editor/host.ts';

const documents = project => project.extensionStorage.twpeyamlsettings.documents;
const digest = value => createHash('sha256').update(value).digest('hex');
const withoutDocuments = project => {
    const value = structuredClone(project);
    delete value.extensionStorage.twpeyamlsettings.documents;
    return value;
};
const saveLabel = '表示されている形式に変換して検証・保存';

// The native process is replaced only in this deterministic browser regression.
// A separate real-VSCode proof exercises the production launcher and desktop save.
test('real Editor VM imports YAML, preserves assets, saves SB3, reloads it, and invalidates an old session', {timeout: 180000}, async () => {
    const inputSite = process.env.TWPE_YAML_SITE;
    const fixture = process.env.TWPE_YAML_FIXTURE;
    assert(inputSite && path.isAbsolute(inputSite), 'TWPE_YAML_SITE must name an owned Editor build.');
    assert(fixture && path.isAbsolute(fixture), 'TWPE_YAML_FIXTURE must name the settings fixture SB3.');
    const output = process.env.TWPE_YAML_EVIDENCE || await mkdtemp(path.join(tmpdir(), 'twpe-yaml-evidence-'));
    await mkdir(output, {recursive: true});
    const owned = await mkdtemp(path.join(tmpdir(), 'twpe-yaml-roundtrip-'));
    const site = path.join(owned, 'site');
    await cp(inputSite, site, {recursive: true});
    await copyFile(fixture, path.join(site, 'static/yaml-roundtrip.sb3'));
    const files = [];
    const host = await startYamlEditorHost({siteDirectory: site, dataDirectory: path.join(owned, 'work'), launchEditor: async file => { files.push(file); }});
    const browser = await chromium.launch({headless: true, ...(process.env.TWPE_CHROME_EXECUTABLE ? {executablePath: process.env.TWPE_CHROME_EXECUTABLE} : {})});
    const context = await browser.newContext({viewport: {width: 1440, height: 1000}, locale: 'ja-JP', acceptDownloads: true});
    // Use the GUI's download path instead of the native file picker.
    await context.addInitScript(() => { delete window.showSaveFilePicker; });
    const errors = [];
    context.on('page', p => p.on('pageerror', (error: Error & {code?: string; status?: number; errors?: Error[]}) => errors.push(error.message)));
    const page = await context.newPage();
    const base = `${host.apiOrigin}/turbowarp-plus-editor/`;
    let stage = 'load';
    try {
        async function load(p, name) {
            await p.goto(`${base}editor.html?lang=ja&twPlusYamlEditor=1&project_url=${encodeURIComponent(`${base}static/${name}`)}`);
            const security = p.locator('.twextsec-modal');
            await security.waitFor({timeout: 60000});
            const bulk = security.getByRole('button', {name: 'サンドボックスなし', exact: true});
            if (await bulk.count()) await bulk.click();
            else await expect(security.locator('input[type=radio]:checked')).toHaveCount(1);
            await security.getByRole('button', {name: 'OK', exact: true}).click();
            await security.waitFor({state: 'hidden', timeout: 60000});
            await p.locator('[class*="stage-selector_stage-selector"]').click();
            await expect(p.locator('[data-twpe-yaml-hat-icon]')).toHaveCount(2, {timeout: 60000});
            await expect(p.locator('[data-twpe-yaml-hat-icon]').first()).toHaveAttribute('aria-disabled', 'false');
            assert.equal(await p.locator('.twpe-yaml-toolbar').count(), 0, 'The standard menu must not have an added toolbar.');
        }
        async function open(p) {
            const icon = p.locator('[data-twpe-yaml-hat-icon]').first();
            await icon.focus();
            await p.keyboard.press('Enter');
            const dialog = p.getByRole('dialog', {name: 'データソース', exact: true});
            await expect(dialog).toBeVisible();
            return dialog;
        }
        async function editInVSCode(dialog, count) {
            await dialog.getByRole('button', {name: '外部エディタで編集', exact: true}).click();
            await expect.poll(() => files.length).toBe(count);
            await expect(dialog).toContainText('VSCodeで文書を保存してから');
            return files[count - 1];
        }
        await load(page, 'yaml-roundtrip.sb3');
        const original = await page.evaluate(() => JSON.parse(window.vm.toJSON()));
        const dialog = await open(page);
        const working = await editInVSCode(dialog, 1);
        assert.equal(await readFile(working, 'utf8'), documents(original).settings);
        stage = 'invalid-source';
        await writeFile(working, 'volume: [broken');
        await dialog.getByRole('button', {name: saveLabel, exact: true}).click();
        await expect(dialog.getByRole('alert')).toContainText('保存できませんでした', {timeout: 30000});
        await expect(dialog).toBeVisible();
        assert.deepEqual(await page.evaluate(() => window.vm.runtime.extensionStorage.twpeyamlsettings.documents), documents(original));
        stage = 'valid-source';
        const edited = `${documents(original).settings}# Browser roundtrip preserves the embedded document.\n`;
        await writeFile(working, edited);
        await dialog.getByRole('button', {name: saveLabel, exact: true}).click();
        await expect(dialog).toBeHidden({timeout: 30000});
        assert.deepEqual(await page.evaluate(() => window.vm.runtime.extensionStorage.twpeyamlsettings.documents),
            {...documents(original), settings: edited});
        await page.screenshot({path: path.join(output, 'imported.png')});
        stage = 'standard-editor-file-save';
        // The File menu stays clear of the floating extension-status badge in the menu bar.
        await page.getByText('ファイル', {exact: true}).click();
        const pending = page.waitForEvent('download');
        await page.getByRole('listitem').filter({hasText: /^(別ファイルで保存する\.\.\.|コンピューターに保存する)$/u}).click();
        const saved = path.join(output, 'edited.sb3');
        await (await pending).saveAs(saved);
        const archive = await JSZip.loadAsync(await readFile(saved));
        const savedProject = JSON.parse(await archive.file('project.json').async('string'));
        assert.deepEqual(documents(savedProject), {...documents(original), settings: edited});
        assert(isDeepStrictEqual(withoutDocuments(savedProject), withoutDocuments(original)), 'Non-document project data must match normal VM serialization.');
        const initialArchive = await JSZip.loadAsync(await readFile(fixture));
        const assets = Object.keys(initialArchive.files).filter(name => name !== 'project.json' && !initialArchive.files[name].dir);
        assert(assets.length > 0, 'The fixture must contain assets to preserve.');
        for (const name of assets) assert.equal(digest(await archive.file(name).async('nodebuffer')), digest(await initialArchive.file(name).async('nodebuffer')));
        stage = 'reload';
        await copyFile(saved, path.join(site, 'static/yaml-saved.sb3'));
        const reload = await context.newPage();
        await load(reload, 'yaml-saved.sb3');
        assert.equal(await reload.evaluate(() => window.vm.runtime.extensionStorage.twpeyamlsettings.documents.settings), edited);
        const reloadDialog = await open(reload);
        await expect(reloadDialog.locator('textarea')).toHaveValue(edited);
        await reload.screenshot({path: path.join(output, 'reloaded.png')});
        stage = 'replacement';
        const stale = await editInVSCode(reloadDialog, 2);
        await reload.evaluate(async url => window.vm.loadProject(await (await fetch(url)).arrayBuffer()), `${base}static/yaml-roundtrip.sb3`);
        await expect(reloadDialog).toContainText('作品が切り替わったため', {timeout: 30000});
        await writeFile(stale, `${edited}# A stale session must not reach the replacement project.\n`);
        const replacementSave = reloadDialog.getByRole('button', {name: saveLabel, exact: true});
        if (await replacementSave.isEnabled()) await replacementSave.click();
        await expect.poll(() => reload.evaluate(() => window.vm.runtime.extensionStorage.twpeyamlsettings.documents)).toEqual(documents(original));
        assert.deepEqual(errors, []);
        await writeFile(path.join(output, 'result.json'), JSON.stringify({result: 'passed', browser: browser.version(), nativeLauncher: 'injected for deterministic test; separate native proof required', provider: 'twpeyamlsettings test extension', fixtureSHA256: digest(await readFile(fixture)), preservedProjectData: true, preservedAssetEntries: assets.length, invalidSourceRetained: true, staleSessionRejected: true}, null, 2));
    } catch (error) {
        await page.screenshot({path: path.join(output, 'failure.png')}).catch(() => {});
        await writeFile(path.join(output, 'failure.json'), JSON.stringify({stage, message: error.message, errors}, null, 2));
        throw error;
    } finally { await browser.close(); await host.close(); }
});
