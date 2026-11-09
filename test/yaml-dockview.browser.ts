import {verifyWebEditor} from '../scripts/site/editor-revision.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {chromium, expect, type Locator, type Page} from '@playwright/test';
import JSZip from '@turbowarp/jszip';
import selectBackdrop from './fixtures/select-backdrop.ts';
import {startYamlEditorHost} from '../scripts/yaml-editor/host.ts';

test('same-named project YAML documents retain drafts across Dockview moves and round-trip in SB3', {timeout: 180000}, async t => {
    const site = process.env.TWPE_YAML_SITE, fixture = process.env.TWPE_YAML_FIXTURE;
    assert(site && fixture);
    await verifyWebEditor(site);
    const dataDirectory = await mkdtemp(path.join(tmpdir(), 'twpe-dockview-yaml-'));
    t.after(() => rm(dataDirectory, {recursive: true, force: true}));
    const host = await startYamlEditorHost({siteDirectory: site, dataDirectory});
    t.after(() => host.close());
    const browser = await chromium.launch({executablePath: process.env.TWPE_CHROME_EXECUTABLE});
    t.after(() => browser.close());
    const context = await browser.newContext({viewport: {width: 1440, height: 1000}, locale: 'ja-JP', acceptDownloads: true});
    context.setDefaultTimeout(8000);
    await context.addInitScript(() => { delete window.showSaveFilePicker; });
    const errors: string[] = [];
    context.on('page', p => p.on('pageerror', error => errors.push(error.message)));
    const base = `${host.apiOrigin}/turbowarp-plus-editor/`;
    const projectUrl = base + 'static/dockview-documents.sb3';
    const original = await readFile(fixture);
    let archive = original;
    await context.route(projectUrl, route => route.fulfill({body: archive, contentType: 'application/octet-stream'}));

    const hats = (page: Page) => page.locator('[data-twpe-yaml-hat-icon]');
    const workspace = (page: Page) => page.locator('[data-multi-view] .dockview-theme-light');
    const backdropTab = (page: Page) =>
        page.locator('.dv-tab').and(page.getByRole('tab', {name: '背景', exact: true}));
    const documentTitle = (id: string) => `settings.yml (twpeyamlsettings / ${id})`;
    const docTab = (page: Page, id: string) => workspace(page).getByRole('tab', {name: documentTitle(id), exact: true});
    const docPanel = (page: Page, id: string) => workspace(page).locator(
        `.tw-plus-document-slot[data-provider-id="twpeyamlsettings"][data-document-id="${id}"]`
    );
    const source = (page: Page, id: string) => docPanel(page, id).locator('.twpe-yaml-source-preview textarea');
    const committed = (page: Page) => page.evaluate(() => window.vm.runtime.extensionStorage.twpeyamlsettings.documents);
    const confirm = (page: Page) => page.locator('.twpe-yaml-confirmation:modal');
    async function load(page: Page, rollback = false) {
        const url = new URL('editor.html', base);
        url.searchParams.set('lang', 'ja');
        url.searchParams.set('project_url', projectUrl);
        // The edge handle appears only without the menu bar launcher, which editor-layout.browser.ts tests.
        url.searchParams.set('twPlusStageLauncher', '0');
        if (rollback) url.searchParams.set('twPlusDockview', '0');
        await page.goto(url.href);
        const security = page.getByRole('dialog').filter({has: page.locator('.twextsec-review')});
        await security.waitFor({timeout: 60000});
        await security.locator('.twextsec-bulk').getByRole('radio', {name: 'サンドボックスなしで', exact: true}).click();
        await security.getByRole('button', {name: 'OK', exact: true}).click();
        await security.waitFor({state: 'hidden'});
        await selectBackdrop(page);
        await expect(hats(page)).toHaveCount(2, {timeout: 60000});
    }
    async function open(page: Page, index: number, id: string) {
        await hats(page).nth(index).focus();
        await page.keyboard.press('Enter');
        await expect(docTab(page, id)).toBeVisible();
        await expect(source(page, id)).toBeEditable();
    }
    async function drag(tab: Locator, destination: Locator, split: boolean) {
        const bounds = await destination.boundingBox();
        assert(bounds);
        await tab.dragTo(destination, {
            targetPosition: {x: bounds.width / 2, y: split ? bounds.height - 12 : bounds.height / 2}
        });
    }
    async function saveAndClose(page: Page, id: string) {
        await confirm(page).getByRole('button', {name: '保存して閉じる', exact: true}).click();
        await expect(docTab(page, id)).toHaveCount(0);
    }

    const page = await context.newPage();
    await load(page);
    const initial = await committed(page);
    const codeTab = backdropTab(page);
    const groups = workspace(page).locator('.dv-groupview');
    const codeGroup = groups.filter({has: codeTab});
    const groupFor = (id: string) => groups.filter({has: page.getByRole('tab', {name: documentTitle(id), exact: true})});

    await page.getByRole('button', {name: 'ステージを展開', exact: true}).hover();
    const stageDisplay = page.getByRole('menuitem', {name: 'ステージをタブで開く', exact: true});
    const stageMenu = page.getByRole('button', {name: 'ステージの表示', exact: true});
    await stageMenu.click();
    await stageDisplay.click();
    const stage = workspace(page).locator('.tw-plus-dockview-stage-slot [data-gui-stage] canvas').first();
    await expect(stage).toBeVisible();

    await codeTab.click();
    await open(page, 0, 'settings');
    await expect(source(page, 'settings')).toHaveValue(initial.settings);
    const invalid = 'volume: 150\nmode: production\n';
    const settings = 'volume: 75\nmode: production\n';
    const labels = 'title: Chapter 2\n';
    await source(page, 'settings').fill(invalid);
    await codeTab.click();
    await open(page, 1, 'labels');
    await expect(source(page, 'labels')).toHaveValue(initial.labels);
    await source(page, 'labels').fill(labels);
    await codeTab.click();
    await open(page, 0, 'settings');
    await expect(docTab(page, 'settings')).toHaveCount(1);
    await expect(source(page, 'settings')).toHaveValue(invalid);
    assert.deepEqual(await committed(page), initial);

    await codeTab.click();
    await expect(docPanel(page, 'settings')).toBeHidden();
    await expect(docPanel(page, 'labels')).toBeHidden();
    await docTab(page, 'settings').click();
    await drag(docTab(page, 'settings'), docPanel(page, 'settings'), true);
    await expect(groups).toHaveCount(3);
    await expect.poll(async () => (await groupFor('settings').boundingBox())?.y)
        .toBeGreaterThan((await codeGroup.boundingBox()).y);
    await expect(source(page, 'settings')).toHaveValue(invalid);
    await drag(docTab(page, 'labels'), docPanel(page, 'settings'), false);
    await expect(groupFor('settings').getByRole('tab', {name: documentTitle('labels'), exact: true})).toBeVisible();
    await expect(source(page, 'labels')).toHaveValue(labels);
    await expect(stage).toBeVisible();

    const layoutMenu = groupFor('labels').getByRole('button', {name: '編集パネルのレイアウト', exact: true});
    await layoutMenu.click();
    await expect(page.getByRole('menuitem', {name: 'この分割パネルを閉じる', exact: true})).toBeDisabled();
    await layoutMenu.click();
    await docTab(page, 'settings').click();
    await docTab(page, 'labels').hover();
    await docTab(page, 'labels').locator('.dv-default-tab-action').click();
    await expect(confirm(page)).toBeVisible();
    await confirm(page).getByRole('button', {name: 'Cancel', exact: true}).click();
    await docTab(page, 'labels').click();
    await expect(source(page, 'labels')).toHaveValue(labels);
    await docTab(page, 'labels').press('Delete');
    await expect(confirm(page)).toBeVisible();
    await confirm(page).getByRole('button', {name: '破棄して閉じる', exact: true}).click();
    await expect(docTab(page, 'labels')).toHaveCount(0);

    await docTab(page, 'settings').click();
    await expect(source(page, 'settings')).toHaveValue(invalid);
    await docTab(page, 'settings').locator('.dv-default-tab-action').click();
    await confirm(page).getByRole('button', {name: '保存して閉じる', exact: true}).click();
    await expect(docPanel(page, 'settings').getByRole('alert')).toContainText('JSON Schema validation failed');
    await expect(source(page, 'settings')).toHaveValue(invalid);
    assert.deepEqual(await committed(page), initial);
    await source(page, 'settings').fill(settings);
    await docTab(page, 'settings').locator('.dv-default-tab-action').click();
    await saveAndClose(page, 'settings');
    assert.deepEqual(await committed(page), {...initial, settings});

    await codeTab.click();
    await open(page, 1, 'labels');
    await expect(source(page, 'labels')).toHaveValue(initial.labels);
    await source(page, 'labels').fill(labels);
    await docTab(page, 'labels').locator('.dv-default-tab-action').click();
    await saveAndClose(page, 'labels');

    await page.getByText('ファイル', {exact: true}).click();
    const pending = page.waitForEvent('download');
    await page.getByRole('button', {name: '名前を変えて保存…', exact: true}).click(); await page.getByRole('dialog', {name: '名前を変えて保存'}).getByRole('button', {name: '保存', exact: true}).click();
    archive = await readFile(await (await pending).path());
    const saved = await JSZip.loadAsync(archive);
    const project = JSON.parse(await saved.file('project.json').async('string'));
    assert.deepEqual(project.extensionStorage.twpeyamlsettings.documents, {settings, labels});
    const originalZip = await JSZip.loadAsync(original);
    for (const [name, entry] of Object.entries(originalZip.files)) {
        if (!entry.dir && name !== 'project.json') {
            assert.deepEqual(await saved.file(name).async('nodebuffer'), await entry.async('nodebuffer'));
        }
    }
    const reloaded = await context.newPage();
    await load(reloaded);
    assert.deepEqual(await committed(reloaded), {settings, labels});
    await open(reloaded, 0, 'settings');
    await expect(source(reloaded, 'settings')).toHaveValue(settings);
    await backdropTab(reloaded).click();
    await open(reloaded, 1, 'labels');
    await expect(source(reloaded, 'labels')).toHaveValue(labels);

    const rolledBack = await context.newPage();
    await load(rolledBack, true);
    await expect(rolledBack.locator('[data-multi-view]')).toHaveCount(0);
    await hats(rolledBack).first().focus();
    await rolledBack.keyboard.press('Enter');
    const legacy = rolledBack.locator('dialog.twpe-yaml-window:modal');
    await expect(legacy.locator('#twpe-yaml-preview')).toHaveValue(settings);
    await legacy.locator('#twpe-yaml-document').selectOption(JSON.stringify(['twpeyamlsettings', 'labels']));
    await expect(legacy.locator('#twpe-yaml-preview')).toHaveValue(labels);
    assert.deepEqual(errors, []);
});
