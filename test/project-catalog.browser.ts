import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {chromium, expect} from '@playwright/test';

test('catalog adapters save project titles, rename browser storage and reuse a remote worktree', {timeout: 30000}, async t => {
    const bundled = await build({stdin: {resolveDir: process.cwd(), contents: `
        export {createProjectCatalogRuntime} from '@kubohiroya/turbowarp-plus-editor-workbench/project-catalog-host';
        export {openBrowserProjects} from '@kubohiroya/turbowarp-plus-editor-project-folder';`},
    bundle: true, write: false, format: 'iife', globalName: 'catalogTest', target: 'es2022'});
    const browser = await chromium.launch({headless: true});
    t.after(() => browser.close());
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://localhost:41224/**', route => route.fulfill({contentType: 'text/html',
        body: '<!doctype html><button id="projects">Projects</button>'}));
    await page.goto('http://localhost:41224/');
    await page.addScriptTag({content: bundled.outputFiles[0].text});
    await page.evaluate(async () => {
        const w = window as any;
        const listeners = new Set<() => void>();
        let sequence = 0;
        let phase = 'idle';
        let name = '';
        let loadedTitle: string | undefined;
        let directory: FileSystemDirectoryHandle | null = null;
        let stage = {};
        let currentFile: FileSystemFileHandle | null = null;
        const fire = () => {for (const listener of listeners) listener();};
        const files = w.catalogTest.openBrowserProjects(window);
        const project = await files.create('Storage name');
        const rememberLayout = (id: number, handle: FileSystemDirectoryHandle, name: string) => new Promise<void>((resolve, reject) => {
            const request = indexedDB.open('twPlusWorkspaceLayout', 1);
            request.onupgradeneeded = () => {
                const table = request.result.createObjectStore('layouts', {keyPath: 'id', autoIncrement: true});
                for (const key of ['name', 'desktopKey', 'lastUsedAt']) table.createIndex(key, key);
                request.result.createObjectStore('preferences');
            };
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const database = request.result;
                const tx = database.transaction('layouts', 'readwrite');
                tx.objectStore('layouts').put({id, kind: 'directory', name, handle, signature: '', layout: '{}', lastUsedAt: Date.now()});
                tx.oncomplete = () => {database.close(); resolve();};
                tx.onerror = () => {database.close(); reject(tx.error);};
            };
        });
        await rememberLayout(1, project.root, project.title);
        const handle = await project.root.getFileHandle('project.source.json', {create: true});
        const writeTitle = async (title: string) => {
            const writer = await handle.createWritable();
            await writer.write(JSON.stringify({turboWarpPlusProject: {schemaVersion: 1, title}})); await writer.close();
        };
        await writeTitle('Saved project name');
        const properties = {snapshot: () => ({title: name}), loadedTitle: () => loadedTitle,
            loadState: () => ({sequence, phase}),
            subscribe(listener) {listeners.add(listener); return () => listeners.delete(listener);},
            apply({title}) {name = title; fire();}};
        const vm = {runtime: {getTargetForStage: () => stage}, quit() {}, renderer: {draw() {}},
            async loadProject(input) {
                sequence++; phase = 'loading'; fire();
                const data = JSON.parse(typeof input === 'string' ? input : new TextDecoder().decode(input));
                loadedTitle = data.turboWarpPlusProject?.title;
                name = loadedTitle ?? ''; stage = {};
                phase = 'loaded'; fire();
            }};
        const folder = {get directory() {return directory;}, get root() {return directory;}, browserProjects: files,
            detach() {directory = null;},
            async openDirectory(next) {
                await vm.loadProject(await (await (await next.getFileHandle('project.source.json')).getFile()).text());
                directory = next; currentFile = null; return 'opened';
            }, async save() {await writeTitle(name);}};
        const runtime = w.catalogTest.createProjectCatalogRuntime({document, vm, properties,
            readFile: () => currentFile, isDirty: () => false, report(error) {throw error;}});
        let clones = 0;
        runtime.bindFolder({folder, readRemote: async () => 'https://github.com/owner/repository.git',
            async openRemote() {clones++; return false;}});
        const storage = {canSave: true, filename: 'work.sb3', async download() {}, fail(error) {throw error;},
            async write(file, serialize) {
                const output = serialize(() => JSON.stringify({turboWarpPlusProject: {schemaVersion: 1, title: name}}));
                const writer = await file.createWritable(); await writer.write(output); await writer.close();
            }, finish(file, title) {currentFile = file; name = title;}};
        document.getElementById('projects')!.onclick = () => runtime.show('en', storage);
        w.catalog = {runtime, files, project, handle, clones: () => clones, folder, storage, properties, vm, rememberLayout};
    });
    const openList = async () => {
        await page.locator('#projects').click();
        await expect(page.locator('[data-project-catalog]')).toHaveAttribute('aria-busy', 'false');
    };
    await openList();
    await expect(page.locator('[data-project-id] strong')).toHaveText(['Saved project name']);
    await expect(page.locator('[data-project-id]')).toContainText('Storage name');
    await page.locator('[data-catalog-action=open]').click();
    await expect(page.locator('[data-project-catalog]')).toHaveCount(0);
    assert.equal(await page.evaluate(() => (window as any).catalog.clones()), 0);
    await openList();
    await page.locator('[data-catalog-action=rename-title]').click();
    await page.locator('input[name=title]').fill('New title');
    await page.locator('form button[type=submit]').click();
    await expect(page.locator('[data-project-id] strong')).toHaveText(['New title']);
    assert.equal(await page.evaluate(async () => JSON.parse(await (await (window as any).catalog.handle.getFile()).text()).turboWarpPlusProject.title), 'New title');
    await expect(page.locator('[data-project-id]')).toContainText('Storage name');
    await page.locator('[data-catalog-action=rename-storage]').click();
    await page.locator('input[name=storageName]').fill('New storage');
    await page.locator('form button[type=submit]').click();
    await expect(page.locator('[data-project-id]')).toContainText('New storage');
    await expect(page.locator('[data-project-id] strong')).toHaveText(['New title']);
    assert.equal(await page.evaluate(async () => (await (window as any).catalog.files.list())[0].title), 'New storage');
    const first = await page.evaluate(async () => (await (window as any).catalog.runtime.store.list())[0].id);
    await page.locator('[data-catalog-action=close]').click();
    await openList();
    assert.equal(await page.locator('[data-project-id]').getAttribute('data-project-id'), first);
    await expect(page.locator('[data-catalog-action=delete]')).toBeDisabled();
    await page.evaluate(async () => {
        const state = (window as any).catalog;
        state.disposable = await state.files.create('Disposable');
        await state.rememberLayout(2, state.disposable.root, state.disposable.title);
    });
    await page.locator('[data-catalog-action=close]').click();
    await openList();
    await expect(page.locator('[data-project-id]')).toHaveCount(2);
    const disposable = page.locator('[data-project-id]').filter({has: page.locator('strong', {hasText: 'Disposable'})});
    page.once('dialog', dialog => dialog.accept());
    await disposable.locator('[data-catalog-action=delete]').click();
    await expect(page.locator('[data-project-id]')).toHaveCount(1);
    assert.equal(await page.evaluate(async () => {
        const state = (window as any).catalog;
        return await state.files.root(state.disposable.id);
    }), null);
    await page.locator('[data-catalog-action=close]').click();
    await openList();
    await expect(page.locator('[data-project-id]')).toHaveCount(1);
    await page.locator('[data-catalog-action=forget]').click();
    await expect(page.locator('[data-project-id]')).toHaveCount(0);
    assert.equal(await page.evaluate(async () => {
        const state = (window as any).catalog;
        return Boolean(await state.files.root(state.project.id));
    }), true);
    await page.locator('[data-catalog-action=close]').click();
    await openList();
    await expect(page.locator('[data-project-id]')).toHaveCount(0);
    assert.deepEqual(errors, []);
});
