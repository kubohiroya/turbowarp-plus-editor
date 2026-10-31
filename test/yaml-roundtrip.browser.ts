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

const component = project => project.extensionStorage.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4;
const digest = value => createHash('sha256').update(value).digest('hex');
const withoutDocument = project => {
    const value = structuredClone(project);
    delete component(value).source;
    delete component(value).artifact;
    return value;
};

// The native process is replaced only in this deterministic browser regression.
// A separate real-VSCode proof exercises the production launcher and desktop save.
test('real Editor VM imports YAML, preserves assets, saves SB3, reloads it, and invalidates an old session', {timeout: 180000}, async () => {
    const inputSite = process.env.TWPE_YAML_SITE;
    const fixture = process.env.TWPE_YAML_FIXTURE;
    assert(inputSite && path.isAbsolute(inputSite), 'TWPE_YAML_SITE must name an owned Editor build.');
    assert(fixture && path.isAbsolute(fixture), 'TWPE_YAML_FIXTURE must name an embedded-YAML SB3.');
    const output = process.env.TWPE_YAML_EVIDENCE || await mkdtemp(path.join(tmpdir(), 'twpe-yaml-evidence-'));
    await mkdir(output, {recursive: true});
    const owned = await mkdtemp(path.join(tmpdir(), 'twpe-yaml-roundtrip-'));
    const site = path.join(owned, 'site');
    await cp(inputSite, site, {recursive: true});
    await copyFile(fixture, path.join(site, 'static/yaml-roundtrip.sb3'));
    const files = [];
    const host = await startYamlEditorHost({siteDirectory: site, dataDirectory: path.join(owned, 'work'), launchEditor: async file => { files.push(file); }});
    const browser = await chromium.launch({headless: true, ...(process.env.TWPE_CHROME_EXECUTABLE ? {executablePath: process.env.TWPE_CHROME_EXECUTABLE} : {})});
    const errors = [];
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}, locale: 'ja-JP', acceptDownloads: true});
    page.on('pageerror', (error: Error & {code?: string; status?: number; errors?: Error[]}) => errors.push(error.message));
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
            await expect(p.locator('[data-twpe-yaml-hat-icon]')).toHaveCount(1, {timeout: 60000});
            await expect(p.locator('[data-twpe-yaml-hat-icon]')).toHaveAttribute('aria-disabled', 'false');
            assert.equal(await p.locator('.twpe-yaml-toolbar').count(), 0, 'The standard menu must not have an added toolbar.');
        }
        await load(page, 'yaml-roundtrip.sb3');
        await page.locator('[data-twpe-yaml-hat-icon]').click();
        const dialog = page.getByRole('dialog', {name: '組み込みYAML文書', exact: true});
        const original = await page.evaluate(() => JSON.parse(window.vm.toJSON()));
        await expect(dialog).toContainText('VSCodeで文書を保存してから');
        assert.equal(files.length, 1);
        assert.equal(await readFile(files[0], 'utf8'), component(original).source.text);
        stage = 'invalid-source';
        await writeFile(files[0], 'kamishibai: [broken');
        await dialog.getByRole('button', {name: '変更を取り込む', exact: true}).click();
        await expect(dialog.getByRole('alert')).toContainText('変更を取り込めませんでした');
        assert.equal(await page.evaluate(() => JSON.parse(window.vm.toJSON()).extensionStorage.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4.source.text), component(original).source.text);
        await expect(dialog.getByRole('button', {name: 'SB3を保存', exact: true})).toBeDisabled();
        stage = 'valid-source';
        const edited = `${component(original).source.text}\n# Browser roundtrip preserves the embedded document.\n`;
        await writeFile(files[0], edited);
        await dialog.getByRole('button', {name: '変更を取り込む', exact: true}).click();
        await expect(dialog).toContainText('変更を取り込みました。', {timeout: 30000});
        await page.screenshot({path: path.join(output, 'imported.png')});
        const pending = page.waitForEvent('download');
        await dialog.getByRole('button', {name: 'SB3を保存', exact: true}).click();
        const saved = path.join(output, 'edited.sb3');
        await (await pending).saveAs(saved);
        const archive = await JSZip.loadAsync(await readFile(saved));
        const savedProject = JSON.parse(await archive.file('project.json').async('string'));
        assert.equal(component(savedProject).source.text, edited);
        assert.notEqual(component(savedProject).source.integrity, component(original).source.integrity);
        assert.equal(component(savedProject).artifact.sourceIntegrity, component(savedProject).source.integrity);
        assert(isDeepStrictEqual(withoutDocument(savedProject), withoutDocument(original)), 'Non-document project data must match normal VM serialization.');
        const initialArchive = await JSZip.loadAsync(await readFile(fixture));
        const assets = Object.keys(initialArchive.files).filter(name => name !== 'project.json' && !initialArchive.files[name].dir);
        for (const name of assets) assert.equal(digest(await archive.file(name).async('nodebuffer')), digest(await initialArchive.file(name).async('nodebuffer')));
        stage = 'reload';
        await copyFile(saved, path.join(site, 'static/yaml-saved.sb3'));
        const reload = await browser.newPage({viewport: {width: 1440, height: 1000}, locale: 'ja-JP'});
        reload.on('pageerror', (error: Error & {code?: string; status?: number; errors?: Error[]}) => errors.push(error.message));
        await load(reload, 'yaml-saved.sb3');
        assert.equal(await reload.evaluate(() => JSON.parse(window.vm.toJSON()).extensionStorage.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4.source.text), edited);
        await reload.locator('[data-twpe-yaml-hat-icon]').click();
        await expect(reload.locator('#twpe-yaml-preview')).toHaveValue(edited);
        await reload.screenshot({path: path.join(output, 'reloaded.png')});
        stage = 'replacement';
        const reloadDialog = reload.getByRole('dialog', {name: '組み込みYAML文書', exact: true});
        await expect(reloadDialog).toContainText('VSCodeで文書を保存してから');
        await reload.evaluate(async url => window.vm.loadProject(await (await fetch(url)).arrayBuffer()), `${base}static/yaml-roundtrip.sb3`);
        await expect(reloadDialog).toContainText('作品が切り替わったため', {timeout: 30000});
        await expect(reloadDialog.getByRole('button', {name: '変更を取り込む', exact: true})).toBeDisabled();
        assert.equal(await reload.evaluate(() => JSON.parse(window.vm.toJSON()).extensionStorage.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4.source.text), component(original).source.text);
        assert.deepEqual(errors, []);
        await writeFile(path.join(output, 'result.json'), JSON.stringify({result: 'passed', browser: browser.version(), nativeLauncher: 'injected for deterministic test; separate native proof required', fixtureSHA256: digest(await readFile(fixture)), preservedProjectData: true, preservedAssetEntries: assets.length, descriptorIntegrityUpdated: true, reloaded: true, invalidYamlRetained: true, replacementInvalidated: true, greenFlagExecuted: false, errors}, null, 2));
    } catch (error) {
        await page.screenshot({path: path.join(output, 'failure.png')}).catch(() => {});
        await writeFile(path.join(output, 'failure.json'), JSON.stringify({stage, message: error.message, errors}, null, 2));
        throw error;
    } finally { await browser.close(); await host.close(); }
});
