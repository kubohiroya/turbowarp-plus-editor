import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {chromium, expect} from '@playwright/test';
import JSZip from '@turbowarp/jszip';

const origin = 'http://localhost:41016';
const prefix = '/turbowarp-plus-editor/';
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav', '.wasm': 'application/wasm'};

test('Editor saves an SB3 to an open project folder and commits only its files', {timeout: 120000}, async t => {
    const build = process.env.E2E_PROJECT_SAVE_BUILD;
    assert.ok(build && path.isAbsolute(build), 'Set E2E_PROJECT_SAVE_BUILD to the local webpack preview');
    const info = JSON.parse(await readFile(path.join(build, 'build-info.json'), 'utf8'));
    const pins = JSON.parse(await readFile(new URL('../site/source.json', import.meta.url), 'utf8'));
    assert.equal(info.revision, pins.guiRevision);
    assert.equal(info.siteRevision, execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim());

    const root = await mkdtemp(path.join(process.platform === 'darwin' ? '/private/tmp' : tmpdir(), 'tw-save-commit-'));
    t.after(() => rm(root, {recursive: true, force: true}));
    const projectFolder = path.join(root, 'project');
    await Promise.all(['blank', 'occupied', 'project'].map(name => mkdir(path.join(root, name))));
    await writeFile(path.join(root, 'occupied', 'keep.txt'), 'Keep this file');
    const git = (...args: string[]) => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
    await writeFile(path.join(root, 'notes.txt'), 'Existing repository file\n');
    git('init', '-q', '-b', 'main');
    await writeFile(path.join(root, '.git', 'info', 'exclude'), '/blank/\n/occupied/\n');
    git('config', 'user.name', 'Save fixture');
    git('config', 'user.email', 'save@example.invalid');
    git('add', 'notes.txt');
    git('commit', '-qm', 'Initial repository');

    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32"/></svg>';
    const assetId = createHash('md5').update(svg).digest('hex');
    const md5ext = assetId + '.svg';
    const zip = new JSZip();
    zip.file(md5ext, svg);
    zip.file('project.json', JSON.stringify({targets: [
        {isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
            costumes: [{name: 'Backdrop', assetId, md5ext, dataFormat: 'svg', rotationCenterX: 16, rotationCenterY: 16}],
            sounds: [], currentCostume: 0, volume: 100}
    ], monitors: [], extensions: [], meta: {semver: '3.0.0'}}));
    const sb3 = await zip.generateAsync({type: 'uint8array'});

    const args = ['--enable-experimental-web-platform-features', '--enable-unsafe-swiftshader'];
    if (process.platform === 'darwin') args.push('--single-process', '--no-zygote', '--disable-crash-reporter');
    const browser = await chromium.launch({headless: true, args});
    t.after(() => browser.close());
    const page = await browser.newPage({viewport: {width: 1280, height: 920}});
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.stack || error.message));
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin || !url.pathname.startsWith(prefix)) return route.abort();
        const filename = path.resolve(build, decodeURIComponent(url.pathname.slice(prefix.length)));
        if (!filename.startsWith(build + path.sep)) return route.abort();
        const body = await readFile(filename).catch(() => null);
        if (body === null) return route.fulfill({status: 404});
        return route.fulfill({body, contentType: mime[path.extname(filename)] || 'application/octet-stream'});
    });
    await page.addInitScript(() => {
        const state = window as unknown as {rootHandle?: FileSystemDirectoryHandle; folderDestination?: string;
            showDirectoryPicker(options: {id: string}): Promise<FileSystemDirectoryHandle>};
        // CDP supplies a real directory handle. The test does not display an OS picker.
        for (const type of ['dragenter', 'dragover', 'drop']) {
            window.addEventListener(type, async event => {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (type === 'drop') {
                    const item = (event as DragEvent).dataTransfer.items[0] as DataTransferItem & {
                        getAsFileSystemHandle(): Promise<FileSystemDirectoryHandle>;
                    };
                    state.rootHandle = await item.getAsFileSystemHandle();
                }
            }, {capture: true});
        }
        state.showDirectoryPicker = async options => {
            if (options.id === 'turbowarp-plus-git-root') return state.rootHandle;
            if (!state.folderDestination) throw new DOMException('Cancelled', 'AbortError');
            return state.rootHandle.getDirectoryHandle(state.folderDestination);
        };
    });
    await page.goto(origin + prefix + 'editor.html?lang=en');
    await page.waitForFunction(() => Boolean(window.vm?.runtime.getTargetForStage()), null, {timeout: 45000});
    const cdp = await page.context().newCDPSession(page);
    for (const type of ['dragEnter', 'dragOver', 'drop'] as const) {
        await cdp.send('Input.dispatchDragEvent', {type, x: 100, y: 100,
            data: {items: [], files: [root], dragOperationsMask: 1}});
    }
    await page.waitForFunction(() => Boolean((window as unknown as {rootHandle?: object}).rootHandle));
    const drawer = page.getByRole('toolbar', {name: 'Drawer views'});
    await drawer.getByRole('button', {name: 'Project folder', exact: true}).click();
    const create = page.getByRole('button', {name: 'Create Project Folder', exact: true});
    await create.click();
    await expect(create).toBeEnabled();
    const choose = (name: string) => page.evaluate(name => {
        (window as unknown as {folderDestination: string}).folderDestination = name;
    }, name);
    await choose('occupied');
    await create.click();
    await expect(page.getByText('Choose an empty folder.', {exact: true})).toBeVisible();
    assert.equal(await readFile(path.join(root, 'occupied', 'keep.txt'), 'utf8'), 'Keep this file');
    await choose('blank');
    await create.click();
    await expect(page.getByRole('treeitem', {name: /^project\.source\.json/})).toBeVisible();
    const blank = JSON.parse(await readFile(path.join(root, 'blank', 'project.source.json'), 'utf8'));
    assert.equal(blank.targets.filter(target => target.isStage).length, 1);
    await page.evaluate(bytes => window.vm.loadProject(Uint8Array.from(bytes).buffer), Array.from(sb3));
    const menu = (name: string) => page.getByText(name, {exact: true});
    const command = async (name: string) => {
        await menu('File').click();
        await page.getByRole('button', {name, exact: true}).click();
    };
    if (await drawer.getByRole('button', {name: 'Project folder', exact: true}).getAttribute('aria-pressed') !== 'true') {
        await drawer.getByRole('button', {name: 'Project folder', exact: true}).click();
    }
    await choose('project');
    await create.click();
    await expect(page.getByRole('treeitem', {name: /^project\.source\.json/})).toBeVisible();
    assert.equal(await readFile(path.join(projectFolder, 'assets', md5ext), 'utf8'), svg);
    const volume = async () => JSON.parse(await readFile(path.join(projectFolder, 'project.source.json'), 'utf8')).targets[0].volume;
    const edit = (volume: number) => page.evaluate(value => {
        window.vm.runtime.getTargetForStage().volume = value;
        window.vm.runtime.emitProjectChanged();
    }, volume);

    await drawer.getByRole('button', {name: 'Sprites', exact: true}).click();
    await edit(42);
    await command('Save Project');
    await expect(page.locator('[data-project-folder-status]')).toHaveText('Project folder saved.');
    assert.equal(await volume(), 42);

    await command('Choose Repository…');
    const gitPanel = page.locator('.twgit-panel');
    await expect(gitPanel.locator('.twgit-repository-heading strong')).toHaveText(path.basename(root));
    await expect(page.getByRole('button', {name: 'Branch: main', exact: true})).toBeVisible();
    await writeFile(path.join(root, 'notes.txt'), 'Unrelated private notes\n');
    await edit(31);
    await command('Save and Commit…');
    const dialog = page.getByRole('dialog', {name: 'Save and Commit', exact: true});
    await dialog.getByRole('button', {name: 'Save and review changes'}).click();
    await expect(dialog.getByRole('heading', {name: 'Project changes to commit · main'})).toBeVisible();
    await expect(dialog.getByText('project/project.source.json', {exact: true})).toBeVisible();
    await expect(dialog.getByText('notes.txt', {exact: true})).toHaveCount(0);
    assert.equal(await volume(), 31);
    await dialog.getByLabel('Commit message').fill('Record project changes');
    await dialog.getByRole('button', {name: 'Commit', exact: true}).click();
    await expect(dialog.getByText(/^Record project changes · Committed/u)).toBeVisible();
    assert.equal(git('log', '-1', '--format=%s'), 'Record project changes');
    assert.equal(JSON.parse(git('show', 'HEAD:project/project.source.json')).targets[0].volume, 31);
    assert.equal(git('show', 'HEAD:notes.txt'), 'Existing repository file');
    assert.equal(git('status', '--porcelain').trim(), 'M notes.txt');
    await dialog.getByRole('button', {name: 'Close', exact: true}).click();
    await command('Save and Commit…');
    await expect(dialog.getByText(/^Record project changes · Committed/u)).toBeVisible();
    assert.deepEqual(errors, []);
});
