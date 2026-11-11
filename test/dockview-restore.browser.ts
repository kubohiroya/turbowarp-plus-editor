import {verifyWebEditor} from '../scripts/site/editor-revision.ts';
import {test, type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {chromium, expect, type Page} from '@playwright/test';
import selectBackdrop from './fixtures/select-backdrop.ts';
import {startYamlEditorHost} from '../scripts/yaml-editor/host.ts';

const provider = 'twpeyamlsettings';
const title = (id: string) => `settings.yml (${provider} / ${id})`;
const dockview = (page: Page) => page.locator('[data-multi-view] .dockview-theme-light');
const tab = (page: Page, name: string) =>
    dockview(page).locator('.dv-tab').and(page.getByRole('tab', {name, exact: true}));
const panel = (page: Page, id: string) => dockview(page).locator(`.tw-plus-document-slot[data-document-id="${id}"]`);

/** The record of the project opened last, from the IndexedDB the editor keeps layouts in. */
const readRecord = (page: Page) => page.evaluate(async () => {
    if (!(await indexedDB.databases()).some(database => database.name === 'twPlusWorkspaceLayout')) return null;
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('twPlusWorkspaceLayout');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    try {
        const records = await new Promise<{layout: string; lastUsedAt: number}[]>((resolve, reject) => {
            const request = database.transaction('layouts').objectStore('layouts').getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        return records.sort((a, b) => b.lastUsedAt - a.lastUsedAt)[0] ?? null;
    } finally {
        database.close();
    }
});
const readStorage = async (page: Page) => (await readRecord(page))?.layout ?? null;
/** Wait until the restored layout and every change are written to IndexedDB. */
const layoutSettled = (page: Page) =>
    expect(page.locator('[data-workspace-layout]')).toHaveAttribute('data-workspace-layout', 'settled');
/** Replace the saved layout of a project, keeping the record that finds it. */
const writeRecord = (page: Page, record: object) => page.evaluate(async value => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('twPlusWorkspaceLayout');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    try {
        await new Promise<void>((resolve, reject) => {
            const transaction = database.transaction('layouts', 'readwrite');
            transaction.objectStore('layouts').put(value);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    } finally {
        database.close();
    }
}, record);

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

async function restartableEditor(t: TestContext, prefix: string) {
    const site = process.env.TWPE_YAML_SITE, fixture = process.env.TWPE_YAML_FIXTURE;
    assert(site && fixture);
    await verifyWebEditor(site);
    const directory = await mkdtemp(path.join(tmpdir(), prefix));
    const host = await startYamlEditorHost({siteDirectory: site, dataDirectory: path.join(directory, 'work')});
    const bytes = await readFile(fixture);
    const projectUrl = host.apiOrigin + '/turbowarp-plus-editor/static/dockview-restore.sb3';
    const url = new URL('/turbowarp-plus-editor/editor.html', host.apiOrigin);
    url.searchParams.set('lang', 'ja');
    url.searchParams.set('project_url', projectUrl);
    // The edge handle appears only without the menu bar launcher, which editor-layout.browser.ts tests.
    url.searchParams.set('twPlusStageLauncher', '0');
    const session = {context: undefined as Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined,
        async start() {
            session.context = await chromium.launchPersistentContext(path.join(directory, 'profile'), {
                executablePath: process.env.TWPE_CHROME_EXECUTABLE, viewport: {width: 1440, height: 1000}, locale: 'ja-JP'
            });
            await session.context.route(projectUrl, route => route.fulfill({body: bytes, contentType: 'application/octet-stream'}));
            return session.context.pages()[0];
        },
        async load(page: Page, rollback = false) {
            const target = new URL(url);
            if (rollback) target.searchParams.set('twPlusDockview', '0');
            await page.goto(target.href);
            const security = page.getByRole('dialog').filter({has: page.locator('.twextsec-review')});
            await security.waitFor({timeout: 60000});
            await security.locator('.twextsec-bulk').getByRole('radio', {name: 'サンドボックスなしで', exact: true}).click();
            await security.getByRole('button', {name: 'OK', exact: true}).click();
            await security.waitFor({state: 'hidden'});
        }};
    t.after(async () => {
        await session.context?.close();
        await host.close();
        await rm(directory, {recursive: true, force: true});
    });
    return session;
}

test('Dockview restores reordered tabs, split geometry and selected panels from a restarted browser', {timeout: 180000}, async t => {
    const session = await restartableEditor(t, 'twpe-dockview-restore-');
    const start = () => session.start();
    const load = (page: Page, rollback = false) => session.load(page, rollback);
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
    await layoutSettled(page);
    const saved = JSON.parse(await readStorage(page));
    assert.equal(Object.values(saved.panels).filter((panel: any) => panel.kind === 'document').length, 2);
    assert.equal(saved.panels[saved.editingView].name, stageName);
    await session.context!.close();

    page = await start();
    await load(page);
    await layoutSettled(page);
    assert.deepEqual((await readGroups(page)).map(group => ({tabs: group.tabs, selected: group.selected})),
        savedGroups.map(group => ({tabs: group.tabs, selected: group.selected})));
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
    await layoutSettled(page);
    assert.equal(JSON.parse(await readStorage(page)).activeGroup, saved.activeGroup);

    const rollback = await session.context!.newPage();
    const prior = await readStorage(page);
    await load(rollback, true);
    await expect(dockview(rollback)).toHaveCount(0);
    await selectBackdrop(rollback);
    await rollback.locator('[data-twpe-yaml-hat-icon]').first().focus();
    await rollback.keyboard.press('Enter');
    await expect(rollback.locator('dialog.twpe-yaml-window:modal #twpe-yaml-preview')).toHaveValue('volume: 50\nmode: rehearsal\n');
    assert.equal(await readStorage(rollback), prior);

    const record = await readRecord(page);
    for (const invalid of ['{broken', JSON.stringify({...saved, activeGroup: 'missing'})]) {
        await writeRecord(page, {...record, layout: invalid});
        const fresh = await session.context!.newPage();
        await load(fresh);
        await expect(dockview(fresh).locator('.dv-groupview')).toHaveCount(1);
        await expect(tab(fresh, sprite)).toHaveAttribute('aria-selected', 'true');
        await expect(tab(fresh, title('settings'))).toHaveCount(0);
        await expect(tab(fresh, 'ステージ')).toHaveCount(0);
        await fresh.close();
    }
});

test('a panel in a separate window is restored docked and reopens only when asked', {timeout: 180000}, async t => {
    const session = await restartableEditor(t, 'twpe-dockview-popout-');
    let page = await session.start();
    await session.load(page);
    // The security review closes before the VM has installed the project's targets.
    const sprite = await (await page.waitForFunction(() =>
        window.vm.runtime.targets.find(target => !target.isStage)?.getName(), undefined, {timeout: 60000})).jsonValue();
    const openInWindow = async () => {
        await tab(page, sprite).click();
        await dockview(page).locator('.dv-groupview.dv-active-group .tw-plus-sprite-layout-menu-trigger').click();
        const [child] = await Promise.all([session.context!.waitForEvent('page'),
            page.getByRole('menuitem', {name: 'パネルを別画面で開く', exact: true}).click()]);
        await child.waitForLoadState();
        await expect(tab(page, sprite)).toHaveCount(0);
        return child;
    };
    const savedWindow = async () => {
        const data = JSON.parse(await readStorage(page) ?? 'null');
        const id = Object.keys(data?.panels ?? {}).find(key => data.panels[key].name === sprite);
        return data?.popouts?.find((popout: {panels: string[]}) => popout.panels.includes(id));
    };

    await openInWindow();
    await layoutSettled(page);
    expect(await savedWindow()).toMatchObject({position: {width: expect.any(Number), height: expect.any(Number)}});
    await session.context!.close();

    page = await session.start();
    await session.load(page);
    await expect(tab(page, sprite)).toBeVisible();
    // Windows are not opened without the user, so a popup blocker cannot drop them.
    await layoutSettled(page);
    assert.equal(session.context!.pages().length, 1);
    assert.ok(await savedWindow());

    const child = await openInWindow();
    await child.close();
    await expect(tab(page, sprite)).toBeVisible();
});
