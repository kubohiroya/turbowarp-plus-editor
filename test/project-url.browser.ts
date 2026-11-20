import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chromium, expect} from '@playwright/test';
import JSZip from '@turbowarp/jszip';

const base = process.env.E2E_PROJECT_URL_BASE;
const ready = page => page.waitForFunction(() => (window as any).vm?.runtime.getTargetForStage() &&
    (window as any).ReduxStore?.getState().scratchGui.projectState.loadingState.startsWith('SHOWING_'));
async function openURLMenu(page, context) {
    await page.getByText('ファイル', {exact: true}).click();
    const local = page.getByText('SB3ファイルを開く…', {exact: true});
    const remote = page.getByText('SB3ファイルのURLを開く…', {exact: true});
    assert.ok((await remote.boundingBox())!.y > (await local.boundingBox())!.y);
    const opening = context.waitForEvent('page');
    await remote.click();
    const next = await opening;
    await expect(next.locator('[data-project-url-dialog]')).toBeVisible({timeout: 45000});
    assert.equal(await next.evaluate(() => window.opener === null), true);
    return next;
}
const dialogFor = page => page.locator('[data-project-url-dialog]');

async function editor(t) {
    assert.ok(base, 'Set E2E_PROJECT_URL_BASE to the locally built Editor server');
    const browser = await chromium.launch({headless: true, args: ['--enable-unsafe-swiftshader']});
    t.after(() => browser.close());
    const context = await browser.newContext({viewport: {width: 1360, height: 900}, locale: 'ja-JP'});
    context.on('page', page => page.on('dialog', dialog => dialog.accept()));
    const page = await context.newPage();
    await page.goto(new URL('editor.html?lang=ja', base).href);
    await ready(page);
    return {context, page};
}

test('URL input, retry, cancellation and load/save work through the real menu without replacing the original tab',
    {timeout: 120000}, async t => {
        const {context, page} = await editor(t);
        const bytes = await page.evaluate(async () => [...await (window as any).vm.saveProjectSb3('uint8array')]);
        const zip = await JSZip.loadAsync(Uint8Array.from(bytes));
        const project = JSON.parse(await zip.file('project.json')!.async('string'));
        project.turboWarpPlusProject = {schemaVersion: 1, title: 'URL fixture'};
        zip.file('project.json', JSON.stringify(project));
        const sb3 = await zip.generateAsync({type: 'nodebuffer'});
        let requests = 0;
        await context.route('**/url-test/*', async route => {
            requests++;
            const path = new URL(route.request().url()).pathname;
            if (path.endsWith('missing.sb3')) return route.fulfill({status: 404});
            if (path.endsWith('invalid.sb3')) return route.fulfill({body: 'not a ZIP'});
            if (path.endsWith('network.sb3')) return route.abort('failed');
            if (path.endsWith('slow.sb3')) return;
            return route.fulfill({body: sb3, contentType: 'application/octet-stream'});
        });
        await page.evaluate(() => {
            const w = window as any;
            w.__urlOriginalStage = w.vm.runtime.getTargetForStage();
            w.__urlOriginalStage.createVariable('keep', 'Keep me', '');
            w.__urlOriginalStage.variables.keep.value = 'unsaved';
            w.ReduxStore.dispatch({type: 'projectTitle/SET_PROJECT_TITLE', title: 'Original unsaved project'});
        });
        const next = await openURLMenu(page, context);
        const dialog = dialogFor(next);
        const input = dialog.locator('input[name=url]');
        const open = dialog.getByRole('button', {name: '開く', exact: true});
        await input.fill('javascript:alert(1)'); await open.click();
        await expect(dialog.getByRole('alert')).toContainText('HTTP');
        assert.equal(requests, 0);
        await input.fill(new URL('url-test/missing.sb3', base).href); await open.click();
        await expect(dialog.getByRole('alert')).toContainText('404');
        await input.fill(new URL('url-test/network.sb3', base).href); await open.click();
        await expect(dialog.getByRole('alert')).toContainText('CORS');
        await input.fill(new URL('url-test/invalid.sb3', base).href); await open.click();
        await expect(dialog.getByRole('alert')).toContainText('SB3');
        await expect(next.getByTestId('project-load-failure')).toHaveCount(0);
        await input.fill(new URL('url-test/valid.sb3?download=1', base).href); await open.click();
        await expect(dialog).toHaveCount(0, {timeout: 30000});
        await expect.poll(() => next.evaluate(() => (window as any).ReduxStore.getState().scratchGui.projectTitle)).toBe('URL fixture');
        assert.equal(await next.evaluate(() => (window as any).ReduxStore.getState().scratchGui.tw.fileHandle), null);
        const saved = await next.evaluate(async () => [...await (window as any).vm.saveProjectSb3('uint8array')]);
        const reloaded = await JSZip.loadAsync(Uint8Array.from(saved));
        assert.equal(JSON.parse(await reloaded.file('project.json')!.async('string')).turboWarpPlusProject.title, 'URL fixture');
        assert.equal(await page.evaluate(() => (window as any).vm.runtime.getTargetForStage() === (window as any).__urlOriginalStage), true);
        assert.equal(await page.evaluate(() => (window as any).vm.runtime.getTargetForStage().variables.keep.value), 'unsaved');
        assert.equal(await page.evaluate(() => (window as any).ReduxStore.getState().scratchGui.projectTitle), 'Original unsaved project');
        const cancelTab = await openURLMenu(page, context);
        const cancelDialog = dialogFor(cancelTab);
        await cancelDialog.locator('input').fill(new URL('url-test/slow.sb3', base).href);
        await cancelDialog.getByRole('button', {name: '開く', exact: true}).click();
        await expect(cancelDialog.getByRole('status')).toContainText('取得');
        await cancelDialog.getByRole('button', {name: 'キャンセル', exact: true}).click();
        await expect(cancelDialog).toHaveCount(0);
    });

test('the supplied public Urashima SB3 opens through the real Editor URL dialog',
    {timeout: 180000, skip: !process.env.E2E_PROJECT_URL_SAMPLE}, async t => {
        const {context, page} = await editor(t);
        const next = await openURLMenu(page, context);
        const dialog = dialogFor(next);
        await dialog.locator('input').fill(process.env.E2E_PROJECT_URL_SAMPLE!);
        if (process.env.E2E_PROJECT_URL_SCREENSHOT) await next.screenshot({path: process.env.E2E_PROJECT_URL_SCREENSHOT.replace(/\.png$/, '-dialog.png')});
        await dialog.getByRole('button', {name: '開く', exact: true}).click();
        const approval = next.getByTestId('twextsec-enable-all');
        await expect(approval).toBeVisible({timeout: 60000});
        await approval.click();
        await expect(dialog).toHaveCount(0, {timeout: 90000});
        const targets = await next.evaluate(() => (window as any).vm.runtime.targets.map(target => target.getName()));
        assert.deepEqual(targets, ['Stage', 'Urashima', 'Turtle', 'Princess', 'Fish', 'Narration']);
        assert.equal(await next.evaluate(() => (window as any).ReduxStore.getState().scratchGui.projectTitle), 'urashima-blocks-4.0');
        assert.equal(await next.evaluate(() => (window as any).vm.extensionManager.isExtensionLoaded('kubohiroyakamishibai4')), true);
        await next.evaluate(() => (window as any).vm.setEditingTarget((window as any).vm.runtime.getTargetForStage().id));
        await next.waitForFunction(() => (window as any).ScratchBlocks.getMainWorkspace().getAllBlocks(false).length >= 250);
        if (process.env.E2E_PROJECT_URL_SCREENSHOT) await next.screenshot({path: process.env.E2E_PROJECT_URL_SCREENSHOT});
    });
