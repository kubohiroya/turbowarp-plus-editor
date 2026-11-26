import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {chromium, expect, type Page} from '@playwright/test';
import JSZip from '@turbowarp/jszip';
import {verifyWebEditor} from '../scripts/site/editor-revision.ts';

test('the real Editor records successful SB3 opens and saves both kinds of rename through its native services',
    {timeout: 90000}, async t => {
        const root = process.env.E2E_PROJECT_FOLDER_BUILD;
        assert.ok(root && path.isAbsolute(root), 'Set E2E_PROJECT_FOLDER_BUILD to the local Editor build');
        await verifyWebEditor(root);
        const browser = await chromium.launch({headless: true, args: ['--enable-unsafe-swiftshader']});
        t.after(() => browser.close());
        const context = await browser.newContext({viewport: {width: 1360, height: 900}});
        const errors: string[] = [];
        context.on('page', tab => tab.on('pageerror', error => errors.push(error.message)));
        const original = await context.newPage();
        let page = original;
        const origin = 'http://localhost:41225';
        const prefix = '/turbowarp-plus-editor/';
        await context.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (url.origin !== origin || !url.pathname.startsWith(prefix)) return route.abort();
            const filename = path.resolve(root, decodeURIComponent(url.pathname.slice(prefix.length)));
            if (!filename.startsWith(root + path.sep)) return route.abort();
            let body: Buffer | string | null = await readFile(filename).catch(() => null);
            if (!body) return route.fulfill({status: 404});
            // A popup may see the native picker before a late page-level override. Set it before the Editor bundle.
            if (url.pathname.endsWith('/editor.html') && url.searchParams.get('catalogPicker') === 'input') {
                const withoutPicker = '<script>Object.defineProperty(window,"showOpenFilePicker",{value:undefined,configurable:true});</script>';
                body = body.toString().replace('<head>', '<head>' + withoutPicker);
            }
            const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
                '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm'};
            await route.fulfill({body, contentType: mime[path.extname(filename)] || 'application/octet-stream'});
        });
        await context.addInitScript(() => {
            const w = window as any;
            w.showOpenFilePicker = location.search.includes('catalogPicker=input') ? undefined : async () => {
                if (w.cancelPicker) {w.cancelled = true; throw new DOMException('Cancelled', 'AbortError');}
                return [w.catalogFile];
            };
        });
        const ready = () => page.waitForFunction(() => (window as any).vm?.runtime.getTargetForStage() &&
            (window as any).ScratchBlocks?.getMainWorkspace(), null, {timeout: 45000});
        await page.goto(`${origin}${prefix}editor.html?lang=en`);
        await ready();
        const defaultTitle = await page.evaluate(() => (window as any).ReduxStore.getState().scratchGui.projectTitle);
        const bytes = await page.evaluate(async () => Array.from(await (window as any).vm.saveProjectSb3('uint8array') as Uint8Array));
        const zip = await JSZip.loadAsync(new Uint8Array(bytes));
        const project = JSON.parse(await zip.file('project.json')!.async('string'));
        project.turboWarpPlusProject = {schemaVersion: 1, title: 'Catalog fixture'};
        const fixtureMarker = 'catalog-fallback-content';
        project.targets.find(target => target.isStage).variables['catalog-marker'] = ['Catalog marker', fixtureMarker];
        zip.file('project.json', JSON.stringify(project));
        const fixture = [...await zip.generateAsync({type: 'uint8array'})];
        await page.evaluate(async bytes => {
            const directory = await navigator.storage.getDirectory();
            const file = await directory.getFileHandle('catalog-fixture.sb3', {create: true});
            const writer = await file.createWritable(); await writer.write(new Uint8Array(bytes)); await writer.close();
            (window as any).catalogFile = file;
        }, fixture);
        const menu = async (command: string, from = page) => {
            await from.getByText('File', {exact: true}).first().click();
            await from.getByText(command, {exact: true}).click();
        };
        const openCatalog = async (from: Page) => {
            const opened = context.waitForEvent('page');
            await menu('Projects…', from);
            const tab = await opened;
            await expect(tab.locator('[data-project-catalog]')).toBeVisible();
            return tab;
        };
        const opened = context.waitForEvent('page');
        await menu('Open SB3 File…');
        page = await opened;
        await ready();
        await expect.poll(() => page.evaluate(() => (window as any).ReduxStore.getState().scratchGui.projectTitle)).toBe('catalog-fixture');
        assert.equal(await original.evaluate(() => (window as any).ReduxStore.getState().scratchGui.projectTitle), defaultTitle);
        page = await openCatalog(page);
        await expect(page.locator('[data-project-id] strong')).toHaveText(['catalog-fixture']);
        const entry = page.locator('[data-project-id]');
        const id = await entry.getAttribute('data-project-id');

        const count = context.pages().length;
        await original.evaluate(() => {(window as any).cancelPicker = true;});
        await menu('Open SB3 File…', original);
        await original.waitForFunction(() => (window as any).cancelled === true);
        assert.equal(context.pages().length, count, 'cancelling a picker does not open a tab');
        await expect(entry).toHaveCount(1);
        await entry.locator('[data-catalog-action=rename-title]').click();
        await page.locator('input[name=title]').fill('Catalog renamed');
        await page.locator('form button[type=submit]').click();
        await expect(entry.locator('strong')).toHaveText('Catalog renamed');
        const savedBytes = await page.evaluate(async () => {
            const root = await navigator.storage.getDirectory();
            const handle = await root.getFileHandle('catalog-fixture.sb3');
            return [...new Uint8Array(await (await handle.getFile()).arrayBuffer())];
        });
        const saved = await JSZip.loadAsync(new Uint8Array(savedBytes));
        assert.equal(JSON.parse(await saved.file('project.json')!.async('string')).turboWarpPlusProject.title, 'Catalog renamed');
        await entry.locator('[data-catalog-action=rename-storage]').click();
        await page.locator('input[name=storageName]').fill('renamed-storage');
        await page.locator('form button[type=submit]').click();
        await expect(entry).toContainText('renamed-storage.sb3');
        assert.equal(await entry.getAttribute('data-project-id'), id);
        assert.equal(await page.evaluate(async () => {
            const root = await navigator.storage.getDirectory();
            return (await root.getFileHandle('renamed-storage.sb3')).kind;
        }), 'file');
        const savedTab = await openCatalog(original);
        const savedEntry = savedTab.locator('[data-project-id]');
        await expect(savedEntry).toHaveAttribute('data-project-id', id!);
        await savedEntry.locator('[data-catalog-action=open]').click();
        await expect(savedTab.locator('[data-project-catalog]')).toHaveCount(0);
        await expect.poll(() => savedTab.evaluate(() => (window as any).ReduxStore.getState().scratchGui.projectTitle))
            .toBe('Catalog renamed');

        const forgetTab = await openCatalog(original);
        await forgetTab.locator('[data-catalog-action=forget]').click();
        await expect(forgetTab.locator('[data-project-id]')).toHaveCount(0);
        assert.equal(await original.evaluate(async () => {
            const root = await navigator.storage.getDirectory();
            return (await root.getFileHandle('renamed-storage.sb3')).kind;
        }), 'file');

        const fallback = await context.newPage();
        await fallback.goto(`${origin}${prefix}editor.html?lang=en&catalogPicker=input`);
        await fallback.waitForFunction(() => Boolean((window as any).ScratchBlocks?.getMainWorkspace()));
        const choose = fallback.waitForEvent('filechooser');
        const openedFallback = context.waitForEvent('page');
        await menu('Open SB3 File…', fallback);
        const selected = {name: 'input-fallback.sb3', mimeType: 'application/octet-stream', buffer: Buffer.from(fixture)};
        await (await choose).setFiles(selected);
        const fallbackProject = await openedFallback;
        await expect.poll(() => fallbackProject.evaluate(() => (window as any).ReduxStore?.getState().scratchGui.projectTitle))
            .toBe('input-fallback');

        const fallbackList = await openCatalog(fallback);
        const fallbackEntry = fallbackList.locator('[data-project-id]');
        await expect(fallbackEntry).toContainText('input-fallback.sb3');
        assert.equal(await fallbackList.evaluate(() => typeof window.showOpenFilePicker), 'undefined');
        await expect(fallbackEntry.locator('[data-catalog-action=rename-title]')).toBeDisabled();
        const fallbackId = await fallbackEntry.getAttribute('data-project-id');
        const restoredMarker = () => fallbackList.evaluate(() =>
            (window as any).vm?.runtime.getTargetForStage()?.variables['catalog-marker']?.value ?? null);
        assert.equal(await restoredMarker(), null);
        const reselect = fallbackList.waitForEvent('filechooser');
        await fallbackEntry.locator('[data-catalog-action=open]').click();
        await (await reselect).setFiles(selected);
        await expect(fallbackList.locator('[data-project-catalog]')).toHaveCount(0);
        await expect.poll(restoredMarker).toBe(fixtureMarker);

        const createTab = await openCatalog(fallback);
        await expect(createTab.locator('[data-project-id]')).toHaveAttribute('data-project-id', fallbackId!);
        if (process.env.CATALOG_CREATE_SCREENSHOT) await createTab.screenshot({path: process.env.CATALOG_CREATE_SCREENSHOT});
        const create = createTab.locator('[data-catalog-action=create]');
        await create.click();
        const creation = createTab.locator('[data-new-project-dialog]');
        await expect(creation).toBeVisible();
        await expect(creation.locator('input[name=destination][value=browser]')).toHaveCount(1);
        await creation.locator('[data-new-project-cancel]').click();
        await expect(creation).toHaveCount(0);
        const memory = await openCatalog(fallback);
        await memory.evaluate(() => (window as any).ReduxStore.dispatch({
            type: 'projectTitle/SET_PROJECT_TITLE', title: 'Previously open project'
        }));
        await expect(memory.getByPlaceholder('Project title here')).toHaveValue('Previously open project');
        await memory.locator('[data-catalog-action=create]').click();
        const options = memory.locator('[data-new-project-dialog]');
        await options.locator('input[name=destination][value=memory]').check();
        await options.locator('button[type=submit]').click();
        await expect(options).toHaveCount(0);
        await expect(memory.getByPlaceholder('Project title here')).toHaveValue(defaultTitle);
        assert.equal(await original.evaluate(() => (window as any).ReduxStore.getState().scratchGui.projectTitle), defaultTitle);
        assert.deepEqual(errors, []);
    });
