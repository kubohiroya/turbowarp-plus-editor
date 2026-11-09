import {verifyWebEditor} from '../scripts/site/editor-revision.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {chromium, expect, type Page} from '@playwright/test';
import selectBackdrop from './fixtures/select-backdrop.ts';
import {startYamlEditorHost} from '../scripts/yaml-editor/host.ts';

const storageKey = 'twPlusDockviewLayout';
const provider = 'twpeyamlsettings';
const title = (id: string) => `settings.yml (${provider} / ${id})`;
const dockview = (page: Page) => page.locator('[data-multi-view] .dockview-theme-light');
const tab = (page: Page, name: string) =>
    dockview(page).locator('.dv-tab').and(page.getByRole('tab', {name, exact: true}));
const panel = (page: Page, id: string) => dockview(page).locator(`.tw-plus-document-slot[data-document-id="${id}"]`);
const readStorage = (page: Page) => page.evaluate(key => localStorage.getItem(key), storageKey);

function readGroups(page: Page) {
    return dockview(page).locator('.dv-groupview').evaluateAll(groups => groups.map(group => {
        const {x, y, width, height} = group.getBoundingClientRect();
        const tabs = [...group.querySelectorAll('.dv-tab')];
        return {
            tabs: tabs.map(tab => tab.getAttribute('aria-label')),
            selected: tabs.find(tab => tab.getAttribute('aria-selected') === 'true')?.getAttribute('aria-label'),
            bounds: [x, y, width, height].map(value => Math.round(value))
        };
    }).sort((a, b) => a.tabs.join().localeCompare(b.tabs.join())));
}

test('Dockview restores reordered tabs, split geometry and selected panels from a restarted browser', {timeout: 180000}, async t => {
    const site = process.env.TWPE_YAML_SITE, fixture = process.env.TWPE_YAML_FIXTURE;
    assert(site && fixture);
    await verifyWebEditor(site);
    const directory = await mkdtemp(path.join(tmpdir(), 'twpe-dockview-restore-'));
    const host = await startYamlEditorHost({siteDirectory: site, dataDirectory: path.join(directory, 'work')});
    const bytes = await readFile(fixture);
    const projectUrl = host.apiOrigin + '/turbowarp-plus-editor/static/dockview-restore.sb3';
    const url = new URL('/turbowarp-plus-editor/editor.html', host.apiOrigin);
    url.searchParams.set('lang', 'ja');
    url.searchParams.set('project_url', projectUrl);
    // The edge handle appears only without the menu bar launcher, which editor-layout.browser.ts tests.
    url.searchParams.set('twPlusStageLauncher', '0');
    let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>>;
    t.after(async () => {
        await context?.close();
        await host.close();
        await rm(directory, {recursive: true, force: true});
    });
    async function start() {
        context = await chromium.launchPersistentContext(path.join(directory, 'profile'), {
            executablePath: process.env.TWPE_CHROME_EXECUTABLE, viewport: {width: 1440, height: 1000}, locale: 'ja-JP'
        });
        await context.route(projectUrl, route => route.fulfill({body: bytes, contentType: 'application/octet-stream'}));
        return context.pages()[0];
    }
    async function load(page: Page, rollback = false) {
        const target = new URL(url);
        if (rollback) target.searchParams.set('twPlusDockview', '0');
        await page.goto(target.href);
        const security = page.getByRole('dialog').filter({has: page.locator('.twextsec-review')});
        await security.waitFor({timeout: 60000});
        await security.locator('.twextsec-bulk').getByRole('radio', {name: 'サンドボックスなしで', exact: true}).click();
        await security.getByRole('button', {name: 'OK', exact: true}).click();
        await security.waitFor({state: 'hidden'});
    }
    async function open(page: Page, index: number, id: string) {
        await page.locator('[data-twpe-yaml-hat-icon]').nth(index).focus();
        await page.keyboard.press('Enter');
        await expect(panel(page, id).locator('textarea')).toBeEditable();
    }

    let page = await start();
    await load(page);
    await selectBackdrop(page);
    await expect(page.locator('[data-twpe-yaml-hat-icon]')).toHaveCount(2);
    const stageName = await page.evaluate(() => window.vm.editingTarget.getName());
    const backdrop = tab(page, '背景');
    const sprite = await page.evaluate(() => window.vm.runtime.targets.find(target => !target.isStage).getName());

    await page.getByRole('button', {name: 'ステージを展開', exact: true}).hover();
    await page.getByRole('button', {name: 'ステージの表示', exact: true}).click();
    await page.getByRole('menuitem', {name: 'ステージをタブで開く', exact: true}).click();
    await backdrop.click();
    await open(page, 0, 'settings');
    const workspace = dockview(page);
    const groups = workspace.locator('.dv-groupview');
    const body = panel(page, 'settings');
    const bounds = await body.boundingBox();
    assert(bounds);
    await tab(page, title('settings')).dragTo(body, {targetPosition: {x: bounds.width / 2, y: bounds.height - 12}});
    await expect(groups).toHaveCount(3);

    await backdrop.click();
    await open(page, 1, 'labels');
    const tabList = backdrop.locator('..');
    const order = () => tabList.locator('.dv-tab').evaluateAll(tabs => tabs.map(tab => tab.getAttribute('aria-label')));
    const original = await order();
    await tab(page, title('labels')).dragTo(backdrop, {targetPosition: {x: 14, y: 14}});
    await expect.poll(order).not.toEqual(original);
    await expect(groups).toHaveCount(3);
    await tab(page, title('labels')).click();
    await tab(page, title('settings')).click();

    const beforeResize = await readGroups(page);
    for (const sash of await workspace.locator('.dv-sash:visible').all()) {
        const rect = await sash.boundingBox();
        assert(rect);
        const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + (rect.height > rect.width ? 108 : 0), y + (rect.width > rect.height ? 86 : 0), {steps: 8});
        await page.mouse.up();
    }
    await expect.poll(() => readGroups(page)).not.toEqual(beforeResize);
    await expect(panel(page, 'settings').locator('textarea')).toHaveValue('volume: 50\nmode: rehearsal\n');
    const savedGroups = await readGroups(page);
    assert.deepEqual(savedGroups.map(group => group.selected).sort(), ['ステージ', title('labels'), title('settings')].sort());
    await expect.poll(async () => {
        const data = JSON.parse(await readStorage(page) ?? 'null');
        return data?.panels && Object.values(data.panels).filter((panel: any) => panel.kind === 'document').length;
    }).toBe(2);
    const saved = JSON.parse(await readStorage(page));
    assert.equal(saved.panels[saved.editingView].name, stageName);
    await context.close();

    page = await start();
    await load(page);
    await expect.poll(async () => (await readGroups(page)).map(group => ({tabs: group.tabs, selected: group.selected})))
        .toEqual(savedGroups.map(group => ({tabs: group.tabs, selected: group.selected})));
    const pin = page.getByRole('button', {name: 'スプライト一覧を固定表示', exact: true});
    if (!await pin.isVisible()) await page.getByRole('button', {name: 'スプライト一覧を展開', exact: true}).hover();
    if (await pin.getAttribute('aria-pressed') === 'false') await pin.click();
    await expect.poll(async () => (await readGroups(page)).flatMap((group, index) =>
        group.bounds.map((value, dimension) => Math.abs(value - savedGroups[index].bounds[dimension])))
        .reduce((max, value) => Math.max(max, value), 0))
        .toBeLessThanOrEqual(2);
    await expect(panel(page, 'settings').locator('textarea')).toHaveValue('volume: 50\nmode: rehearsal\n');
    await expect(panel(page, 'labels').locator('textarea')).toHaveValue('title: Chapter 1\n');
    await expect(dockview(page).locator('.dv-groupview.dv-active-group').getByRole('tab', {
        name: title('settings'), selected: true, exact: true
    })).toBeVisible();
    assert.equal(await page.evaluate(() => window.vm.editingTarget.getName()), stageName);
    assert.equal(JSON.parse(await readStorage(page)).activeGroup, saved.activeGroup);

    const rollback = await context.newPage();
    const prior = await readStorage(page);
    await load(rollback, true);
    await expect(dockview(rollback)).toHaveCount(0);
    await selectBackdrop(rollback);
    await rollback.locator('[data-twpe-yaml-hat-icon]').first().focus();
    await rollback.keyboard.press('Enter');
    await expect(rollback.locator('dialog.twpe-yaml-window:modal #twpe-yaml-preview')).toHaveValue('volume: 50\nmode: rehearsal\n');
    assert.equal(await readStorage(rollback), prior);

    for (const invalid of ['{broken', JSON.stringify({...saved, activeGroup: 'missing'})]) {
        const fresh = await context.newPage();
        await fresh.addInitScript(({key, value}) => localStorage.setItem(key, value), {key: storageKey, value: invalid});
        await load(fresh);
        await expect(dockview(fresh).locator('.dv-groupview')).toHaveCount(1);
        await expect(tab(fresh, sprite)).toHaveAttribute('aria-selected', 'true');
        await expect(tab(fresh, title('settings'))).toHaveCount(0);
        await expect(tab(fresh, 'ステージ')).toHaveCount(0);
        await fresh.close();
    }
});
