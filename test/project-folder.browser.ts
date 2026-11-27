import {test, type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir, mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium, expect, type Page} from '@playwright/test';
import {verifyWebEditor} from '../scripts/site/editor-revision.ts';

const stringify = value => JSON.stringify(value, null, 2) + '\n';
const block = (opcode, next, parent, inputs = {}, position = {}) =>
    ({opcode, next, parent, inputs, fields: {}, shadow: false, topLevel: 'x' in position, ...position});
const target = (name, isStage, blocks, costumes, sounds = []) =>
    ({isStage, name, variables: {}, lists: {}, broadcasts: {}, blocks, comments: {}, costumes, sounds, currentCostume: 0, volume: 100});
type FolderPickerOptions = {id?: string; mode?: 'read' | 'readwrite'};
const projectFile = 'project.source.json';
const noteFile = 'notes.js';
const note = (value: string) => ['// Header', `export const note = "${value}";`, '// Footer', ''].join('\n');
const origin = 'http://localhost:41015';
const prefix = '/turbowarp-plus-editor/';
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav', '.wasm': 'application/wasm'};
// Two 16×16 VP8 frames in a WebM container.
const videoFixture = Buffer.from([
    'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAIkEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZU',
    'rmtTrIHWTbuMU6uEElTDZ1OsggEyTbuMU6uEHFO7a1OsggIO7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxM',
    'YXZmNjMuMS4xMDFXQYxMYXZmNjMuMS4xMDFEiYhAeQAAAAAAABZUrmvXrgEAAAAAAABO14EBc8WI1Yz2U1VsKD6cgQAitZyDdW5k',
    'iIEAhoVWX1ZQOIOBASPjg4QL68IA4JCwgRC6gRCagQJVsIRVuYEBVe6BAOwBAAAAAAAAAgAAElTDZ/pzc59jwIBnyJlFo4dFTkNP',
    'REVSRIeMTGF2ZjYzLjEuMTAxc3PVY8CLY8WI1Yz2U1VsKD5nyKBFo4dFTkNPREVSRIeTTGF2YzYzLjEuMTAxIGxpYnZweGfIoUWj',
    'iERVUkFUSU9ORIeTMDA6MDA6MDAuNDAwMDAwMDAwAB9DtnXY54EAo7yBAACAsAIAnQEqEAAQAABHCIWFiIWEiAICAnWqA/gCDP0o',
    'AP7/TRL//FhX8WFfxYV/8WFf/PzO7cX85gCjlYEAyACxAQAFEKwAGAAYWC/0AAgAABxTu2uRu4+zgQC3iveBAfGCAbHwgQM=',
].join(''), 'base64');

function fixture() {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#c62458"/></svg>');
    const wav = Buffer.alloc(844, 128);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(836, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24);
    wav.writeUInt32LE(8000, 28);
    wav.writeUInt16LE(1, 32);
    wav.writeUInt16LE(8, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(800, 40);
    const reference = (name, data, dataFormat) => {
        const assetId = createHash('md5').update(data).digest('hex');
        return {name, assetId, dataFormat, md5ext: `${assetId}.${dataFormat}`};
    };
    const costume = {...reference('Local', svg, 'svg'), rotationCenterX: 16, rotationCenterY: 16, bitmapResolution: 1};
    const sound = {...reference('Local Sound', wav, 'wav'), rate: 8000, sampleCount: 800};
    const cat = target('Cat', false, {
        flag_A: block('event_whenflagclicked', 'move_B', null, {}, {x: 120, y: 80}),
        move_B: {...block('motion_movesteps', null, 'flag_A', {STEPS: [1, [4, '10']]}), retainedData: {author: 'owner'}}
    }, [costume], [sound]);
    const bird = target('Bird', false, {
        bird_flag: block('event_whenflagclicked', null, null, {}, {x: 40, y: 60})
    }, [costume]);
    const stage = target('Stage', true, {
        loop_flag: block('event_whenflagclicked', 'loop_forever', null, {}, {x: 40, y: 60}),
        loop_forever: block('control_forever', null, 'loop_flag', {SUBSTACK: [2, 'loop_wait']}),
        loop_wait: block('control_wait', null, 'loop_forever', {DURATION: [1, [5, '1']]})
    }, [costume]);
    const project = {targets: [stage, cat, bird],
        monitors: [], extensions: [], meta: {semver: '3.0.0'}, retainedTopLevel: {version: 42}};
    return {project, costume, sound, svg, wav};
}

async function createDiskProject(t: TestContext, name: string, includeNotes = false) {
    const folder = await mkdtemp(path.join(process.platform === 'darwin' ? '/private/tmp' : tmpdir(), name));
    t.after(() => rm(folder, {recursive: true, force: true}));
    const {project, costume, sound, svg, wav} = fixture();
    await mkdir(path.join(folder, 'assets'));
    await Promise.all([
        writeFile(path.join(folder, projectFile), stringify(project)),
        writeFile(path.join(folder, 'assets', costume.md5ext), svg),
        writeFile(path.join(folder, 'assets', sound.md5ext), wav),
        writeFile(path.join(folder, 'embedded-extensions.json'), stringify({formatVersion: 1, extensions: []})),
        writeFile(path.join(folder, 'sb3-source.json'), stringify({formatVersion: 1, project: projectFile,
            embeddedExtensions: 'embedded-extensions.json', assetsDirectory: 'assets',
            archiveEntries: ['project.json', costume.md5ext, sound.md5ext]}))
    ]);
    if (includeNotes) {
        await mkdir(path.join(folder, 'extensions'));
        await Promise.all([
            writeFile(path.join(folder, '.gitignore'), '.tw-plus/\n'),
            writeFile(path.join(folder, 'clip.webm'), videoFixture),
            writeFile(path.join(folder, noteFile), '\uFEFF' + note('committed').replaceAll('\n', '\r\n'))
        ]);
    }
    return {folder, project, costume, sound, svg, wav};
}

const editFolderBlock = (page: Page, kind: 'value' | 'position' | 'append', value = '20') =>
    page.evaluate(({kind, value}) => {
        const vm = window.vm;
        vm.setEditingTarget(vm.runtime.targets.find(entry => entry.sprite.name === 'Cat').id);
        if (kind === 'value') {
            const id = vm.editingTarget.blocks.getBlock('move_B').inputs.STEPS.block;
            vm.blockListener({type: 'change', blockId: id, element: 'field', name: 'NUM', newValue: value});
        } else if (kind === 'position') {
            vm.blockListener({type: 'move', blockId: 'flag_A', newCoordinate: {x: 160, y: 110}});
        } else {
            vm.blockListener({type: 'create', blockId: 'say_C', xml: {
                outerHTML: '<block type="looks_say" id="say_C"><value name="MESSAGE"><shadow type="text" id="say_shadow"><field name="TEXT">こんにちは</field></shadow></value></block>'
            }});
            vm.blockListener({type: 'move', blockId: 'say_C', newParentId: 'move_B'});
        }
    }, {kind, value});

// Exact source representation of the block created by editFolderBlock's append event.
const appendSayToSource = (blocks: ReturnType<typeof fixture>['project']['targets'][number]['blocks']) => {
    Object.assign(blocks.move_B, {next: 'say_C'});
    Object.assign(blocks, {say_C: block('looks_say', null, 'move_B', {MESSAGE: [1, [10, 'こんにちは']]})});
};

async function openDeviceFolder(t: TestContext, build: string, folder: string, query = '', observe = false) {
    const args = ['--enable-experimental-web-platform-features', '--enable-unsafe-swiftshader'];
    if (process.platform === 'darwin') args.push('--single-process', '--no-zygote', '--disable-crash-reporter');
    const browser = await chromium.launch({headless: true, args});
    t.after(() => browser.close());
    const context = await browser.newContext({viewport: {width: 1280, height: 920}});
    await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin || !url.pathname.startsWith(prefix)) return route.abort();
        const filename = path.resolve(build, decodeURIComponent(url.pathname.slice(prefix.length)));
        if (!filename.startsWith(build + path.sep)) return route.abort();
        const body = await readFile(filename).catch(() => null);
        if (body === null) return route.fulfill({status: 404});
        return route.fulfill({body, contentType: mime[path.extname(filename)] || 'application/octet-stream'});
    });
    await context.addInitScript(observe => {
        if (window.parent !== window || typeof FileSystemFileHandle === 'undefined') return;
        const state = window as Window & {testDirectory?: FileSystemDirectoryHandle;
            folderIO?: {loads: string[]; picker?: FolderPickerOptions; writes: number}};
        if (observe) {
            const io = state.folderIO = {loads: [], writes: 0};
            const writable = FileSystemFileHandle.prototype.createWritable;
            FileSystemFileHandle.prototype.createWritable = function(...args) {
                if (this.name === 'project.source.json') io.writes++;
                return writable.apply(this, args);
            };
        }
        Object.assign(state, {showDirectoryPicker: async (options: FolderPickerOptions) => {
            if (state.folderIO) state.folderIO.picker = options;
            return state.testDirectory;
        }});
        // Capture only the fixture directory for the picker. Later drops reach the real Explorer.
        for (const type of ['dragenter', 'dragover', 'drop']) {
            window.addEventListener(type, async event => {
                if (state.testDirectory) return;
                event.preventDefault();
                event.stopImmediatePropagation();
                if (type === 'drop') {
                    const item = (event as DragEvent).dataTransfer!.items[0] as DataTransferItem & {
                        getAsFileSystemHandle(): Promise<FileSystemDirectoryHandle>;
                    };
                    state.testDirectory = await item.getAsFileSystemHandle();
                }
            }, {capture: true});
        }
    }, observe);
    const errors: string[] = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    const original = await context.newPage();
    await original.goto(`${origin}${prefix}editor.html?lang=en${query}`);
    await original.waitForFunction(() => Boolean(window.vm?.runtime.getTargetForStage()));
    const originalProject = await original.evaluate(() => window.vm.toJSON());
    const openAgain = async () => {
        await original.getByText('File', {exact: true}).click();
        const popup = context.waitForEvent('page');
        await original.getByRole('button', {name: 'Open Folder…', exact: true}).click();
        const editor = await popup;
        const choose = editor.getByRole('dialog').getByRole('button', {name: 'Choose a folder', exact: true});
        await expect(choose).toBeVisible({timeout: 10000});
        const cdp = await context.newCDPSession(editor);
        for (const type of ['dragEnter', 'dragOver', 'drop'] as const) {
            await cdp.send('Input.dispatchDragEvent', {type, x: 100, y: 100,
                data: {items: [], files: [folder], dragOperationsMask: 1}});
        }
        await editor.waitForFunction(() => (window as Window & {testDirectory?: FileSystemDirectoryHandle})
            .testDirectory?.kind === 'directory');
        if (observe) {
            await editor.evaluate(() => {
                const state = window as any;
                const load = window.vm.loadProject;
                window.vm.loadProject = function(input, ...args) {
                    state.folderIO.loads.push(typeof input);
                    return load.call(this, input, ...args);
                };
                window.vm._saveProjectZip = () => {throw new Error('Folder editing attempted to create a ZIP');};
            });
            editor.on('download', () => errors.push('Unexpected download'));
        }
        await choose.click();
        return editor;
    };
    const editor = await openAgain();
    return {original, originalProject, editor, openAgain, errors};
}

for (const restoreEnabled of [true, false]) test(restoreEnabled ?
    'opens a past version in its own player and restores it from the history by default' :
    'opens a past version in its own player with restore disabled', {timeout: 90000}, async t => {
    const root = process.env.E2E_PROJECT_FOLDER_BUILD;
    assert.ok(root && path.isAbsolute(root), 'Set E2E_PROJECT_FOLDER_BUILD to the built Editor directory');
    await verifyWebEditor(root);
    const {folder, project} = await createDiskProject(t, 'tw-project-version-');
    const git = (...args: string[]) => execFileSync('git', ['--no-optional-locks', ...args],
        {cwd: folder, encoding: 'utf8'}).trim();
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'Editor history fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    git('add', '.'); git('commit', '-qm', 'Past project');
    const past = git('rev-parse', 'HEAD');
    project.targets[1].name = 'Current Cat';
    await writeFile(path.join(folder, projectFile), stringify(project));
    git('add', '.'); git('commit', '-qm', 'Current project');
    const current = git('rev-parse', 'HEAD');

    const {editor: page, errors} = await openDeviceFolder(t, root, folder,
        restoreEnabled ? '' : '&twPlusGitRestoreVersion=0');
    await page.waitForFunction(() => window.vm.runtime.targets.some(target => target.sprite?.name === 'Current Cat'));
    await expect(page.getByRole('button', {name: 'Branch: main', exact: true})).toBeVisible();
    const views = page.getByRole('toolbar', {name: 'Drawer views'});
    await views.getByRole('button', {name: 'Git history', exact: true}).click();
    const history = page.locator('.twgit-history-view');
    const pastCommit = history.getByRole('button', {name: /^Past project, /});
    const currentCommit = history.getByRole('button', {name: /^Current project, /});
    const search = page.getByRole('button', {name: 'Search commits', exact: true});
    const query = page.getByRole('searchbox', {name: 'Search commits', exact: true});
    await expect(currentCommit).toBeVisible();
    await search.click();
    await query.fill('no such commit');
    await expect(history.getByRole('status').filter({hasText: /^No matching commits\.$/})).toBeVisible();
    await expect(pastCommit).toHaveCount(0);
    await query.fill('PAST PROJECT');
    await expect(pastCommit).toBeVisible();
    await expect(currentCommit).toHaveCount(0);
    await query.press('Escape');
    await expect(query).toHaveCount(0);
    await expect(search).toBeFocused();
    await expect(currentCommit).toBeVisible();

    // The History drawer opens the same commit in Local Git, not just in its own list.
    const localGit = page.getByRole('tab', {name: 'Local Git', exact: true});
    const panel = page.locator('.twgit-panel');
    const historyView = panel.getByRole('button', {name: 'Create PR', exact: true});
    const panelCommit = panel.getByRole('button', {name: /^Past project, /});
    const addedScript = panel.getByRole('region', {name: 'Changes by project element'})
        .getByRole('button', {name: 'Code: 1 change Added Committed', exact: true}).first();
    await pastCommit.click();
    await expect(localGit).toHaveAttribute('aria-selected', 'true');
    await expect(historyView).toHaveAttribute('aria-expanded', 'true');
    await expect(panelCommit).toHaveAttribute('aria-pressed', 'true');
    await expect(addedScript).toBeInViewport();
    await panel.getByRole('button', {name: 'Commit saved changes', exact: true}).click();
    await pastCommit.press('Enter');
    await expect(historyView).toHaveAttribute('aria-expanded', 'true');
    await expect(addedScript).toBeInViewport();
    const pastActions = history.getByRole('button', {name: 'Actions: Past project'});
    await page.evaluate(() => {
        const vm = window.vm;
        vm.runtime.targets.find(target => target.sprite?.name === 'Current Cat').setXY(51, 0);
        vm.runtime.emitProjectChanged();
    });
    await pastActions.click();
    await history.getByRole('menuitem', {name: 'Open This Version'}).click();
    const preview = page.getByRole('dialog', {name: `Project version · ${past.slice(0, 12)}`});
    const frame = await preview.locator('iframe').elementHandle();
    const player = await frame.contentFrame();
    assert.ok(player);
    await player.waitForFunction(() => window.vm?.runtime.targets.some(target => target.sprite?.name === 'Cat'),
        null, {timeout: 20000}).catch(error => {
        throw new Error(`Historical project did not load: ${errors.join(', ')}`, {cause: error});
    });
    await player.getByTitle('Go', {exact: true}).first().click();
    await player.waitForFunction(() => window.vm.runtime.targets.find(target => target.sprite?.name === 'Cat')?.x === 10);
    assert.equal(await page.evaluate(() =>
        window.vm.runtime.targets.find(target => target.sprite?.name === 'Current Cat')?.x), 51);
    assert.equal(git('rev-parse', 'HEAD'), current);
    assert.equal(git('status', '--porcelain'), '');
    await preview.getByRole('button', {name: 'Close', exact: true}).click();

    await pastActions.click();
    if (!restoreEnabled) {
        await expect(history.getByRole('menuitem', {name: 'Restore This Version…'})).toHaveCount(0);
        assert.deepEqual(errors, []);
        return;
    }
    await history.getByRole('menuitem', {name: 'Restore This Version…'}).click();
    await expect(history.getByRole('status')).toContainText('Stop the project');
    assert.equal(git('rev-parse', 'HEAD'), current);
    await page.evaluate(() => {
        const vm = window.vm;
        vm.runtime.targets.find(target => target.sprite?.name === 'Current Cat').setXY(0, 0);
    });
    await page.getByText('File', {exact: true}).click();
    await page.getByRole('button', {name: 'Save Project', exact: true}).click();
    await expect(page.locator('[data-project-folder-status]')).toContainText(/saved|No changes to save/);
    if (git('status', '--porcelain')) git('restore', '--', projectFile);
    await pastActions.click();
    await history.getByRole('menuitem', {name: 'Restore This Version…'}).click();
    const confirmation = page.getByRole('dialog', {name: 'Restore This Version…'});
    await expect(confirmation.getByText(projectFile, {exact: true})).toBeVisible();
    await confirmation.getByRole('button', {name: 'Cancel', exact: true}).click();
    assert.equal(git('rev-parse', 'HEAD'), current);
    await pastActions.click();
    await history.getByRole('menuitem', {name: 'Restore This Version…'}).click();
    await confirmation.getByRole('button', {name: 'Restore and Record', exact: true}).click();
    await expect.poll(() => git('rev-parse', 'HEAD^')).toBe(current);
    assert.equal(git('diff', past, 'HEAD'), '');
    await expect(history.getByRole('button', {name: new RegExp(`^Restore project from ${past},`)})).toBeVisible();
    await page.getByRole('button', {name: 'Reload Whole Project', exact: true}).click();
    await page.waitForFunction(() => window.vm.runtime.targets.some(target => target.sprite?.name === 'Cat'));
});

test('opens a device folder in a new Editor tab and saves a block edit without clobbering external changes', {timeout: 45000}, async t => {
    const build = process.env.E2E_PROJECT_FOLDER_BUILD;
    assert.ok(build && path.isAbsolute(build), 'Set E2E_PROJECT_FOLDER_BUILD to the built Editor directory');
    await verifyWebEditor(build);
    const {folder, project} = await createDiskProject(t, 'tw-project-device-');
    const source = path.join(folder, projectFile);

    const {original, originalProject, editor, openAgain, errors} = await openDeviceFolder(t, build, folder, '&twPlusLocalGit=0', true);
    const status = editor.locator('[data-project-folder-status]');
    await expect(status).toHaveText('Project folder opened.');
    const drawer = editor.getByRole('toolbar', {name: 'Drawer views', exact: true});
    await expect(editor.locator('.twgit-branch-button')).toHaveCount(0);
    await expect(drawer.getByRole('button', {name: 'Git history', exact: true})).toHaveCount(0);
    await drawer.getByRole('button', {name: 'Project folder', exact: true}).click();
    await expect(editor.getByRole('treeitem', {name: /^project\.source\.json/})).toBeVisible();

    const save = async (message: string, tab = editor) => {
        await tab.getByText('File', {exact: true}).click();
        await tab.getByRole('button', {name: 'Save Project', exact: true}).click();
        await expect(tab.locator('[data-project-folder-status]')).toHaveText(message);
    };
    await save('No changes to save.');
    assert.equal(await readFile(source, 'utf8'), stringify(project));
    const io = () => editor.evaluate(() => (window as any).folderIO);
    assert.deepEqual(await io(), {loads: ['string'], writes: 0,
        picker: {id: 'turbowarp-plus-project-folder', mode: 'readwrite'}});
    await drawer.getByRole('button', {name: 'Sprites', exact: true}).click();
    await editFolderBlock(editor, 'value');
    const marker = editor.getByRole('button', {name: 'Unsaved changes. Open the save menu'});
    const tabMarker = (name: string) => editor.locator('.dv-tab')
        .and(editor.getByRole('tab', {name, exact: true})).locator('[data-tw-plus-unsaved-tab]');
    await expect(tabMarker('Cat')).toBeVisible();
    await expect(tabMarker('Bird')).toBeHidden();
    await marker.click();
    await editor.getByRole('button', {name: 'Save Project', exact: true}).click();
    await expect(status).toHaveText('Project folder saved.');
    await expect(marker).toHaveCount(0);
    await expect(tabMarker('Cat')).toBeHidden();
    const expected = structuredClone(project);
    const blocks = expected.targets[1].blocks;
    blocks.move_B.inputs.STEPS[1][1] = '20';
    assert.equal(await readFile(source, 'utf8'), stringify(expected));
    assert.equal(await original.evaluate(() => window.vm.toJSON()), originalProject);

    await editFolderBlock(editor, 'position');
    await save('Project folder saved.');
    Object.assign(blocks.flag_A, {x: 160, y: 110});
    await expect.poll(() => readFile(source, 'utf8')).toBe(stringify(expected));

    await editFolderBlock(editor, 'append');
    await save('Project folder saved.');
    appendSayToSource(blocks);
    const snapshot = stringify(expected);
    await expect.poll(() => readFile(source, 'utf8')).toBe(snapshot);

    const reopened = await openAgain();
    await expect(reopened.locator('[data-project-folder-status]')).toHaveText('Project folder opened.');
    assert.deepEqual(await reopened.evaluate(() => {
        const cat = JSON.parse(window.vm.toJSON(undefined, {allowOptimization: false}))
            .targets.find(entry => entry.name === 'Cat');
        return [cat.blocks.move_B.inputs.STEPS[1][1], cat.blocks.flag_A.x, cat.blocks.say_C.parent];
    }), ['20', 160, 'move_B']);
    await save('No changes to save.', reopened);
    assert.equal(await readFile(source, 'utf8'), snapshot);
    await reopened.close();

    // Refuse edits made just before saving, or after a writable stream has opened.
    const conflict = 'The project folder changed outside the editor or is no longer open. Your edits are still in the editor.';
    await editFolderBlock(editor, 'value', '35');
    const external = '\uFEFF' + snapshot;
    await writeFile(source, external);
    await save(conflict);
    assert.equal(await readFile(source, 'utf8'), external);
    assert.equal(await editor.evaluate(() => JSON.parse(window.vm.toJSON(undefined, {allowOptimization: false}))
        .targets.find(entry => entry.name === 'Cat').blocks.move_B.inputs.STEPS[1][1]), '35');

    await writeFile(source, snapshot);
    const concurrent = external + '\n';
    await editor.exposeFunction('changeFolderFileDuringWrite', () => writeFile(source, concurrent));
    await editor.evaluate(() => {
        const write = FileSystemWritableFileStream.prototype.write;
        FileSystemWritableFileStream.prototype.write = async function(data) {
            await write.call(this, data);
            await (window as unknown as {changeFolderFileDuringWrite(): Promise<void>}).changeFolderFileDuringWrite();
        };
    });
    await save(conflict);
    await expect.poll(() => readFile(source, 'utf8')).toBe(concurrent);
    assert.equal((await io()).writes, 4);
    assert.deepEqual(errors, []);
});

test('saves real Editor sprite state and costume assets back to the device folder', {timeout: 45000}, async t => {
    const build = process.env.E2E_PROJECT_FOLDER_BUILD;
    assert.ok(build && path.isAbsolute(build), 'Set E2E_PROJECT_FOLDER_BUILD to the built Editor directory');
    await verifyWebEditor(build);
    const {folder, project, costume, sound, svg, wav} = await createDiskProject(t, 'tw-project-assets-');
    const source = path.join(folder, projectFile);
    const manifest = path.join(folder, 'sb3-source.json');
    // Keep the existing stacking order explicit, so a duplicate/delete round trip can be compared exactly.
    for (const [index, sprite] of project.targets.entries()) {
        if (!sprite.isStage) Object.assign(sprite, {layerOrder: index});
    }
    await writeFile(source, stringify(project));
    const read = async () => JSON.parse(await readFile(source, 'utf8'));
    const manifestBefore = await readFile(manifest, 'utf8');
    const {original, originalProject, editor, openAgain, errors} = await openDeviceFolder(t, build, folder, '', true);
    const status = editor.locator('[data-project-folder-status]');
    await expect(status).toHaveText('Project folder opened.');
    assert.deepEqual(await editor.evaluate(() => {
        const cat = window.vm.runtime.targets.find(entry => entry.sprite.name === 'Cat');
        return [cat.sprite.costumes[0].asset.assetId, cat.sprite.sounds[0].asset.assetId];
    }), [costume.assetId, sound.assetId]);
    const save = async () => {
        const writes = await editor.evaluate(() => (window as any).folderIO.writes);
        await editor.getByText('File', {exact: true}).click();
        await editor.getByRole('button', {name: 'Save Project', exact: true}).click();
        await expect.poll(() => editor.evaluate(() => (window as any).folderIO.writes)).toBe(writes + 1);
        await expect(status).toHaveText('Project folder saved.');
    };

    const expected = await read();
    await editor.evaluate(() => {
        const vm = window.vm;
        const cat = vm.runtime.targets.find(entry => entry.sprite.name === 'Cat');
        cat.setXY(30, -20);
        cat.setSize(150);
        const stage = vm.runtime.getTargetForStage();
        stage.createVariable('score_id', 'score', '');
        stage.variables.score_id.value = 7;
    });
    await save();
    Object.assign(expected.targets[1], {x: 30, y: -20, size: 150});
    expected.targets[0].variables.score_id = ['score', 7];
    await expect.poll(read).toEqual(expected);
    assert.equal(await readFile(manifest, 'utf8'), manifestBefore);

    await editor.evaluate(() => {
        const vm = window.vm;
        vm.renameSprite(vm.runtime.targets.find(entry => entry.sprite.name === 'Cat').id, 'Kitten');
    });
    await save();
    expected.targets[1].name = 'Kitten';
    assert.equal(await readFile(source, 'utf8'), stringify(expected));

    const newCostume = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#2a9d4b"/></svg>';
    const assetFile = await editor.evaluate(async svg => {
        const vm = window.vm;
        await vm.duplicateSprite(vm.runtime.targets.find(entry => entry.sprite.name === 'Kitten').id);
        const duplicate = vm.runtime.targets.find(entry => entry.isOriginal && entry.sprite.name === 'Kitten2');
        const storage = vm.runtime.storage;
        const asset = storage.createAsset(storage.AssetType.ImageVector, 'svg', new TextEncoder().encode(svg), null, true);
        const md5ext = `${asset.assetId}.svg`;
        await vm.addCostume(md5ext, {name: 'Green', asset, dataFormat: 'svg', assetId: asset.assetId, md5: md5ext,
            rotationCenterX: 16, rotationCenterY: 16, bitmapResolution: 1}, duplicate.id);
        return md5ext;
    }, newCostume);
    await save();
    const costumePath = path.join(folder, 'assets', assetFile);
    await expect.poll(() => readFile(costumePath, 'utf8')).toBe(newCostume);
    assert.ok(JSON.parse(await readFile(manifest, 'utf8')).archiveEntries.includes(assetFile));
    const withCopy = await read();
    assert.deepEqual(withCopy.targets.map(target => target.name), ['Stage', 'Kitten', 'Bird', 'Kitten2']);
    assert.ok(withCopy.targets[3].costumes.some(entry => entry.md5ext === assetFile));

    const reopened = await openAgain();
    await expect(reopened.locator('[data-project-folder-status]')).toHaveText('Project folder opened.');
    const reloadedAsset = await reopened.evaluate(() => window.vm.runtime.targets.find(entry => entry.sprite.name === 'Kitten2')
        .sprite.costumes.find(entry => entry.name === 'Green').asset.assetId);
    assert.equal(reloadedAsset, assetFile.replace(/\.svg$/u, ''));
    await reopened.close();

    editor.once('dialog', dialog => dialog.accept());
    await editor.evaluate(() => {
        const vm = window.vm;
        vm.deleteSprite(vm.runtime.targets.find(entry => entry.isOriginal && entry.sprite.name === 'Kitten2').id);
    });
    await save();
    await expect.poll(async () => {
        try {
            await readFile(costumePath);
            return true;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            return false;
        }
    }).toBe(false);
    assert.equal(await readFile(manifest, 'utf8'), manifestBefore);
    assert.equal(await readFile(source, 'utf8'), stringify(expected));
    await editor.evaluate(() => {
        const vm = window.vm;
        vm.renameSprite(vm.runtime.targets.find(entry => entry.sprite.name === 'Kitten').id, 'Cat');
    });
    await save();
    expected.targets[1].name = 'Cat';
    assert.equal(await readFile(source, 'utf8'), stringify(expected));
    assert.deepEqual(await readFile(path.join(folder, 'assets', costume.md5ext)), svg);
    assert.deepEqual(await readFile(path.join(folder, 'assets', sound.md5ext)), wav);
    assert.equal(await original.evaluate(() => window.vm.toJSON()), originalProject);
    assert.deepEqual(errors, []);
});


test('routes project and active-file saves from the current Editor folder drawer', {timeout: 60000}, async t => {
    const root = process.env.E2E_PROJECT_FOLDER_BUILD;
    assert.ok(root && path.isAbsolute(root), 'Set E2E_PROJECT_FOLDER_BUILD to the built Editor directory');
    await verifyWebEditor(root);
    const {folder, costume, sound} = await createDiskProject(t, 'tw-project-files-', true);
    // Keep inspection commands such as status from refreshing the index behind the open Git panel.
    const git = (...args: string[]) => execFileSync('git', ['--no-optional-locks', ...args],
        {cwd: folder, encoding: 'utf8'}).trim();
    git('init', '-q', '-b', 'main');
    git('config', 'core.autocrlf', 'false');
    git('add', '.');
    git('-c', 'user.name=Editor folder fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
    await writeFile(path.join(folder, 'new.txt'), 'A new file\n');

    const {editor: page, errors} = await openDeviceFolder(t, root, folder);
    const status = page.locator('[data-project-folder-status]');
    await expect(status).toHaveText('Project folder opened.');
    await expect(page.getByRole('button', {name: 'Branch: main', exact: true})).toBeVisible();
    const drawerBar = page.getByRole('toolbar', {name: 'Drawer views', exact: true});
    await drawerBar.getByRole('button', {name: 'Project folder', exact: true}).click();
    const sourceRow = page.locator(`.twpf-explorer-item[data-path="${projectFile}"]`);
    await expect(sourceRow.locator('.twpf-explorer-description')).toHaveText('Project data');
    const folderTools = page.getByRole('group', {name: 'Project folder tools'});
    const [folderPopup] = await Promise.all([page.waitForEvent('popup', {timeout: 7000}),
        folderTools.getByRole('button', {name: 'Open in another window'}).click()]);
    await expect(folderPopup.getByRole('tree', {name: 'Project folder'})).toBeVisible();
    await folderPopup.close();
    await expect(drawerBar.getByRole('button', {name: 'Project folder', exact: true})).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-drawer-content="project"]').getByRole('tree', {name: 'Project folder'})).toBeVisible();
    const fileTab = (name: string) => page.locator('.dv-tab').and(page.getByRole('tab', {name, exact: true}));
    const preview = page.locator('.twpf-preview:visible');
    const openFile = (name: string) => page.locator(`[data-path="${name}"]`).click();
    const closeFile = (name: string) => fileTab(name).locator('.dv-default-tab-action').click();
    await page.getByRole('button', {name: 'Search project files'}).click();
    const fileSearch = page.getByRole('searchbox', {name: 'Search project files'});
    await fileSearch.fill(projectFile.toUpperCase());
    const fileResult = page.getByRole('group', {name: 'Matching files'}).getByRole('button', {name: projectFile});
    await fileResult.click();
    await expect(preview.locator('.twpf-syntax-name').first()).toHaveText('"targets"');
    await fileSearch.press('Escape');
    await expect(sourceRow).toBeVisible();
    await openFile(projectFile);
    await expect(fileTab(projectFile)).toHaveCount(1);
    await closeFile(projectFile);

    await page.locator(`[data-path="${noteFile}"]`).press('Enter');
    const editor = preview.getByRole('textbox', {name: noteFile, exact: true});
    const previewButton = (name: string) => preview.getByRole('button', {name, exact: true});
    const previewMode = (name: string) => preview.getByRole('radio', {name, exact: true});
    const leftCode = preview.locator('.cm-merge-a .cm-content');
    const rightCode = preview.locator('.cm-merge-b .cm-content');
    await expect(editor.locator('.twpf-syntax-keyword').first()).toHaveText('export');
    await expect(preview.locator('.twpf-file-path')).toHaveCount(0);
    await expect(previewButton('Save file')).toBeDisabled();
    await previewMode('Diff view').click();
    await expect(preview.getByText('No differences.', {exact: true})).toBeVisible();
    await previewMode('Normal view').click();
    const editNote = async (value: string) => {
        await editor.focus();
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.insertText(note(value));
        await expect(previewButton('Save file')).toBeEnabled();
    };
    await editNote('working draft');
    const noteRow = page.locator(`.twpf-explorer-item[data-path="${noteFile}"]`);
    const noteStar = noteRow.locator('.twpf-explorer-name + [data-tw-plus-unsaved-marker]');
    await expect(noteStar).toHaveText('*');
    await expect(noteStar).toHaveCSS('white-space', 'pre');
    await expect(noteStar).toHaveCSS('font-weight', '700');
    await expect(noteRow).toHaveAccessibleName(/Unsaved changes/);
    const drawerView = (name: string) => drawerBar.getByRole('button', {name, exact: true});
    const projectSave = page.getByRole('button', {name: 'Save Project', exact: true});
    const tabSave = page.getByRole('button', {name: 'Save Active Tab', exact: true});
    const fileMenu = page.getByText('File', {exact: true});
    await fileMenu.click();
    await expect(tabSave).toHaveAttribute('aria-keyshortcuts', /^(Control|Meta)\+S$/);
    await expect(tabSave).toBeEnabled();
    await expect(projectSave).not.toHaveAttribute('aria-keyshortcuts');
    await fileMenu.click();
    await drawerView('Sprites').click();
    await fileMenu.click();
    await expect(projectSave).toHaveAttribute('aria-keyshortcuts', /^(Control|Meta)\+S$/);
    await expect(tabSave).toHaveCount(0);
    await fileMenu.click();
    await editor.press('ControlOrMeta+s');
    await expect(status).toHaveText('No changes to save.');
    await drawerView('Project folder').click();
    await fileMenu.click();
    await projectSave.click();
    await expect(status).toHaveText('No changes to save.');
    await expect(editor).toContainText('working draft');
    assert.equal(await readFile(path.join(folder, noteFile), 'utf8'),
        '\uFEFF' + note('committed').replaceAll('\n', '\r\n'));
    await previewMode('Diff view').click();
    await expect(preview.locator('.twpf-diff-headings')).toContainText(git('rev-parse', 'HEAD').slice(0, 8));
    await expect(leftCode.locator('.twpf-syntax-string', {hasText: 'committed'})).toBeVisible();
    await expect(rightCode.locator('.twpf-syntax-string', {hasText: 'working draft'})).toBeVisible();
    await expect(leftCode.getByText('// Header', {exact: true})).toHaveCount(0);
    await previewButton('Full file').click();
    await expect(leftCode.getByText('// Header', {exact: true})).toBeVisible();
    await expect(rightCode.getByText('// Footer', {exact: true})).toBeVisible();
    await previewButton('Changes only').click();
    await expect(leftCode.getByText('// Header', {exact: true})).toHaveCount(0);
    await previewMode('Normal view').click();
    await expect(editor).toContainText('working draft');
    await drawerView('Project folder').focus();
    await page.keyboard.press('ControlOrMeta+s');
    await expect(preview.locator('.twpf-file-snackbar').filter({hasText: 'Saved.'})).toBeVisible();
    await expect(noteStar).toHaveCount(0);
    assert.equal(await readFile(path.join(folder, noteFile), 'utf8'), '\uFEFF' + note('working draft').replaceAll('\n', '\r\n'));
    assert.equal(git('diff', '--cached', '--name-only'), '');
    await editNote('menu save');
    await fileMenu.click();
    await tabSave.click();
    await expect(preview.locator('.twpf-file-snackbar').filter({hasText: 'Saved.'})).toBeVisible();
    assert.equal(await readFile(path.join(folder, noteFile), 'utf8'), '\uFEFF' + note('menu save').replaceAll('\n', '\r\n'));

    await editNote('conflicting draft');
    await writeFile(path.join(folder, noteFile), note('external'));
    await previewButton('Save file').click();
    await expect(preview.getByRole('status')).toContainText('The file changed outside this tab.');
    assert.equal(await readFile(path.join(folder, noteFile), 'utf8'), note('external'));
    await expect(editor).toContainText('conflicting draft');
    page.once('dialog', dialog => dialog.dismiss());
    await closeFile(noteFile);
    await expect(fileTab(noteFile)).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await closeFile(noteFile);
    await expect(fileTab(noteFile)).toHaveCount(0);
    git('restore', '--', noteFile);

    await openFile('new.txt');
    await previewMode('Diff view').click();
    await expect(preview.getByText('This file is not in the latest commit.', {exact: true})).toBeVisible();
    await expect(rightCode).toContainText('A new file');
    await closeFile('new.txt');
    await rm(path.join(folder, 'new.txt'));

    await openFile('assets');
    await openFile(`assets/${costume.md5ext}`);
    await fileMenu.click();
    await expect(tabSave).toBeDisabled();
    await expect(tabSave).toHaveAttribute('aria-keyshortcuts', /^(Control|Meta)\+S$/);
    await fileMenu.click();
    await expect.poll(() => preview.getByRole('img', {name: costume.md5ext}).evaluate((image: HTMLImageElement) =>
        image.naturalWidth)).toBe(32);
    await closeFile(costume.md5ext);
    const expectPlayback = async (selector: string) => {
        const media = preview.locator(selector);
        await media.evaluate(async (element: HTMLMediaElement) => {
            element.muted = true;
            await element.play();
        });
        await expect.poll(() => media.evaluate((element: HTMLMediaElement) => element.currentTime)).toBeGreaterThan(0);
    };
    await openFile(`assets/${sound.md5ext}`);
    await expect.poll(() => preview.locator('audio[controls]').evaluate((audio: HTMLAudioElement) => audio.duration))
        .toBeCloseTo(0.1);
    await expectPlayback('audio[controls]');
    await closeFile(sound.md5ext);
    await openFile('clip.webm');
    await expect.poll(() => preview.locator('video[controls]').evaluate((video: HTMLVideoElement) => video.videoWidth)).toBe(16);
    await expectPlayback('video[controls]');
    await closeFile('clip.webm');
    assert.deepEqual(errors, []);
});

test('switches branches of the open project folder and refuses to discard unsaved block edits', {timeout: 45000}, async t => {
    const build = process.env.E2E_PROJECT_FOLDER_BUILD;
    assert.ok(build && path.isAbsolute(build), 'Set E2E_PROJECT_FOLDER_BUILD to the built Editor directory');
    await verifyWebEditor(build);
    const {folder, project} = await createDiskProject(t, 'tw-project-branch-', true);
    const source = path.join(folder, projectFile);
    const git = (...args: string[]) => execFileSync('git', ['--no-optional-locks', ...args],
        {cwd: folder, encoding: 'utf8'}).trim();
    git('init', '-q', '-b', 'main');
    git('config', 'core.autocrlf', 'false');
    git('config', 'user.name', 'Editor branch fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    git('add', '.');
    git('commit', '-qm', 'Main project');
    git('checkout', '-q', '-b', 'variant');
    project.targets[1].blocks.move_B.inputs.STEPS[1][1] = '88';
    await writeFile(source, stringify(project));
    git('add', projectFile);
    git('commit', '-qm', 'Variant project');
    git('checkout', '-q', 'main');

    const {editor: page, errors} = await openDeviceFolder(t, build, folder);
    const branchButton = (name: string) => page.getByRole('button', {name: `Branch: ${name}`, exact: true});
    const menu = page.getByRole('menu', {name: 'Branches'});
    const select = async (from: string, to: string) => {
        await branchButton(from).click();
        await expect(menu.getByRole('menuitemradio', {name: from, exact: true})).toHaveAttribute('aria-checked', 'true');
        await menu.getByRole('menuitemradio', {name: to, exact: true}).click();
    };
    const valueOnDisk = async () => JSON.parse(await readFile(source, 'utf8')).targets[1].blocks.move_B.inputs.STEPS[1][1];
    const valueInEditor = () => page.evaluate(() => {
        const target = window.vm?.runtime.targets.find(entry => entry.sprite?.name === 'Cat');
        const id = target?.blocks.getBlock('move_B')?.inputs.STEPS.block;
        return id ? String(target?.blocks.getBlock(id)?.fields.NUM.value) : null;
    });
    await expect.poll(valueInEditor).toBe('10');
    await select('main', 'variant');
    const snackbar = page.locator('[data-git-snackbar]');
    await expect(branchButton('variant')).toBeVisible();
    await expect(snackbar.getByRole('status')).toHaveText('Switched branches.');
    assert.equal(git('branch', '--show-current'), 'variant');
    assert.equal(await valueOnDisk(), '88');
    await snackbar.getByRole('button', {name: 'Reload Project'}).click();
    await expect.poll(valueInEditor).toBe('88');

    await editFolderBlock(page, 'value', '90');
    await select('variant', 'main');
    const refusal = 'Stop the project, and save or record (or undo) every change, before switching branches.';
    await expect(snackbar.getByRole('alert')).toHaveText(refusal);
    assert.equal(git('branch', '--show-current'), 'variant');
    assert.equal(await valueOnDisk(), '88');
    assert.equal(await valueInEditor(), '90');
    await snackbar.getByRole('button', {name: 'Open Local Git'}).focus();
    await page.keyboard.press('Escape');
    await expect(snackbar).toHaveCount(0);
    await select('variant', 'main');
    await snackbar.getByRole('button', {name: 'Open Local Git'}).click();
    const panel = page.locator('.twgit-panel');
    await expect(panel.getByText(refusal)).toBeVisible();
    await page.getByRole('button', {name: 'Close Local Git', exact: true}).click();

    git('branch', 'from-another-tool');
    await branchButton('variant').click();
    await expect(menu.getByRole('menuitemradio', {name: 'from-another-tool', exact: true})).toBeVisible();
    await page.keyboard.press('Escape');
    git('symbolic-ref', 'HEAD', 'refs/heads/from-another-tool');
    await expect(branchButton('from-another-tool')).toBeVisible();
    assert.deepEqual(errors, []);
});

test('tracks native Git status in the project explorer with the Git panel closed', {timeout: 45000}, async t => {
    const build = process.env.E2E_PROJECT_FOLDER_BUILD;
    assert.ok(build && path.isAbsolute(build), 'Set E2E_PROJECT_FOLDER_BUILD to the built Editor directory');
    await verifyWebEditor(build);
    const {folder} = await createDiskProject(t, 'tw-project-status-', true);
    const git = (...args: string[]) => execFileSync('git', ['--no-optional-locks', ...args],
        {cwd: folder, encoding: 'utf8'}).trim();
    git('init', '-q', '-b', 'main');
    git('config', 'core.autocrlf', 'false');
    git('config', 'user.name', 'Editor status fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    git('add', '.');
    git('commit', '-qm', 'Initial project');

    const {editor: page, errors} = await openDeviceFolder(t, build, folder);
    const status = page.locator('[data-project-folder-status]');
    await expect(status).toHaveText('Project folder opened.');
    const drawer = page.getByRole('toolbar', {name: 'Drawer views', exact: true});
    await drawer.getByRole('button', {name: 'Project folder', exact: true}).click();
    const panelClose = page.getByRole('button', {name: 'Close Local Git', exact: true});
    if (await panelClose.isVisible()) await panelClose.click();
    await page.getByRole('tab', {name: 'Cat', exact: true}).click();
    await expect(page.locator('.twgit-panel:visible')).toHaveCount(0);
    const explorerRow = (name: string) => page.locator(`.twpf-explorer-item[data-path="${name}"]`);
    const row = explorerRow(projectFile);
    const star = row.locator('.twpf-explorer-name + [data-tw-plus-unsaved-marker]');
    const save = async () => {
        await page.getByText('File', {exact: true}).click();
        await page.getByRole('button', {name: 'Save Project', exact: true}).click();
        await expect(status).toHaveText('Project folder saved.');
    };
    await expect(row).toHaveAttribute('data-revision', 'committed');
    await editFolderBlock(page, 'value', '26');
    await expect(star).toHaveText('*');
    await expect(row).toHaveAccessibleName(/Unsaved changes/);
    await save();
    await expect(star).toHaveCount(0);
    await expect(row).toHaveAccessibleName(/Saved, not committed/);

    git('add', projectFile);
    await expect(row).toHaveAttribute('data-staged', '');
    await editFolderBlock(page, 'value', '27');
    await expect(star).toHaveText('*');
    await expect(row).toHaveAttribute('data-staged', '');
    git('reset', '-q', 'HEAD', '--', projectFile);
    await expect(row).not.toHaveAttribute('data-staged');
    await expect(star).toHaveText('*');
    await save();
    await expect(star).toHaveCount(0);
    git('add', projectFile);
    git('commit', '-qm', 'Record the edit');
    await expect(row).toHaveAttribute('data-revision', 'committed');
    await expect(row).toHaveAccessibleName(/Committed/);

    // Real local tracking refs mark the files pushed; only GitHub-confirmed file bytes become merged.
    const pushed = git('rev-parse', 'HEAD');
    const pushedBlob = git('rev-parse', 'HEAD:' + projectFile);
    const merge = 'a'.repeat(40);
    const mergeTree = 'b'.repeat(40);
    let releaseMerge = () => {};
    const confirmMerge = new Promise<void>(resolve => {releaseMerge = resolve;});
    await page.context().route('https://api.github.com/repos/fixture-owner/project/**', async route => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname.endsWith('/commits/' + pushed + '/pulls')) {
            await confirmMerge;
            return route.fulfill({json: [{number: 1, title: 'Record the edit', merged_at: '2026-11-13T00:00:00Z',
                merge_commit_sha: merge, base: {sha: pushed, ref: 'trunk', repo: {full_name: 'fixture-owner/project'}},
                head: {sha: pushed, ref: 'main', repo: {full_name: 'fixture-owner/project'}}}]});
        }
        if (pathname.endsWith('/git/commits/' + merge)) return route.fulfill({json: {tree: {sha: mergeTree}}});
        if (pathname.endsWith('/git/trees/' + mergeTree)) return route.fulfill({json: {truncated: false,
            tree: [{path: projectFile, sha: pushedBlob, type: 'blob', mode: '100644'}]}});
        if (pathname.endsWith('/pulls/1/files')) return route.fulfill({json: [
            {filename: projectFile, status: 'modified', sha: pushedBlob}
        ]});
        return route.abort();
    });
    const sibling = explorerRow('sb3-source.json');
    git('remote', 'add', 'origin', 'https://github.com/fixture-owner/project.git');
    git('update-ref', 'refs/remotes/origin/main', pushed);
    try {
        await expect(row).toHaveAttribute('data-revision', 'pushed');
        await expect(row).toHaveAccessibleName(/Pushed/);
        await expect(sibling).toHaveAttribute('data-revision', 'pushed');
    } finally {
        releaseMerge();
    }
    await expect(row).toHaveAttribute('data-revision', 'merged');
    await expect(row).toHaveAccessibleName(/Pull request merged/);
    await expect(sibling).toHaveAttribute('data-revision', 'pushed');

    git('branch', 'unconfirmed', pushed);
    git('update-ref', 'refs/remotes/origin/unconfirmed', pushed);
    git('symbolic-ref', 'HEAD', 'refs/heads/unconfirmed');
    await expect(row).toHaveAttribute('data-revision', 'pushed');
    git('remote', 'remove', 'origin');
    await expect(row).toHaveAttribute('data-revision', 'committed');
    await expect(sibling).toHaveAttribute('data-revision', 'committed');
    await expect(page.locator('.twgit-panel:visible')).toHaveCount(0);
    assert.equal(git('status', '--porcelain'), '');

    await rm(path.join(folder, noteFile));
    const removed = explorerRow(noteFile);
    const removedName = removed.locator('.twpf-explorer-name');
    await expect(removedName).toHaveCSS('text-decoration-line', 'line-through');
    await expect(removed).toHaveAttribute('aria-disabled', 'true');
    git('restore', '--', noteFile);
    await expect(removedName).toHaveCSS('text-decoration-line', 'none');
    await expect(removed).not.toHaveAttribute('aria-disabled');
    assert.deepEqual(errors, []);
});

test('reviews, saves and commits only the selected block diff from Local Git', {timeout: 45000}, async t => {
    const build = process.env.E2E_PROJECT_FOLDER_BUILD;
    assert.ok(build && path.isAbsolute(build), 'Set E2E_PROJECT_FOLDER_BUILD to the built Editor directory');
    await verifyWebEditor(build);
    const {folder, project} = await createDiskProject(t, 'tw-project-review-', true);
    const source = path.join(folder, projectFile);
    const git = (...args: string[]) => execFileSync('git', ['--no-optional-locks', ...args],
        {cwd: folder, encoding: 'utf8'}).trim();
    git('init', '-q', '-b', 'main');
    git('config', 'core.autocrlf', 'false');
    git('config', 'user.name', 'Editor review fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    git('add', '.');
    git('commit', '-qm', 'Initial project');
    const revision = git('rev-parse', 'HEAD');
    const index = await readFile(path.join(folder, '.git', 'index'));

    const {editor: page, errors} = await openDeviceFolder(t, build, folder);
    await expect(page.locator('[data-project-folder-status]')).toHaveText('Project folder opened.');
    await expect(page.getByRole('button', {name: 'Branch: main', exact: true})).toBeVisible();
    await editFolderBlock(page, 'value', '26');
    await page.getByRole('button', {name: 'Branch: main', exact: true}).click();
    await page.getByRole('menu', {name: 'Branches'}).getByRole('menuitem', {name: 'Open Local Git'}).click();
    const panel = page.locator('.twgit-panel');
    await expect(panel).toBeVisible();

    const saveTask = panel.getByRole('button', {name: 'Save files', exact: true});
    const savedTask = panel.getByRole('button', {name: 'Commit saved changes', exact: true});
    const unsavedPane = panel.getByRole('region', {name: 'Save files', exact: true});
    await expect(saveTask.locator('.twgit-count')).toHaveText('1');
    await saveTask.click();
    await unsavedPane.getByRole('button', {name: projectFile, exact: true}).click();
    const unsavedDiff = unsavedPane.locator('.twgit-save-diff');
    await expect(unsavedDiff).toContainText('HEAD → Unsaved edits');
    await unsavedDiff.locator('.twgit-review-script summary').first().click();
    await expect(unsavedDiff.locator('svg.blocklySvg').last()).toBeVisible();
    assert.equal(await readFile(source, 'utf8'), stringify(project));
    assert.deepEqual(await readFile(path.join(folder, '.git', 'index')), index);
    await unsavedPane.getByRole('button', {name: 'Save unsaved files', exact: true}).click();
    await expect(saveTask.locator('.twgit-count')).toHaveText('0');
    await expect(savedTask.locator('.twgit-count')).toHaveText('1');
    project.targets[1].blocks.move_B.inputs.STEPS[1][1] = '26';
    assert.equal(await readFile(source, 'utf8'), stringify(project));
    assert.equal(git('rev-parse', 'HEAD'), revision);
    assert.equal(git('diff', '--cached', '--name-only'), '');

    if (await savedTask.getAttribute('aria-expanded') !== 'true') await savedTask.click();
    const changed = panel.getByRole('region', {name: 'Changes by project element'});
    await expect(changed).toContainText('Cat');
    const savedPane = panel.getByRole('region', {name: 'Commit saved changes', exact: true});
    const commitForm = savedPane.getByRole('form', {name: 'Commit selected files'});
    await saveTask.press('Enter');
    await expect(saveTask).toBeFocused();
    await expect(unsavedPane).toBeVisible();
    await expect(commitForm).toBeHidden();
    await savedTask.press('Enter');
    await expect(savedTask).toBeFocused();
    await expect(commitForm).toBeVisible();
    await changed.getByText('List by file', {exact: true}).click();
    await savedPane.getByRole('button', {name: /^project\.source\.json/}).click();
    const savedDiff = savedPane.getByRole('region', {name: 'Project changes', exact: true});
    await savedDiff.locator('.twgit-review-script summary').first().click();
    await expect(savedDiff.locator('svg.blocklySvg').last()).toBeVisible();
    await savedDiff.getByRole('button', {name: 'After · Highlight in Editor', exact: true}).click();
    await expect.poll(() => page.evaluate(() => (window as any).ScratchBlocks.getMainWorkspace().getAllBlocks(false)
        .some(block => block.getSvgRoot()?.classList.contains('twgit-changed-block')))).toBe(true);
    await page.getByRole('tab', {name: 'Local Git', exact: true}).click();
    await savedPane.getByRole('button', {name: 'Text', exact: true}).click();
    await expect(savedPane.locator('.twgit-diff .diff')).toContainText('26');
    assert.deepEqual(await readFile(path.join(folder, '.git', 'index')), index);

    await writeFile(path.join(folder, noteFile), 'Unrelated staged edit\n');
    git('add', noteFile);
    const stagedBefore = await readFile(path.join(folder, '.git', 'index'));
    const select = savedPane.getByRole('checkbox', {name: 'Include in commit: ' + projectFile, exact: true});
    await select.check();
    assert.deepEqual(await readFile(path.join(folder, '.git', 'index')), stagedBefore);
    await select.uncheck();
    const commit = savedPane.getByRole('button', {name: 'Commit', exact: true});
    await expect(commit).toBeDisabled();
    await select.check();
    await savedPane.getByLabel('Commit message').fill('Record only the project edit');
    await commit.click();
    await expect(panel.getByText('Recorded the changes (commit).')).toBeVisible();
    assert.equal(git('log', '-1', '--format=%s|%an'), 'Record only the project edit|Editor review fixture');
    assert.equal(git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'), projectFile);
    assert.equal(git('show', 'HEAD:' + projectFile), stringify(project).trimEnd());
    assert.equal(git('status', '--porcelain', '--', projectFile), '');
    assert.equal(git('diff', '--cached', '--name-only'), noteFile);
    assert.equal(git('show', ':' + noteFile), 'Unrelated staged edit');
    git('fsck', '--no-progress');

    // The successful commit has already refreshed the Record history; don't click Refresh to find it.
    await panel.getByRole('button', {name: 'Create PR', exact: true}).click();
    const record = panel.getByRole('button', {name: /^Record only the project edit, /});
    await record.click();
    await expect(record).toHaveAttribute('aria-pressed', 'true');
    await expect(panel.getByRole('region', {name: 'Changes by project element'})).toContainText('Cat');
    const commitFiles = panel.locator('details.twgit-file-list:visible').first();
    if (await commitFiles.isVisible() && !await commitFiles.evaluate(details => (details as HTMLDetailsElement).open)) {
        await commitFiles.locator('summary').click();
    }
    await expect(panel.locator('[data-git-group="commit"]').filter({hasText: projectFile})).toBeVisible();
    assert.deepEqual(errors, []);
});

test('applies external project-file changes to the real workspace and preserves unsaved edits until chosen', {timeout: 45000}, async t => {
    const build = process.env.E2E_PROJECT_FOLDER_BUILD;
    assert.ok(build && path.isAbsolute(build), 'Set E2E_PROJECT_FOLDER_BUILD to the built Editor directory');
    await verifyWebEditor(build);
    const {folder, project} = await createDiskProject(t, 'tw-project-watch-');
    const source = path.join(folder, projectFile);
    const {editor: page, errors} = await openDeviceFolder(t, build, folder, '&twPlusLocalGit=0', true);
    await expect(page.locator('[data-project-folder-status]')).toHaveText('Project folder opened.');
    await page.getByRole('tab', {name: 'Cat', exact: true}).click();
    const notice = page.locator('[data-project-folder-external]');
    const workspaceValue = () => page.evaluate(() => window.ScratchBlocks?.getMainWorkspace()
        ?.getBlockById('move_B')?.getInputTargetBlock('STEPS')?.getFieldValue('NUM'));
    await expect.poll(workspaceValue).toBe('10');
    const diskEdit = async () => {
        await writeFile(source, stringify(project));
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    };
    const catBlocks = project.targets[1].blocks;
    catBlocks.move_B.inputs.STEPS[1][1] = '71';
    Object.assign(catBlocks.flag_A, {x: 180, y: 130});
    await diskEdit();
    await expect.poll(workspaceValue).toBe('71');
    const coordinates = await page.evaluate(() => {
        const {x, y} = window.ScratchBlocks.getMainWorkspace().getBlockById('flag_A').getRelativeToSurfaceXY();
        return {x, y};
    });
    assert.deepEqual(coordinates, {x: 180, y: 130});
    await expect(notice).toBeHidden();
    const loads = () => page.evaluate(() => (window as any).folderIO.loads);
    assert.deepEqual(await loads(), ['string'], 'automatic safe updates do not reload the project');

    await editFolderBlock(page, 'value', '73');
    catBlocks.move_B.inputs.STEPS[1][1] = '74';
    await diskEdit();
    const compare = notice.getByRole('button', {name: 'Compare and Choose…'});
    await expect(notice).toContainText('unsaved edits');
    await compare.click();
    const comparison = page.getByRole('dialog', {name: 'External changes and your unsaved edits'});
    await expect(comparison.getByRole('region', {name: 'Your unsaved edits'})).toBeVisible();
    await expect(comparison.getByRole('region', {name: 'Changes in the folder'})).toBeVisible();
    const keep = comparison.getByRole('button', {name: 'Keep My Edits'});
    await expect(keep).toBeFocused();
    await keep.click();
    await expect(comparison).toHaveCount(0);
    const localValue = () => page.evaluate(() => {
        const blocks = window.vm.editingTarget.blocks;
        const id = blocks.getBlock('move_B').inputs.STEPS.block;
        return blocks.getBlock(id).fields.NUM.value;
    });
    assert.equal(await localValue(), '73');
    assert.equal(await readFile(source, 'utf8'), stringify(project));
    await compare.click();
    await comparison.getByRole('button', {name: 'Discard Edits and Load from Folder'}).click();
    await expect(comparison).toHaveCount(0);
    await expect(notice).toBeHidden();
    await expect.poll(workspaceValue).toBe('74');
    assert.equal(await localValue(), '74');
    const io = await page.evaluate(() => (window as any).folderIO);
    assert.equal(io.writes, 0);
    assert.deepEqual(io.loads, ['string', 'string'], 'explicit discard reloads directly from the folder');
    assert.deepEqual(errors, []);
});

test('a clean device-folder update reads only the changed project payload', {timeout: 45000}, async t => {
    const build = process.env.E2E_PROJECT_FOLDER_BUILD;
    assert.ok(build && path.isAbsolute(build), 'Set E2E_PROJECT_FOLDER_BUILD to the built Editor directory');
    await verifyWebEditor(build);
    const {folder, project} = await createDiskProject(t, 'tw-project-scoped-read-', true);
    // Leave only the stage's loop on the flag: it keeps running without dirtying a sprite's saved state.
    project.targets[1].blocks.flag_A.opcode = 'event_whenthisspriteclicked';
    project.targets[2].blocks.bird_flag.opcode = 'event_whenthisspriteclicked';
    await writeFile(path.join(folder, projectFile), stringify(project));
    const git = (...args: string[]) => execFileSync('git', ['--no-optional-locks', ...args],
        {cwd: folder, encoding: 'utf8'}).trim();
    git('init', '-q', '-b', 'main');
    git('config', 'core.autocrlf', 'false');
    git('add', '.');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Fixture');
    const index = path.join(folder, '.git', 'index');
    const indexBefore = await readFile(index);

    const {editor: page, errors} = await openDeviceFolder(t, build, folder, '', true);
    await expect(page.locator('[data-project-folder-status]')).toHaveText('Project folder opened.');
    await expect(page.locator('.twgit-branch-button')).toHaveAttribute('data-git-branch', 'main');
    await expect(page.locator('.twgit-panel:visible')).toHaveCount(0);
    await page.getByRole('tab', {name: 'Cat', exact: true}).click();
    const workspaceValue = () => page.evaluate(() => window.ScratchBlocks?.getMainWorkspace()
        ?.getBlockById('move_B')?.getInputTargetBlock('STEPS')?.getFieldValue('NUM'));
    await expect.poll(workspaceValue).toBe('10');
    await page.evaluate(() => {
        const state = (window as any).folderIO;
        state.reads = [];
        state.lastRead = performance.now();
        const names = new WeakMap<Blob, string>();
        const getFile = FileSystemFileHandle.prototype.getFile;
        FileSystemFileHandle.prototype.getFile = async function() {
            const file = await getFile.call(this);
            names.set(file, this.name);
            return file;
        };
        const record = (blob: Blob) => {
            const name = names.get(blob);
            if (name) state.reads.push(name);
            state.lastRead = performance.now();
        };
        const arrayBuffer = Blob.prototype.arrayBuffer;
        Blob.prototype.arrayBuffer = function() {record(this); return arrayBuffer.call(this);};
        const text = Blob.prototype.text;
        Blob.prototype.text = function() {record(this); return text.call(this);};
    });
    // Exclude opening work and report settled reads from the subsequent disk update separately.
    const settleReads = () => page.waitForFunction(() => performance.now() - (window as any).folderIO.lastRead > 1000);
    await settleReads();
    await page.evaluate(() => {(window as any).folderIO.reads = [];});
    project.targets[1].blocks.move_B.inputs.STEPS[1][1] = '71';
    await writeFile(path.join(folder, projectFile), stringify(project));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(workspaceValue).toBe('71');
    await settleReads();
    const io = await page.evaluate(() => (window as any).folderIO as {reads: string[]; writes: number; loads: string[]});
    const refNames = new Set(['HEAD', 'packed-refs', ...git('for-each-ref', '--format=%(refname:short)').split('\n')]);
    t.diagnostic('Settled device payload reads: ' + JSON.stringify(io.reads));
    assert.deepEqual(io.reads.filter(name => !refNames.has(name)), [projectFile], JSON.stringify(io.reads));
    assert.deepEqual(io.loads, ['string']);
    assert.equal(io.writes, 0);
    assert.deepEqual(await readFile(index), indexBefore);

    // A running stage defers the same safe update until Stop, without loading or saving the whole project.
    const openedStage = page.waitForEvent('popup', {timeout: 10000});
    await page.getByRole('button', {name: 'Open run view', exact: true}).click();
    const runView = await openedStage;
    await runView.getByTitle('Go', {exact: true}).click();
    await page.waitForFunction(() => window.ReduxStore.getState().scratchGui.vmStatus.running);
    project.targets[1].blocks.move_B.inputs.STEPS[1][1] = '72';
    const runningDisk = stringify(project);
    await writeFile(path.join(folder, projectFile), runningDisk);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    const notice = page.locator('[data-project-folder-external]');
    await expect(notice).toContainText('The changes load when the project stops.');
    await expect(notice.getByRole('button', {name: 'Reload from Disk'})).toBeDisabled();
    const catValue = () => page.evaluate(() => {
        const cat = window.vm.runtime.targets.find(target => target.sprite.name === 'Cat');
        const input = cat.blocks.getBlock('move_B').inputs.STEPS.block;
        return cat.blocks.getBlock(input).fields.NUM.value;
    });
    assert.equal(await catValue(), '71');
    await runView.getByTitle('Stop', {exact: true}).click();
    await expect(notice).toBeHidden();
    await runView.close();
    await expect.poll(catValue).toBe('72');
    await page.getByRole('tab', {name: 'Cat', exact: true}).click();
    await expect.poll(workspaceValue).toBe('72');
    assert.equal(await readFile(path.join(folder, projectFile), 'utf8'), runningDisk);
    assert.deepEqual(await page.evaluate(() => {
        const {loads, writes} = (window as any).folderIO;
        return {loads, writes};
    }), {loads: ['string'], writes: 0});
    assert.deepEqual(errors, []);
});

test('stages and unstages an ordinary file through the project explorer', {timeout: 45000}, async t => {
    const build = process.env.E2E_PROJECT_FOLDER_BUILD;
    assert.ok(build && path.isAbsolute(build), 'Set E2E_PROJECT_FOLDER_BUILD to the built Editor directory');
    await verifyWebEditor(build);
    const {folder} = await createDiskProject(t, 'tw-project-explorer-stage-', true);
    const git = (...args: string[]) => execFileSync('git', ['--no-optional-locks', ...args],
        {cwd: folder, encoding: 'utf8'}).trim();
    git('init', '-q', '-b', 'main');
    git('config', 'core.autocrlf', 'false');
    git('config', 'user.name', 'Editor explorer fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    git('add', '.');
    git('commit', '-qm', 'Initial project');
    const head = git('rev-parse', 'HEAD');
    const original = git('show', `HEAD:${noteFile}`);
    const source = path.join(folder, noteFile);
    const draft = note('a worktree edit');
    await writeFile(source, draft);
    await writeFile(path.join(folder, 'other.txt'), 'Previously staged\n');
    git('add', 'other.txt');

    const {editor: page, errors} = await openDeviceFolder(t, build, folder);
    await expect(page.locator('[data-project-folder-status]')).toHaveText('Project folder opened.');
    await page.getByRole('toolbar', {name: 'Drawer views'}).getByRole('button', {name: 'Project folder', exact: true}).click();
    await page.getByRole('tab', {name: 'Cat', exact: true}).click();
    await expect(page.locator('.twgit-panel:visible')).toHaveCount(0);
    const row = page.getByRole('tree', {name: 'Project folder'}).getByRole('treeitem', {name: new RegExp(`^${noteFile}`)});
    const context = page.getByRole('menu', {name: 'File and folder actions'});
    const stagedFiles = () => git('diff', '--cached', '--name-only').split('\n').sort();

    await row.focus();
    await page.keyboard.press('Shift+F10');
    await context.getByRole('menuitem', {name: 'Stage in Git', exact: true}).click();
    await expect.poll(stagedFiles).toEqual([noteFile, 'other.txt']);
    await expect(row).toHaveAttribute('data-staged', '');
    assert.equal(git('show', `:${noteFile}`), draft.trim());
    assert.equal(git('rev-parse', 'HEAD'), head);

    await row.click({button: 'right'});
    await context.getByRole('menuitem', {name: 'Unstage in Git', exact: true}).click();
    await expect.poll(stagedFiles).toEqual(['other.txt']);
    await expect(row).not.toHaveAttribute('data-staged');
    assert.equal(git('show', `:${noteFile}`), original);
    assert.equal(git('show', ':other.txt'), 'Previously staged');
    assert.equal(await readFile(source, 'utf8'), draft);
    assert.equal(git('rev-parse', 'HEAD'), head);

    // The package owns dialog variations; keep one real device-folder mutation at the Editor boundary.
    await row.click({button: 'right'});
    await context.getByRole('menuitem', {name: 'Rename…', exact: true}).click();
    const rename = page.getByRole('dialog', {name: 'Rename'});
    await rename.getByRole('textbox', {name: 'New name'}).fill('renamed-notes.js');
    await rename.getByRole('button', {name: 'Rename', exact: true}).click();
    await expect(page.getByRole('treeitem', {name: /^renamed-notes\.js/u})).toBeVisible();
    assert.equal(await readFile(path.join(folder, 'renamed-notes.js'), 'utf8'), draft);
    await assert.rejects(readFile(source), {code: 'ENOENT'});
    assert.deepEqual(stagedFiles(), ['other.txt']);
    assert.equal(git('rev-parse', 'HEAD'), head);
    assert.deepEqual(errors, []);
});

test('drops a device file into a project subfolder without overwriting an existing entry', {timeout: 45000}, async t => {
    const build = process.env.E2E_PROJECT_FOLDER_BUILD;
    assert.ok(build && path.isAbsolute(build), 'Set E2E_PROJECT_FOLDER_BUILD to the built Editor directory');
    await verifyWebEditor(build);
    const {folder} = await createDiskProject(t, 'tw-project-device-drop-');
    const incoming = await mkdtemp(path.join(path.dirname(folder), 'tw-project-incoming-'));
    t.after(() => rm(incoming, {recursive: true, force: true}));
    const child = 'imports';
    const name = '資料.bin';
    const bytes = Buffer.from([0, 1, 127, 255, 0]);
    const source = path.join(incoming, name);
    const destination = path.join(folder, child, name);
    await mkdir(path.join(folder, child));
    await writeFile(source, bytes);

    const {editor: page, errors} = await openDeviceFolder(t, build, folder);
    await expect(page.locator('[data-project-folder-status]')).toHaveText('Project folder opened.');
    await page.getByRole('toolbar', {name: 'Drawer views'}).getByRole('button', {name: 'Project folder', exact: true}).click();
    const tree = page.getByRole('tree', {name: 'Project folder'});
    const row = tree.getByRole('treeitem', {name: child, exact: true});
    const cdp = await page.context().newCDPSession(page);
    const drop = async () => {
        const box = await row.boundingBox();
        assert.ok(box);
        for (const type of ['dragEnter', 'dragOver', 'drop'] as const) {
            await cdp.send('Input.dispatchDragEvent', {type, x: box.x + box.width / 2, y: box.y + box.height / 2,
                data: {items: [], files: [source], dragOperationsMask: 1}});
        }
    };

    await drop();
    await expect(tree.getByRole('treeitem', {name, exact: true})).toBeVisible();
    assert.deepEqual(await readFile(destination), bytes);
    assert.deepEqual(await readFile(source), bytes);
    await assert.rejects(readFile(path.join(folder, name)), {code: 'ENOENT'});

    await writeFile(source, Buffer.from([8, 9]));
    await drop();
    await expect(page.locator('.twpf-explorer').getByRole('alert'))
        .toContainText('A file or folder with this name already exists.');
    assert.deepEqual(await readFile(destination), bytes);
    assert.deepEqual(await readFile(source), Buffer.from([8, 9]));
    assert.deepEqual(errors, []);
});

test('deletes a device folder recursively only after confirmation', {timeout: 45000}, async t => {
    const build = process.env.E2E_PROJECT_FOLDER_BUILD;
    assert.ok(build && path.isAbsolute(build), 'Set E2E_PROJECT_FOLDER_BUILD to the built Editor directory');
    await verifyWebEditor(build);
    const {folder} = await createDiskProject(t, 'tw-project-explorer-delete-');
    const removedDirectory = path.join(folder, 'references');
    const nestedFile = path.join(removedDirectory, 'examples', '資料.bin');
    const sideFile = path.join(folder, 'keep.bin');
    const original = Buffer.from([0, 127, 255]);
    const keep = Buffer.from([255, 0, 127]);
    await mkdir(path.dirname(nestedFile), {recursive: true});
    await writeFile(nestedFile, original);
    await writeFile(sideFile, keep);
    const projectSource = path.join(folder, projectFile);
    const before = await readFile(projectSource);

    const {editor: page, errors} = await openDeviceFolder(t, build, folder);
    await expect(page.locator('[data-project-folder-status]')).toHaveText('Project folder opened.');
    await page.getByRole('toolbar', {name: 'Drawer views'}).getByRole('button', {name: 'Project folder', exact: true}).click();
    const row = page.getByRole('tree', {name: 'Project folder'}).locator('[data-path="references"]');
    const openDelete = async () => {
        await row.click({button: 'right'});
        await page.getByRole('menu', {name: 'File and folder actions'}).getByRole('menuitem', {name: 'Delete…', exact: true}).click();
    };
    const dialog = page.getByRole('dialog', {name: 'Delete', exact: true});
    await openDelete();
    await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
    await expect(row).toBeVisible();
    assert.deepEqual(await readFile(nestedFile), original);

    await openDelete();
    await dialog.getByRole('button', {name: 'Delete', exact: true}).click();
    await expect(row).toHaveCount(0);
    await assert.rejects(stat(removedDirectory), {code: 'ENOENT'});
    assert.deepEqual(await readFile(sideFile), keep);
    assert.deepEqual(await readFile(projectSource), before);
    assert.deepEqual(errors, []);
});

test('splices a device-folder script in Blockly but refuses a disk edit with an unknown variable', {timeout: 45000}, async t => {
    const build = process.env.E2E_PROJECT_FOLDER_BUILD;
    assert.ok(build && path.isAbsolute(build), 'Set E2E_PROJECT_FOLDER_BUILD to the built Editor directory');
    await verifyWebEditor(build);
    const {folder, project} = await createDiskProject(t, 'tw-project-script-watch-', true);
    const git = (...args: string[]) => execFileSync('git', ['--no-optional-locks', ...args],
        {cwd: folder, encoding: 'utf8'}).trim();
    git('init', '-q', '-b', 'main');
    git('config', 'core.autocrlf', 'false');
    git('config', 'user.name', 'Editor watcher fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    git('add', '.');
    git('commit', '-qm', 'Initial project');
    const head = git('rev-parse', 'HEAD');
    await writeFile(path.join(folder, noteFile), note('staged independently'));
    git('add', noteFile);
    const index = path.join(folder, '.git', 'index');
    const originalIndex = await readFile(index);
    const source = path.join(folder, projectFile);

    const {editor: page, errors} = await openDeviceFolder(t, build, folder, '', true);
    await expect(page.locator('[data-project-folder-status]')).toHaveText('Project folder opened.');
    await expect(page.getByRole('button', {name: 'Branch: main', exact: true})).toBeVisible();
    await page.getByRole('tab', {name: 'Cat', exact: true}).click();
    await expect(page.locator('.twgit-panel:visible')).toHaveCount(0);
    const existsInWorkspace = (id: string) => page.evaluate(id =>
        Boolean(window.ScratchBlocks.getMainWorkspace()?.getBlockById(id)), id);
    await expect.poll(() => existsInWorkspace('move_B')).toBe(true);
    await page.evaluate(() => {
        const vm = window.vm;
        const cat = vm.editingTarget;
        const bird = vm.runtime.targets.find(target => target.sprite.name === 'Bird');
        (window as any).scriptWatch = {
            stage: vm.runtime.getTargetForStage(), cat, bird,
            move: cat.blocks.getBlock('move_B'), birdFlag: bird.blocks.getBlock('bird_flag')
        };
    });
    const notifyFile = async (text: string) => {
        await writeFile(source, text);
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    };

    const blocks = project.targets[1].blocks;
    blocks.move_B.next = 'turn_C';
    Object.assign(blocks, {
        turn_C: block('motion_turnright', null, 'move_B', {DEGREES: [1, [4, '15']]})
    });
    const compatible = stringify(project);
    await notifyFile(compatible);
    await expect.poll(() => existsInWorkspace('turn_C')).toBe(true);
    const notice = page.locator('[data-project-folder-external]');
    await expect(notice).toBeHidden();
    assert.deepEqual(await page.evaluate(() => {
        const old = (window as any).scriptWatch;
        const vm = window.vm;
        const cat = vm.editingTarget;
        const bird = vm.runtime.targets.find(target => target.sprite.name === 'Bird');
        const move = cat.blocks.getBlock('move_B');
        const turn = cat.blocks.getBlock('turn_C');
        return {stageSame: old.stage === vm.runtime.getTargetForStage(), catSame: old.cat === cat,
            birdSame: old.bird === bird && old.birdFlag === bird.blocks.getBlock('bird_flag'),
            scriptReplaced: old.move !== move, next: move.next, parent: turn.parent,
            degrees: cat.blocks.getBlock(turn.inputs.DEGREES.shadow).fields.NUM.value};
    }), {stageSame: true, catSame: true, birdSame: true, scriptReplaced: true, next: 'turn_C', parent: 'move_B', degrees: '15'});

    const unsafe = structuredClone(project);
    Object.assign(unsafe.targets[1].blocks, {
        set_D: {...block('data_setvariableto', null, null, {VALUE: [1, [10, '0']]}, {x: 400, y: 400}),
            fields: {VARIABLE: ['missing', 'missing-variable-id']}}
    });
    await notifyFile(stringify(unsafe));
    await expect(notice).toContainText('need the whole project to be reloaded');
    await expect(notice.getByRole('button', {name: 'Reload Whole Project'})).toBeEnabled();
    assert.equal(await existsInWorkspace('set_D'), false);
    assert.equal(await page.evaluate(() => Boolean(window.vm.editingTarget.blocks.getBlock('set_D'))), false);
    assert.equal(await existsInWorkspace('turn_C'), true);
    await notifyFile(compatible);
    await expect(notice).toBeHidden();

    assert.deepEqual(await page.evaluate(() => (window as any).folderIO.loads), ['string']);
    assert.equal(await page.evaluate(() => (window as any).ReduxStore.getState().scratchGui.projectChanged), false);
    assert.equal(await readFile(source, 'utf8'), compatible);
    assert.deepEqual(await readFile(index), originalIndex);
    assert.equal(git('rev-parse', 'HEAD'), head);
    assert.deepEqual(errors, []);
});

test('stages and unstages a project subfolder recursively without touching other paths', {timeout: 45000}, async t => {
    const build = process.env.E2E_PROJECT_FOLDER_BUILD;
    assert.ok(build && path.isAbsolute(build), 'Set E2E_PROJECT_FOLDER_BUILD to the built Editor directory');
    await verifyWebEditor(build);
    const {folder} = await createDiskProject(t, 'tw-project-recursive-stage-', true);
    const git = (...args: string[]) => execFileSync('git', ['--no-optional-locks', ...args],
        {cwd: folder, encoding: 'utf8'}).trim();
    git('init', '-q', '-b', 'main');
    git('config', 'core.autocrlf', 'false');
    git('config', 'user.name', 'Editor recursive stage fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    await mkdir(path.join(folder, 'imports', '教材'), {recursive: true});
    await mkdir(path.join(folder, 'imports-other'));
    await writeFile(path.join(folder, 'imports', 'reference.txt'), 'Original reference\n');
    await writeFile(path.join(folder, 'imports-other', 'outside.txt'), 'Original sibling\n');
    git('add', '.');
    git('commit', '-qm', 'Initial project');
    const head = git('rev-parse', 'HEAD');
    const nested = 'imports/教材/data.bin';
    const binary = Buffer.from([0, 1, 127, 255]);
    await writeFile(path.join(folder, 'imports', 'reference.txt'), 'Updated reference\n');
    await writeFile(path.join(folder, nested), binary);
    await writeFile(path.join(folder, 'imports-other', 'outside.txt'), 'Unstaged sibling\n');
    await writeFile(path.join(folder, noteFile), note('Previously staged'));
    git('add', noteFile);
    const otherOid = git('rev-parse', ':' + noteFile);

    const {editor: page, errors} = await openDeviceFolder(t, build, folder);
    await expect(page.locator('[data-project-folder-status]')).toHaveText('Project folder opened.');
    await page.getByRole('toolbar', {name: 'Drawer views'}).getByRole('button', {name: 'Project folder', exact: true}).click();
    await page.getByRole('tab', {name: 'Cat', exact: true}).click();
    await expect(page.locator('.twgit-panel:visible')).toHaveCount(0);
    const tree = page.getByRole('tree', {name: 'Project folder'});
    const row = tree.getByRole('treeitem', {name: /^imports(?:,|$)/});
    const menu = page.getByRole('menu', {name: 'File and folder actions'});
    const action = async (name: string) => {
        await row.click({button: 'right'});
        await menu.getByRole('menuitem', {name, exact: true}).click();
    };
    const staged = () => git('diff', '--cached', '--name-only', '-z').split('\0').filter(Boolean).sort();
    assert.deepEqual(staged(), [noteFile]);
    await action('Stage in Git');
    await expect.poll(staged).toEqual(['imports/reference.txt', nested, noteFile].sort());
    assert.equal(git('show', ':imports/reference.txt'), 'Updated reference');
    const indexBinary = execFileSync('git', ['--no-optional-locks', 'show', ':' + nested], {cwd: folder});
    assert.deepEqual(indexBinary, binary);

    // The index becomes visible on disk before Explorer finishes refreshing the row and accepts another action.
    await expect(row).toHaveAttribute('draggable', 'true');
    await action('Unstage in Git');
    await expect.poll(staged).toEqual([noteFile]);
    assert.equal(git('show', ':imports/reference.txt'), 'Original reference');
    assert.equal(git('rev-parse', ':' + noteFile), otherOid);
    assert.equal(git('rev-parse', 'HEAD'), head);
    assert.equal(await readFile(path.join(folder, 'imports', 'reference.txt'), 'utf8'), 'Updated reference\n');
    assert.equal(await readFile(path.join(folder, 'imports-other', 'outside.txt'), 'utf8'), 'Unstaged sibling\n');
    assert.deepEqual(await readFile(path.join(folder, nested)), binary);
    assert.deepEqual(errors, []);
});

test('saves a dirty device-file tab from Local Git without staging it', {timeout: 45000}, async t => {
    const build = process.env.E2E_PROJECT_FOLDER_BUILD;
    assert.ok(build && path.isAbsolute(build), 'Set E2E_PROJECT_FOLDER_BUILD to the built Editor directory');
    await verifyWebEditor(build);
    const {folder} = await createDiskProject(t, 'tw-local-git-text-save-');
    const draftName = 'draft.txt';
    const draft = path.join(folder, draftName);
    const stagedName = 'unrelated.txt';
    const index = path.join(folder, '.git', 'index');
    const git = (...args: string[]) => execFileSync('git', ['--no-optional-locks', ...args],
        {cwd: folder, encoding: 'utf8'}).trim();
    git('init', '-q', '-b', 'main');
    git('add', '.');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Initial project');
    await writeFile(draft, 'On disk\n');
    await writeFile(path.join(folder, stagedName), 'Unrelated staging\n');
    git('add', stagedName);
    const indexBefore = await readFile(index);
    const head = git('rev-parse', 'HEAD');
    const projectBefore = await readFile(path.join(folder, projectFile));

    const {editor: page, errors} = await openDeviceFolder(t, build, folder);
    await expect(page.locator('[data-project-folder-status]')).toHaveText('Project folder opened.');
    await page.getByRole('toolbar', {name: 'Drawer views'}).getByRole('button', {name: 'Project folder', exact: true}).click();
    await page.locator('[data-drawer-content="project"]').locator(`[data-path="${draftName}"]`).click();
    const editor = page.locator('.twpf-preview:visible').getByRole('textbox', {name: draftName, exact: true});
    await expect(editor).toContainText('On disk');
    await editor.focus();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.insertText('From the Git panel');

    await page.getByRole('button', {name: 'Branch: main', exact: true}).click();
    await page.getByRole('menu', {name: 'Branches'}).getByRole('menuitem', {name: 'Open Local Git'}).click();
    const panel = page.locator('.twgit-panel');
    const save = panel.getByRole('button', {name: 'Save files', exact: true});
    const savePane = panel.getByRole('region', {name: 'Save files', exact: true});
    const saved = panel.getByRole('button', {name: 'Commit saved changes', exact: true});
    await expect(save.locator('.twgit-count')).toHaveText('1');
    if (await save.getAttribute('aria-expanded') !== 'true') await save.click();
    await savePane.getByRole('button', {name: draftName, exact: true}).click();
    const draftDiff = savePane.locator('.twgit-save-diff');
    await expect(draftDiff).toContainText('HEAD → Unsaved edits');
    await expect(draftDiff.locator('.diff')).toContainText('From the Git panel');
    await expect(draftDiff.locator('.diff')).not.toContainText('On disk');
    assert.equal(await readFile(draft, 'utf8'), 'On disk\n');

    await savePane.getByRole('button', {name: 'Save unsaved files', exact: true}).click();
    await expect(save.locator('.twgit-count')).toHaveText('0');
    if (await saved.getAttribute('aria-expanded') !== 'true') await saved.click();
    await expect(panel.getByRole('checkbox', {name: 'Include in commit: ' + draftName, exact: true})).toBeEnabled();
    assert.equal(await readFile(draft, 'utf8'), 'From the Git panel');
    assert.deepEqual(await readFile(index), indexBefore);
    assert.deepEqual(await readFile(path.join(folder, projectFile)), projectBefore);
    assert.equal(git('rev-parse', 'HEAD'), head);
    assert.deepEqual(errors, []);
});

test('refreshes external staging but preserves an open project review until asked', {timeout: 45000}, async t => {
    const build = process.env.E2E_PROJECT_FOLDER_BUILD;
    assert.ok(build && path.isAbsolute(build), 'Set E2E_PROJECT_FOLDER_BUILD to the built Editor directory');
    await verifyWebEditor(build);
    const {folder, project} = await createDiskProject(t, 'tw-local-git-review-stale-');
    const source = path.join(folder, projectFile);
    const index = path.join(folder, '.git', 'index');
    const git = (...args: string[]) => execFileSync('git', ['--no-optional-locks', ...args],
        {cwd: folder, encoding: 'utf8'}).trim();
    git('init', '-q', '-b', 'main');
    git('add', '.');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Initial project');
    const head = git('rev-parse', 'HEAD');
    const editDiskProject = async (steps: string) => {
        project.targets[1].blocks.move_B.inputs.STEPS[1][1] = steps;
        await writeFile(source, stringify(project));
    };
    await editDiskProject('45');

    const {editor: page, errors} = await openDeviceFolder(t, build, folder);
    await expect(page.locator('[data-project-folder-status]')).toHaveText('Project folder opened.');
    await page.getByRole('button', {name: 'Branch: main', exact: true}).click();
    await page.getByRole('menu', {name: 'Branches'}).getByRole('menuitem', {name: 'Open Local Git'}).click();
    const panel = page.locator('.twgit-panel');
    const saved = panel.getByRole('button', {name: 'Commit saved changes', exact: true});
    if (await saved.getAttribute('aria-expanded') !== 'true') await saved.click();
    const pane = panel.getByRole('region', {name: 'Commit saved changes', exact: true});
    await pane.getByText('List by file', {exact: true}).click();
    const staged = pane.locator('[data-git-group="staged"]').filter({hasText: projectFile});
    await expect(staged).toHaveCount(0);
    git('add', projectFile);
    const stagedIndex = await readFile(index);
    await expect(staged).toBeVisible();
    await staged.click();
    const review = pane.getByRole('region', {name: 'Project changes', exact: true});
    await review.locator('.twgit-review-script summary').first().click();
    const rendered = review.locator('svg.blocklySvg').last();
    await expect(rendered).toContainText('45');

    await editDiskProject('50');
    await expect(panel.getByText('The repository changed outside the Editor. Refresh to read the current state.')).toBeVisible();
    await expect(rendered).toContainText('45');
    await expect(rendered).not.toContainText('50');
    assert.equal(await readFile(source, 'utf8'), stringify(project));
    assert.deepEqual(await readFile(index), stagedIndex);
    assert.equal(git('rev-parse', 'HEAD'), head);
    assert.deepEqual(errors, []);
});
