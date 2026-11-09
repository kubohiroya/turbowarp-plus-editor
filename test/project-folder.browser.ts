import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {cp, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium, expect} from '@playwright/test';
import {verifyWebEditor} from '../scripts/site/editor-revision.ts';
import pins from '../site/source.json' with {type: 'json'};

const stringify = value => JSON.stringify(value, null, 2) + '\n';
const block = (opcode, next, parent, inputs = {}, position = {}) =>
    ({opcode, next, parent, inputs, fields: {}, shadow: false, topLevel: 'x' in position, ...position});
const target = (name, isStage, blocks, costumes, sounds = []) =>
    ({isStage, name, variables: {}, lists: {}, broadcasts: {}, blocks, comments: {}, costumes, sounds, currentCostume: 0, volume: 100});
const projectFile = 'project.source.json';
const origin = 'http://localhost:41015';
const prefix = '/turbowarp-plus-editor/';
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav', '.wasm': 'application/wasm'};

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

test('the browser folder commands save localized Git diffs to the original working tree', {timeout: 120000}, async t => {
    const root = process.env.E2E_PROJECT_FOLDER_BUILD;
    assert.ok(root && path.isAbsolute(root), 'Set E2E_PROJECT_FOLDER_BUILD to the built Editor directory');
    await verifyWebEditor(root);
    const build = JSON.parse(await readFile(path.join(root, 'build-info.json'), 'utf8'));
    assert.equal(build.revision, pins.guiRevision);
    const folder = await mkdtemp(path.join(process.platform === 'darwin' ? '/private/tmp' : tmpdir(), 'tw-project-folder-'));
    t.after(() => rm(folder, {recursive: true, force: true}));
    const {project, costume, sound, svg, wav} = fixture();
    await mkdir(path.join(folder, 'assets'));
    await mkdir(path.join(folder, 'extensions'));
    await Promise.all([
        writeFile(path.join(folder, projectFile), stringify(project)),
        writeFile(path.join(folder, 'assets', costume.md5ext), svg),
        writeFile(path.join(folder, 'assets', sound.md5ext), wav),
        writeFile(path.join(folder, 'embedded-extensions.json'), stringify({formatVersion: 1, extensions: []})),
        writeFile(path.join(folder, 'sb3-source.json'), stringify({formatVersion: 1, project: projectFile,
            embeddedExtensions: 'embedded-extensions.json', assetsDirectory: 'assets',
            archiveEntries: ['project.json', costume.md5ext, sound.md5ext]}))
    ]);
    const git = (...args: string[]) => execFileSync('git', args, {cwd: folder, encoding: 'utf8'}).trim();
    git('init', '-q');
    git('add', '.');
    git('-c', 'user.name=Editor folder fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');

    const args = ['--enable-experimental-web-platform-features', '--enable-unsafe-swiftshader'];
    if (process.platform === 'darwin') args.push('--single-process', '--no-zygote', '--disable-crash-reporter');
    const browser = await chromium.launch({headless: true, args});
    t.after(() => browser.close());
    const page = await browser.newPage({viewport: {width: 1280, height: 920}});
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.stack || error.message));
    const diagnostics: string[] = [];
    page.on('console', message => {if (message.type() === 'error') diagnostics.push(message.text());});
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin || !url.pathname.startsWith(prefix)) return route.abort();
        const filename = path.resolve(root, decodeURIComponent(url.pathname.slice(prefix.length)));
        if (!filename.startsWith(root + path.sep)) return route.abort();
        const body = await readFile(filename).catch(() => null);
        if (body === null) return route.fulfill({status: 404});
        return route.fulfill({body, contentType: mime[path.extname(filename)] || 'application/octet-stream'});
    });
    await page.addInitScript(() => {
        const state = window as any;
        state.folderTest = {writes: 0, loads: [], zipSaves: 0, picks: []};
        const testState = state.folderTest;
        // CDP supplies the actual local directory handle. Only the picker interaction is substituted.
        for (const type of ['dragenter', 'dragover', 'drop']) {
            window.addEventListener(type, async event => {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (type === 'drop') {
                    const item = (event as DragEvent).dataTransfer.items[0] as DataTransferItem & {
                        getAsFileSystemHandle(): Promise<FileSystemHandle>;
                    };
                    testState.handle = await item.getAsFileSystemHandle();
                }
            }, {capture: true});
        }
        state.showDirectoryPicker = async options => {
            testState.options = options;
            testState.picks.push(options.id);
            return testState.handle;
        };
        const createWritable = FileSystemFileHandle.prototype.createWritable;
        FileSystemFileHandle.prototype.createWritable = function(...options) {
            if (this.name === 'project.source.json') testState.writes++;
            return createWritable.apply(this, options);
        };
    });
    await page.goto(`${origin}${prefix}editor.html?lang=en`);
    await page.waitForFunction(() => Boolean(window.vm?.runtime.getTargetForStage()), null, {timeout: 45000});
    await page.evaluate(() => {
        const testState = (window as any).folderTest;
        const load = window.vm.loadProject;
        window.vm.loadProject = function(input, ...args) {
            testState.loads.push(typeof input);
            return load.call(this, input, ...args);
        };
        window.vm._saveProjectZip = () => {
            testState.zipSaves++;
            throw new Error('Folder editing attempted to create a ZIP');
        };
    });
    page.on('download', () => errors.push('Unexpected download'));
    const cdp = await page.context().newCDPSession(page);
    for (const type of ['dragEnter', 'dragOver', 'drop'] as const) {
        await cdp.send('Input.dispatchDragEvent', {type, x: 100, y: 100,
            data: {items: [], files: [folder], dragOperationsMask: 1}});
    }
    await page.waitForFunction(() => (window as any).folderTest.handle?.kind === 'directory');
    assert.equal(await page.evaluate(() => (window as any).folderTest.handle.queryPermission({mode: 'readwrite'})), 'granted');

    const status = page.locator('[data-project-folder-status]');
    await expect(status).toHaveCount(1, {timeout: 5000}).catch(async error => {
        const globals = await page.evaluate(() => {
            const state = window as any;
            return {picker: typeof state.showDirectoryPicker, desktop: typeof state.EditorPreload,
                storage: Boolean(state.vm?.runtime.storage), store: state.ReduxStore?.getState().scratchGui?.vm === state.vm};
        });
        throw new Error(`Folder workspace attachment was absent: ${JSON.stringify({globals, errors, diagnostics})}`, {cause: error});
    });
    await status.evaluate(element => {
        const state = (window as any).folderTest;
        state.notifications = 0;
        new MutationObserver(() => {state.notifications++;}).observe(element, {childList: true});
    });
    const command = async (name: string, message: string) => {
        const previous = await page.evaluate(() => (window as any).folderTest.notifications);
        await page.getByText('File', {exact: true}).click();
        await page.getByText(name, {exact: true}).click();
        await page.waitForFunction(value => (window as any).folderTest.notifications > value, previous);
        await expect(status).toHaveText(message);
    };
    const open = () => command('Open Project Folder…', 'Project folder opened.');
    const save = (message = 'Project folder saved.') => command('Save', message);
    const read = () => readFile(path.join(folder, projectFile), 'utf8');
    const changes = () => git('diff', '--no-color', '--unified=0', '--', projectFile)
        .split('\n').filter(line => /^[+-](?![+-])/u.test(line)).map(line => line[0] + line.slice(1).trim());
    const observe = () => page.evaluate(() => {
        const {writes, loads, options, zipSaves} = (window as any).folderTest;
        return {writes, loads, options, zipSaves};
    });
    const edit = (kind: 'value' | 'position' | 'append', value = '20') => page.evaluate(({kind, value}) => {
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

    await open();
    assert.deepEqual(await page.evaluate(() => {
        const cat = window.vm.runtime.targets.find(entry => entry.sprite.name === 'Cat');
        return [cat.sprite.costumes[0].asset.assetId, cat.sprite.sounds[0].asset.assetId];
    }), [costume.assetId, sound.assetId]);
    await save('No changes to save.');
    assert.equal((await observe()).writes, 0);
    assert.equal(git('status', '--short'), '');

    await edit('value');
    await save();
    assert.deepEqual(changes(), ['-"10"', '+"20"']);
    git('add', projectFile);

    await edit('position');
    await save();
    assert.deepEqual(changes(), ['-"x": 120,', '-"y": 80', '+"x": 160,', '+"y": 110']);
    git('add', projectFile);

    await edit('append');
    await save();
    const additions = changes();
    for (const line of ['-"next": null,', '+"next": "say_C",', '+"say_C": {', '+"parent": "move_B",']) {
        assert.ok(additions.includes(line), line);
    }
    assert.equal(additions.filter(line => line.startsWith('-')).length, 1);
    assert.equal(git('diff', '--name-only'), projectFile);
    const saved = JSON.parse(await read());
    assert.deepEqual(Object.keys(saved.targets[1].blocks), ['flag_A', 'move_B', 'say_C']);
    assert.deepEqual(saved.targets[1].blocks.move_B.retainedData, {author: 'owner'});
    assert.deepEqual(saved.targets[2], project.targets[2]);
    assert.deepEqual(saved.retainedTopLevel, project.retainedTopLevel);
    assert.deepEqual(await readFile(path.join(folder, 'assets', costume.md5ext)), svg);
    assert.deepEqual(await readFile(path.join(folder, 'assets', sound.md5ext)), wav);

    await open();
    const reopened = await page.evaluate(() => JSON.parse(window.vm.toJSON(undefined, {allowOptimization: false}))
        .targets.find(entry => entry.name === 'Cat').blocks);
    assert.equal(reopened.move_B.inputs.STEPS[1][1], '20');
    assert.equal(reopened.flag_A.x, 160);
    assert.equal(reopened.say_C.parent, 'move_B');
    await save('No changes to save.');
    assert.equal((await observe()).writes, 3);

    await edit('value', '35');
    const external = '\uFEFF' + await read();
    await writeFile(path.join(folder, projectFile), external);
    await save('The project folder changed outside the editor or is no longer open. Your edits are still in the editor.');
    assert.equal(await read(), external);
    assert.equal(await page.evaluate(() => JSON.parse(window.vm.toJSON(undefined, {allowOptimization: false}))
        .targets.find(entry => entry.name === 'Cat').blocks.move_B.inputs.STEPS[1][1]), '35');
    assert.deepEqual(await observe(), {
        writes: 3, loads: ['string', 'string'], options: {id: 'turbowarp-plus-project-folder', mode: 'readwrite'}, zipSaves: 0
    });

    // Also change the actual file while the browser has a writable stream open.
    await writeFile(path.join(folder, projectFile), external.slice(1));
    const concurrent = external + '\n';
    await page.exposeFunction('changeFolderFileDuringWrite', () => writeFile(path.join(folder, projectFile), concurrent));
    await page.evaluate(() => {
        const write = FileSystemWritableFileStream.prototype.write;
        (window as any).folderTest.originalWrite = write;
        FileSystemWritableFileStream.prototype.write = async function(data) {
            await write.call(this, data);
            await (window as any).changeFolderFileDuringWrite();
        };
    });
    await save('The project folder changed outside the editor or is no longer open. Your edits are still in the editor.');
    assert.equal(await read(), concurrent);
    assert.equal((await observe()).writes, 4);
    await page.evaluate(() => {
        FileSystemWritableFileStream.prototype.write = (window as any).folderTest.originalWrite;
    });

    // The Git panel reuses one granted repository handle to open a nested project.
    const nested = path.join(folder, 'projects', 'demo');
    await mkdir(nested, {recursive: true});
    for (const name of [projectFile, 'sb3-source.json', 'embedded-extensions.json', 'assets', 'extensions']) {
        await cp(path.join(folder, name), path.join(nested, name), {recursive: true});
    }
    const indexPath = path.join(folder, '.git', 'index');
    const indexBefore = await readFile(indexPath);
    const panel = page.getByRole('dialog', {name: 'Local Git'});
    const showGit = async () => {
        await page.getByText('File', {exact: true}).click();
        await page.getByText('Local Git…', {exact: true}).click();
        await expect(panel).toBeVisible();
    };
    await showGit();
    await panel.getByRole('button', {name: 'Choose Repository…'}).click();
    await expect(panel.getByRole('button', {name: 'fixture', exact: true})).toBeVisible();
    await panel.getByText('Choose a project inside this repository', {exact: true}).click();
    await panel.getByRole('button', {name: 'projects/', exact: true}).click();
    await panel.getByRole('button', {name: 'demo/', exact: true}).click();
    page.once('dialog', dialog => dialog.accept());
    await panel.getByRole('button', {name: 'Open This Project'}).click();
    await expect(panel.getByText('Project folder · projects/demo', {exact: true})).toBeVisible();
    await panel.locator('[data-git-group="untracked"]').filter({hasText: 'projects/demo/project.source.json'}).click();
    // Project data opens as block comparisons; the line diff stays one switch away.
    const projectChanges = panel.getByRole('region', {name: 'Project changes'});
    await expect(projectChanges.locator('.twgit-review-script')).toHaveCount(3);
    await projectChanges.locator('.twgit-review-script summary').first().click();
    await expect(projectChanges.locator('.twgit-review-script svg.blocklySvg')).toHaveCount(1);
    await panel.getByRole('button', {name: 'Text', exact: true}).click();
    await expect(panel.locator('.twgit-diff .diff')).toContainText('move_B');
    assert.deepEqual(await readFile(indexPath), indexBefore);

    const nestedFile = path.join(nested, projectFile);
    const nestedSteps = async () => JSON.parse(await readFile(nestedFile, 'utf8')).targets[1].blocks.move_B.inputs.STEPS[1][1];
    await panel.getByRole('button', {name: 'Close', exact: true}).click();
    await edit('value', '45');
    await save();
    assert.equal(await nestedSteps(), '45');
    assert.equal(await read(), concurrent);

    git('add', 'projects/demo');
    const stagedIndex = await readFile(indexPath);
    await showGit();
    await panel.getByRole('button', {name: 'Refresh', exact: true}).click();
    await expect(panel.locator('[data-git-group="staged"]').filter({hasText: 'projects/demo/project.source.json'})).toBeVisible();
    assert.deepEqual(await readFile(indexPath), stagedIndex);
    const externalProject = JSON.parse(await readFile(nestedFile, 'utf8'));
    externalProject.targets[1].blocks.move_B.inputs.STEPS[1][1] = '50';
    await writeFile(nestedFile, stringify(externalProject));
    await panel.getByRole('button', {name: 'Close', exact: true}).click();
    await edit('value', '55');
    await showGit();
    await expect(panel.locator('[data-git-dirty]')).toHaveText('The Editor has unsaved changes.');
    page.once('dialog', dialog => dialog.dismiss());
    await panel.getByRole('button', {name: 'Reload Project'}).click();
    await expect(panel.getByRole('button', {name: 'Reload Project'})).toBeEnabled();
    await expect(panel.locator('[data-git-dirty]')).toHaveText('The Editor has unsaved changes.');
    page.once('dialog', dialog => dialog.accept());
    await panel.getByRole('button', {name: 'Reload Project'}).click();
    await expect(panel.locator('[data-git-dirty]')).toHaveText('The Editor has no unsaved changes.');
    await expect(panel.locator('[data-git-group="unstaged"]').filter({hasText: 'projects/demo/project.source.json'})).toBeVisible();
    await panel.getByRole('button', {name: 'Close', exact: true}).click();
    await edit('value', '60');
    await save();
    assert.equal(await nestedSteps(), '60');
    assert.deepEqual(await readFile(indexPath), stagedIndex);
    assert.equal(await page.evaluate(() => (window as any).folderTest.picks.filter(id => id === 'turbowarp-plus-git-root').length), 1);
    // Re-open the nested folder to establish a fresh baseline before observing file reads.
    await showGit();
    await panel.getByRole('button', {name: 'Reload Project'}).click();
    await expect(panel.getByRole('button', {name: 'Reload Project'})).toBeEnabled();
    await panel.getByRole('button', {name: 'Close', exact: true}).click();
    const notice = page.locator('[data-project-folder-external]');
    const reload = notice.getByRole('button', {name: 'Reload from Disk'});
    await expect(notice).toBeHidden();
    await page.evaluate(() => {
        const state = (window as any).folderTest;
        const vm = window.vm;
        const cat = vm.runtime.targets.find(entry => entry.sprite.name === 'Cat');
        vm.setEditingTarget(cat.id);
        state.stage = vm.runtime.getTargetForStage();
        state.cat = cat;
        state.bird = vm.runtime.targets.find(entry => entry.sprite.name === 'Bird');
        state.flag = cat.blocks.getBlock('flag_A');
        state.move = cat.blocks.getBlock('move_B');
        state.reads = [];
        const getFile = FileSystemFileHandle.prototype.getFile;
        const read = Blob.prototype.arrayBuffer;
        const names = new WeakMap<Blob, string>();
        FileSystemFileHandle.prototype.getFile = async function() {
            const file = await getFile.call(this);
            names.set(file, this.name);
            return file;
        };
        Blob.prototype.arrayBuffer = function() {
            const name = names.get(this);
            if (name) state.reads.push(name);
            return read.call(this);
        };
    });
    const memory = () => page.evaluate(() => {
        const state = (window as any).folderTest;
        const vm = window.vm;
        const cat = vm.runtime.targets.find(entry => entry.sprite.name === 'Cat');
        const bird = vm.runtime.targets.find(entry => entry.sprite.name === 'Bird');
        const {flag_A, move_B} = JSON.parse(vm.toJSON(undefined, {allowOptimization: false}))
            .targets.find(entry => entry.name === 'Cat').blocks;
        return {value: move_B.inputs.STEPS[1][1], x: flag_A.x, y: flag_A.y,
            same: state.stage === vm.runtime.getTargetForStage() && state.bird === bird && state.cat === cat &&
                state.flag === cat.blocks.getBlock('flag_A') && state.move === cat.blocks.getBlock('move_B') && vm.editingTarget === cat};
    });
    const notifyFocus = () => page.evaluate(() => window.dispatchEvent(new Event('focus')));
    const diskEdit = async (value: string, position?: {x: number; y: number}) => {
        const project = JSON.parse(await readFile(nestedFile, 'utf8'));
        project.targets[1].blocks.move_B.inputs.STEPS[1][1] = value;
        if (position) Object.assign(project.targets[1].blocks.flag_A, position);
        const text = stringify(project);
        await writeFile(nestedFile, text);
        await notifyFocus();
        return text;
    };
    const workspaceValue = () => page.evaluate(() =>
        window.ScratchBlocks.getMainWorkspace().getBlockById('move_B')?.getInputTargetBlock('STEPS')?.getFieldValue('NUM'));
    const ioBefore = await observe();
    // A clean, stopped Editor applies a settled value and position change without a click.
    const disk = await diskEdit('71', {x: 180, y: 130});
    await expect.poll(async () => (await memory()).value).toBe('71');
    await expect(notice).toBeHidden();
    assert.deepEqual(await memory(), {value: '71', x: 180, y: 130, same: true});
    await expect.poll(workspaceValue).toBe('71');
    const coordinates = await page.evaluate(() => {
        const {x, y} = window.ScratchBlocks.getMainWorkspace().getBlockById('flag_A').getRelativeToSurfaceXY();
        return {x, y};
    });
    assert.deepEqual(coordinates, {x: 180, y: 130});
    assert.deepEqual(await page.evaluate(() => (window as any).folderTest.reads), [projectFile]);
    assert.deepEqual(await observe(), ioBefore);
    assert.equal(await page.evaluate(() => (window as any).ReduxStore.getState().scratchGui.projectChanged), false);
    assert.equal(await readFile(nestedFile, 'utf8'), disk);
    assert.deepEqual(await readFile(indexPath), stagedIndex);

    const mixed = JSON.parse(disk);
    mixed.targets[1].blocks.move_B.inputs.STEPS[1][1] = '99';
    mixed.targets[1].blocks.move_B.next = null;
    await writeFile(nestedFile, stringify(mixed));
    await notifyFocus();
    await expect(notice).toContainText('need the whole project to be reloaded');
    await expect(notice.getByRole('button', {name: 'Reload Whole Project'})).toBeEnabled();
    assert.deepEqual(await memory(), {value: '71', x: 180, y: 130, same: true});
    await writeFile(nestedFile, disk);
    await notifyFocus();
    await expect(notice).toBeHidden();

    // Start the stage loop alone. The Cat fixture's speech bubble needs fonts served outside this test.
    await page.evaluate(() => window.vm.runtime.startHats('event_whenflagclicked', undefined,
        window.vm.runtime.getTargetForStage()));
    await page.waitForFunction(() => (window as any).ReduxStore.getState().scratchGui.vmStatus.running);
    const runningDisk = await diskEdit('72');
    await expect(notice).toContainText('The changes load when the project stops.');
    await expect(reload).toBeDisabled();
    assert.equal((await memory()).value, '71');
    await page.evaluate(() => window.vm.stopAll());
    await expect(notice).toBeHidden();
    assert.deepEqual(await memory(), {value: '72', x: 180, y: 130, same: true});
    assert.equal(await readFile(nestedFile, 'utf8'), runningDisk);

    await edit('value', '73');
    const dirtyDisk = await diskEdit('74');
    await expect(notice).toContainText('unsaved edits');
    const discard = notice.getByRole('button', {name: 'Discard Edits and Reload…'});
    await expect(discard).toBeEnabled();
    page.once('dialog', dialog => dialog.dismiss());
    await discard.click();
    await expect(discard).toBeEnabled();
    assert.equal((await memory()).value, '73');
    assert.equal(await readFile(nestedFile, 'utf8'), dirtyDisk);
    assert.deepEqual(await observe(), ioBefore);
    page.once('dialog', dialog => dialog.accept());
    await discard.click();
    await expect(notice).toBeHidden();
    await expect.poll(workspaceValue).toBe('74');
    assert.equal(await page.evaluate(() => (window as any).ReduxStore.getState().scratchGui.projectChanged), false);
    assert.equal(await readFile(nestedFile, 'utf8'), dirtyDisk);
    await page.goto(`${origin}${prefix}editor.html?lang=en&twPlusLocalGit=0`);
    await expect(page.locator('[data-project-folder-status]')).toHaveCount(1);
    await page.getByText('File', {exact: true}).click();
    await expect(page.getByText('Open Project Folder…', {exact: true})).toBeVisible();
    await expect(page.getByText('Local Git…', {exact: true})).toHaveCount(0);
    assert.deepEqual(errors, []);
});
