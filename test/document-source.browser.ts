import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, cp, copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {chromium, expect} from '@playwright/test';
import JSZip from '@turbowarp/jszip';
import {startYamlEditorHost} from '../scripts/yaml-editor/host.ts';
import {fixtureSources} from '../scripts/yaml-editor/build-document-source-fixture.ts';

const documents = project => project.extensionStorage.kubohiroyadocumentdata.documents;
const omitDocuments = project => {const p = structuredClone(project); delete p.extensionStorage.kubohiroyadocumentdata.documents; return p;};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const saveLabel = '表示されている形式に変換して検証・保存';

test('four real packages keep YAML/JSON sources across stop, external edits, standard SB3 save and reload', {timeout: 180000}, async () => {
    const siteInput = process.env.TWPE_YAML_SITE, fixture = process.env.TWPE_YAML_FIXTURE;
    assert(siteInput && fixture);
    const output = process.env.TWPE_YAML_EVIDENCE || await mkdtemp(path.join(tmpdir(), 'twpe-source-proof-'));
    await mkdir(output, {recursive: true});
    const owned = await mkdtemp(path.join(tmpdir(), 'twpe-document-source-'));
    const site = path.join(owned, 'site'); await cp(siteInput, site, {recursive: true});
    await copyFile(fixture, path.join(site, 'static/document-source-family.sb3'));
    const launches = [];
    const host = await startYamlEditorHost({siteDirectory: site, dataDirectory: path.join(owned, 'work'), launchEditor: async (file, profile) => {launches.push({file, profile});}});
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
        await security.getByRole('button', {name: 'OK', exact: true}).click(); await security.waitFor({state: 'hidden'});
        await p.locator('[class*="stage-selector_stage-selector"]').click();
        await expect(p.locator('[data-twpe-yaml-hat-icon]')).toHaveCount(2, {timeout: 60000});
    }
    async function open(blockId) {
        // Expanded YAML blocks can cover another hat, so open it from the keyboard.
        await page.locator(`[data-id="${blockId}"] [data-twpe-yaml-hat-icon]`).focus();
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
    const state = () => page.evaluate(() => {
        const vm = window.vm, s = vm.runtime[Symbol.for('twpe.document-source.fixture')], stage = vm.runtime.getTargetForStage();
        const projection = s.projection.get(stage, 'settings');
        return {sources: s.store.list(), projected: projection?.value ?? null};
    });
    try {
        await load(page, 'document-source-family.sb3');
        const original = await page.evaluate(() => JSON.parse(window.vm.toJSON()));
        assert.equal(documents(original)['yaml-settings'].source, fixtureSources['yaml-settings']);
        assert.equal(documents(original)['json-settings'].source, fixtureSources['json-settings']);
        stage = 'projection-and-stop';
        await page.evaluate(() => {const vm=window.vm,s=vm.runtime[Symbol.for('twpe.document-source.fixture')];s.projection.project(vm.runtime.getTargetForStage(),'settings',{providerId:'document-data',documentId:'yaml-settings'});});
        assert.equal((await state()).projected.volume, 50);
        await page.evaluate(() => window.vm.stopAll());
        assert.equal((await state()).projected, null);
        assert.deepEqual((await state()).sources.map(document=>document.source), Object.values<any>(fixtureSources));
        await page.evaluate(() => {const vm=window.vm,s=vm.runtime[Symbol.for('twpe.document-source.fixture')];s.projection.project(vm.runtime.getTargetForStage(),'settings',{providerId:'document-data',documentId:'yaml-settings'});});
        assert.equal((await state()).projected.volume, 50);
        await page.screenshot({path: path.join(output, '01-source-hats.png')});
        stage = 'preview-without-launch';
        const dialog = await open('document-yaml');
        await expect(dialog.getByRole('tab', {name: 'YAMLテキスト', exact: true})).toHaveAttribute('aria-selected', 'true');
        await expect(dialog.locator('#twpe-yaml-preview')).toHaveValue(fixtureSources['yaml-settings'].replace(/\r\n/gu,'\n'));
        await expect(dialog.getByRole('button', {name: saveLabel, exact: true})).toBeEnabled();
        assert.equal(launches.length,0); assert.equal((await state()).projected.volume,50);
        assert.deepEqual((await state()).sources.map(document=>document.source), Object.values<any>(fixtureSources));
        stage = 'yaml-edit';
        const yamlLaunch = await editExternally(dialog, 1);
        assert.equal(path.basename(yamlLaunch.file),'settings.yml');
        assert.equal(await readFile(yamlLaunch.file,'utf8'),fixtureSources['yaml-settings']);
        await writeFile(yamlLaunch.file,'# retained\r\nvolume: 150\r\nmode: production\r\n');
        await dialog.getByRole('button',{name:saveLabel,exact:true}).click();
        await expect(dialog.getByRole('alert')).toContainText('保存できませんでした',{timeout:30000});
        await expect(dialog).toBeVisible();
        assert.equal((await state()).sources[0].source,fixtureSources['yaml-settings']);
        const yaml=fixtureSources['yaml-settings'].replace('50','75'); await writeFile(yamlLaunch.file,yaml);
        await dialog.getByRole('button',{name:saveLabel,exact:true}).click(); await expect(dialog).toBeHidden({timeout:30000});
        assert.equal((await state()).sources[0].source,yaml); assert.equal((await state()).projected,null);
        stage='json-edit';
        const jsonDialog = await open('document-json');
        await expect(jsonDialog.getByRole('tab', {name: 'JSONテキスト', exact: true})).toHaveAttribute('aria-selected', 'true');
        await expect(jsonDialog.locator('#twpe-yaml-preview')).toHaveValue(fixtureSources['json-settings'].replace(/\r\n/gu,'\n'));
        const jsonLaunch = await editExternally(jsonDialog, 2);
        assert.equal(path.basename(jsonLaunch.file),'settings.json'); assert.equal(jsonLaunch.profile.format,'json');
        const json=fixtureSources['json-settings'].replace('day','night'); await writeFile(jsonLaunch.file,json);
        await jsonDialog.getByRole('button',{name:saveLabel,exact:true}).click(); await expect(jsonDialog).toBeHidden({timeout:30000});
        assert.equal((await state()).sources[1].source,json);
        await page.screenshot({path:path.join(output,'02-json-saved.png')});
        stage='save';
        // The File menu always downloads; the menu-bar shortcut can sit under the extension status panel.
        await page.getByText('ファイル',{exact:true}).click();
        const pending=page.waitForEvent('download'); await page.getByRole('listitem').filter({hasText:/^コンピューターに保存する$/}).click();
        const saved=path.join(output,'document-source-edited.sb3'); await (await pending).saveAs(saved);
        const zip=await JSZip.loadAsync(await readFile(saved)), savedProject=JSON.parse(await zip.file('project.json').async('string'));
        assert.equal(documents(savedProject)['yaml-settings'].source,yaml); assert.equal(documents(savedProject)['json-settings'].source,json);
        assert.equal(documents(savedProject)['yaml-settings'].format,'yaml'); assert.equal(documents(savedProject)['json-settings'].format,'json');
        assert.deepEqual(omitDocuments(savedProject),omitDocuments(original));
        const initialZip=await JSZip.loadAsync(await readFile(fixture)); const assets=Object.keys(initialZip.files).filter(name=>name!=='project.json'&&!initialZip.files[name].dir);
        assert(assets.length > 0, 'The fixture must contain assets to preserve.');
        for(const name of assets) assert.equal(sha(await zip.file(name).async('nodebuffer')),sha(await initialZip.file(name).async('nodebuffer')));
        stage='reload'; await copyFile(saved,path.join(site,'static/document-source-saved.sb3'));
        const reload=await context.newPage();
        await load(reload,'document-source-saved.sb3');
        const sources=await reload.evaluate(()=>window.vm.runtime[Symbol.for('twpe.document-source.fixture')].store.list());
        assert.equal(sources[0].source,yaml); assert.equal(sources[1].source,json);
        await reload.evaluate(()=>window.vm.stopAll());
        assert.equal(await reload.evaluate(()=>window.vm.runtime[Symbol.for('twpe.document-source.fixture')].store.read('yaml-settings').source),yaml);
        assert.deepEqual(errors,[]);
        await writeFile(path.join(output,'result.json'),JSON.stringify({result:'passed',fixtureSHA256:sha(await readFile(fixture)),fourRealPackages:true,sourceTextCommentsCRLFPreserved:true,projectionClearsOnStop:true,sourceSurvivesStop:true,previewDoesNotLaunchOrMutate:true,invalidSchemaRetained:true,formatsIsolated:true,nonDocumentProjectDataPreserved:true,assetEntriesPreserved:assets.length,reloaded:true,launcher:'injected here; real VSCode proof separate',greenFlagExecuted:false,errors},null,2));
    }catch(error){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});await writeFile(path.join(output,'failure.json'),JSON.stringify({stage,message:error.message,errors},null,2));throw error;}
    finally{await browser.close();await host.close();}
});
