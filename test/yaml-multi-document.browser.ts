import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, cp, copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {chromium, expect} from '@playwright/test';
import JSZip from '@turbowarp/jszip';
import {startYamlEditorHost} from '../scripts/yaml-editor/host.ts';

const documents = project => project.extensionStorage.twpeyamlsettings.documents;
const withoutDocuments = project => {const p = structuredClone(project); delete p.extensionStorage.twpeyamlsettings.documents; return p;};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const saveLabel = '表示されている形式に変換して検証・保存';

test('real SB3 edits two same-named test-owner YAML documents with independent schemas and saves both', {timeout: 180000}, async () => {
    const siteInput = process.env.TWPE_YAML_SITE, fixture = process.env.TWPE_YAML_FIXTURE;
    assert(siteInput && fixture);
    const output = process.env.TWPE_YAML_EVIDENCE || await mkdtemp(path.join(tmpdir(), 'twpe-multi-proof-'));
    await mkdir(output, {recursive: true});
    const owned = await mkdtemp(path.join(tmpdir(), 'twpe-multi-'));
    const site = path.join(owned, 'site'); await cp(siteInput, site, {recursive: true});
    await copyFile(fixture, path.join(site, 'static/two-settings-documents.sb3'));
    const launches = [];
    const host = await startYamlEditorHost({siteDirectory: site, dataDirectory: path.join(owned, 'work'), launchEditor: async (file, profile) => { launches.push({file, profile}); }});
    const browser = await chromium.launch({headless: true, executablePath: process.env.TWPE_CHROME_EXECUTABLE});
    const context = await browser.newContext({viewport: {width: 1440, height: 1000}, locale: 'ja-JP', acceptDownloads: true});
    // Use the GUI's download path instead of the native file picker.
    await context.addInitScript(() => { delete window.showSaveFilePicker; });
    const errors = []; context.on('page', p => p.on('pageerror', (error: Error & {code?: string; status?: number; errors?: Error[]}) => errors.push(error.message)));
    const page = await context.newPage();
    const base = `${host.apiOrigin}/turbowarp-plus-editor/`;
    let stage = 'load';
    async function load(p, filename) {
        await p.goto(`${base}editor.html?lang=ja&twPlusYamlEditor=1&project_url=${encodeURIComponent(`${base}static/${filename}`)}`);
        const security = p.locator('.twextsec-modal'); await security.waitFor({timeout: 60000});
        await security.getByRole('button', {name: 'サンドボックスなし', exact: true}).click();
        await security.getByRole('button', {name: 'OK', exact: true}).click();
        await security.waitFor({state: 'hidden'});
        await p.locator('[class*="stage-selector_stage-selector"]').click();
        await expect(p.locator('[data-twpe-yaml-hat-icon]')).toHaveCount(2, {timeout: 60000});
    }
    async function open(index) {
        // Expanded YAML blocks can cover another hat, so open it from the keyboard.
        await page.locator('[data-twpe-yaml-hat-icon]').nth(index).focus();
        await page.keyboard.press('Enter');
        const dialog = page.getByRole('dialog', {name: 'データソース', exact: true});
        await expect(dialog).toBeVisible();
        return dialog;
    }
    async function editExternally(dialog, count) {
        await dialog.getByRole('button', {name: '外部エディタで編集', exact: true}).click();
        await expect.poll(() => launches.length).toBe(count);
        await expect(dialog).toContainText('VSCodeで文書を保存してから');
        return launches[count - 1];
    }
    try {
        await load(page, 'two-settings-documents.sb3');
        const original = await page.evaluate(() => JSON.parse(window.vm.toJSON()));
        await page.screenshot({path: path.join(output, '01-two-yaml-hats.png')});
        const dialog = await open(0);
        const firstLaunch = await editExternally(dialog, 1);
        assert.equal(await readFile(firstLaunch.file, 'utf8'), documents(original).settings);
        assert.match(firstLaunch.profile.schemaId, /settings$/u);
        stage = 'invalid-schema';
        await writeFile(firstLaunch.file, 'volume: 150\nmode: production\n');
        await dialog.getByRole('button', {name: saveLabel, exact: true}).click();
        await expect(dialog.getByRole('alert')).toContainText('JSON Schema validation failed', {timeout: 30000});
        await expect(dialog).toBeVisible();
        assert.equal(await page.evaluate(() => window.vm.runtime.extensionStorage.twpeyamlsettings.documents.settings), documents(original).settings);
        stage = 'guarded-switch';
        // The unsaved work copy pins the dialog to its document until it is saved or cancelled.
        await expect(dialog.locator('#twpe-yaml-document')).toBeDisabled();
        await expect(dialog).toContainText('別の文書へ移るには、保存またはキャンセルでこの画面を閉じてください。');
        assert.equal(launches.length, 1);
        stage = 'first-save';
        const first = 'volume: 75\nmode: production\n'; await writeFile(firstLaunch.file, first);
        await dialog.getByRole('button', {name: saveLabel, exact: true}).click();
        await expect(dialog).toBeHidden({timeout: 30000});
        assert.equal(await page.evaluate(() => window.vm.runtime.extensionStorage.twpeyamlsettings.documents.settings), first);
        stage = 'switch-document';
        const reopened = await open(0);
        await expect(reopened.locator('#twpe-yaml-preview')).toHaveValue(first);
        await reopened.locator('#twpe-yaml-document').selectOption(JSON.stringify(['twpeyamlsettings', 'labels']));
        await expect(reopened.locator('#twpe-yaml-preview')).toHaveValue(documents(original).labels);
        assert.equal(launches.length, 1);
        const secondLaunch = await editExternally(reopened, 2);
        assert.equal(await readFile(secondLaunch.file, 'utf8'), documents(original).labels);
        assert.match(secondLaunch.profile.schemaId, /labels$/u);
        const schema1 = JSON.parse(await readFile(firstLaunch.profile.schemaFile, 'utf8'));
        const schema2 = JSON.parse(await readFile(secondLaunch.profile.schemaFile, 'utf8'));
        assert(schema1.properties.volume); assert(schema2.properties.title); assert(!schema2.properties.volume);
        stage = 'second-save';
        const second = 'title: Chapter 2\n'; await writeFile(secondLaunch.file, second);
        await reopened.getByRole('button', {name: saveLabel, exact: true}).click();
        await expect(reopened).toBeHidden({timeout: 30000});
        assert.deepEqual(await page.evaluate(() => window.vm.runtime.extensionStorage.twpeyamlsettings.documents), {settings: first, labels: second});
        await page.screenshot({path: path.join(output, '02-second-document-saved.png')});
        stage = 'standard-editor-file-save';
        // The File menu always downloads; the menu-bar shortcut can sit under the extension status panel.
        await page.getByText('ファイル', {exact: true}).click();
        const pending = page.waitForEvent('download'); await page.getByRole('listitem').filter({hasText: /^コンピューターに保存する$/}).click();
        const saved = path.join(output, 'two-edited-documents.sb3'); await (await pending).saveAs(saved);
        const zip = await JSZip.loadAsync(await readFile(saved));
        const savedProject = JSON.parse(await zip.file('project.json').async('string'));
        assert.deepEqual(documents(savedProject), {settings: first, labels: second});
        assert.deepEqual(withoutDocuments(savedProject), withoutDocuments(original));
        const originalZip = await JSZip.loadAsync(await readFile(fixture));
        const assets = Object.keys(originalZip.files).filter(name => name !== 'project.json' && !originalZip.files[name].dir);
        assert(assets.length > 0, 'The fixture must contain assets to preserve.');
        for (const name of assets) assert.equal(sha(await zip.file(name).async('nodebuffer')), sha(await originalZip.file(name).async('nodebuffer')));
        stage = 'reload'; await copyFile(saved, path.join(site, 'static/two-saved.sb3'));
        const reload = await context.newPage();
        await load(reload, 'two-saved.sb3');
        assert.deepEqual(await reload.evaluate(() => window.vm.runtime.extensionStorage.twpeyamlsettings.documents), {settings: first, labels: second});
        assert.deepEqual(errors, []);
        await writeFile(path.join(output, 'result.json'), JSON.stringify({result: 'passed', browser: browser.version(), provider: 'twpeyamlsettings test extension', documents: ['settings', 'labels'], filename: 'settings.yml', schemasIsolated: true, invalidSchemaRetained: true, guardedSwitch: true, sourceBodiesNotInBlocks: !JSON.stringify(savedProject.targets.map(target => target.blocks)).includes(first), nonDocumentProjectDataPreserved: true, assetEntriesPreserved: assets.length, reloaded: true, nativeLauncher: 'injected; actual VSCode tested separately', greenFlagExecuted: false, errors}, null, 2));
    } catch (error) {
        await page.screenshot({path: path.join(output, 'failure.png')}).catch(() => {});
        await writeFile(path.join(output, 'failure.json'), JSON.stringify({stage, message: error.message, errors}, null, 2)); throw error;
    } finally {await browser.close(); await host.close();}
});
