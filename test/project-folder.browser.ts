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
        writeFile(path.join(folder, 'clip.webm'), videoFixture),
        writeFile(path.join(folder, noteFile), '\uFEFF' + note('committed').replaceAll('\n', '\r\n')),
        writeFile(path.join(folder, 'embedded-extensions.json'), stringify({formatVersion: 1, extensions: []})),
        writeFile(path.join(folder, 'sb3-source.json'), stringify({formatVersion: 1, project: projectFile,
            embeddedExtensions: 'embedded-extensions.json', assetsDirectory: 'assets',
            archiveEntries: ['project.json', costume.md5ext, sound.md5ext]}))
    ]);
    // Keep inspection commands such as status from refreshing the index behind the open Git panel.
    const git = (...args: string[]) => execFileSync('git', ['--no-optional-locks', ...args],
        {cwd: folder, encoding: 'utf8'}).trim();
    git('init', '-q');
    git('config', 'core.autocrlf', 'false');
    git('add', '.');
    git('-c', 'user.name=Editor folder fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
    await writeFile(path.join(folder, 'new.txt'), 'A new file\n');

    const args = ['--enable-experimental-web-platform-features', '--enable-unsafe-swiftshader'];
    if (process.platform === 'darwin') args.push('--single-process', '--no-zygote', '--disable-crash-reporter');
    const browser = await chromium.launch({headless: true, args});
    t.after(() => browser.close());
    const page = await browser.newPage({viewport: {width: 1280, height: 920}});
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.stack || error.message));
    const diagnostics: string[] = [];
    page.on('console', message => {if (message.type() === 'error') diagnostics.push(message.text());});
    await page.context().route('**/*', async route => {
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
                if (testState.handle) return;
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
            return options.id === 'turbowarp-plus-project-folder' && testState.projectHandle ?
                testState.projectHandle : testState.handle;
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
        await page.getByRole('button', {name, exact: true}).click();
        await page.waitForFunction(value => (window as any).folderTest.notifications > value, previous);
        await expect(status).toHaveText(message);
    };
    const open = () => command('Open Project Folder…', 'Project folder opened.');
    const save = (message = 'Project folder saved.') => command('Save Project', message);
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
    const drawerBar = page.getByRole('toolbar', {name: 'Drawer views', exact: true});
    await drawerBar.getByRole('button', {name: 'Project folder', exact: true}).click();
    const sourceRow = page.locator(`.twpf-explorer-item[data-path="${projectFile}"]`);
    await expect(sourceRow.locator('.twpf-explorer-description')).toHaveText('Project data');
    assert.ok(await sourceRow.evaluate(row =>
        row.querySelector('.twpf-explorer-description')!.getBoundingClientRect().top >=
        row.querySelector('.twpf-explorer-name')!.getBoundingClientRect().bottom));
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
    const leftCode = preview.locator('.cm-merge-a .cm-content');
    const rightCode = preview.locator('.cm-merge-b .cm-content');
    await expect(editor.locator('.twpf-syntax-keyword').first()).toHaveText('export');
    await previewButton('Diff').click();
    await expect(preview.getByText('No differences.', {exact: true})).toBeVisible();
    await previewButton('Edit').click();
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
    assert.equal(await noteStar.textContent(), ' *');
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
    const previous = await page.evaluate(() => (window as any).folderTest.notifications);
    await editor.press('ControlOrMeta+s');
    await page.waitForFunction(value => (window as any).folderTest.notifications > value, previous);
    await expect(status).toHaveText('No changes to save.');
    await drawerView('Project folder').click();
    await save('No changes to save.');
    await expect(editor).toContainText('working draft');
    assert.equal(await readFile(path.join(folder, noteFile), 'utf8'),
        '\uFEFF' + note('committed').replaceAll('\n', '\r\n'));
    await previewButton('Diff').click();
    await expect(preview.locator('.twpf-diff-headings')).toContainText(git('rev-parse', 'HEAD').slice(0, 8));
    await expect(leftCode.locator('.twpf-syntax-string', {hasText: 'committed'})).toBeVisible();
    await expect(rightCode.locator('.twpf-syntax-string', {hasText: 'working draft'})).toBeVisible();
    await expect(leftCode.getByText('// Header', {exact: true})).toHaveCount(0);
    await previewButton('Full file').click();
    await expect(leftCode.getByText('// Header', {exact: true})).toBeVisible();
    await expect(rightCode.getByText('// Footer', {exact: true})).toBeVisible();
    await previewButton('Changes only').click();
    await expect(leftCode.getByText('// Header', {exact: true})).toHaveCount(0);
    await previewButton('Edit').click();
    await expect(editor).toContainText('working draft');
    await drawerView('Project folder').focus();
    await page.keyboard.press('ControlOrMeta+s');
    await expect(preview.getByText('File saved.', {exact: true})).toBeVisible();
    await expect(noteStar).toHaveCount(0);
    assert.equal(await readFile(path.join(folder, noteFile), 'utf8'), '\uFEFF' + note('working draft').replaceAll('\n', '\r\n'));
    assert.equal(git('diff', '--cached', '--name-only'), '');
    await editNote('menu save');
    await fileMenu.click();
    await tabSave.click();
    await expect(preview.getByText('File saved.', {exact: true})).toBeVisible();
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
    await previewButton('Diff').click();
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
    await drawerBar.getByRole('button', {name: 'Sprites', exact: true}).click();
    assert.deepEqual(await page.evaluate(() => {
        const cat = window.vm.runtime.targets.find(entry => entry.sprite.name === 'Cat');
        return [cat.sprite.costumes[0].asset.assetId, cat.sprite.sounds[0].asset.assetId];
    }), [costume.assetId, sound.assetId]);
    await save('No changes to save.');
    assert.equal((await observe()).writes, 0);
    assert.equal(git('status', '--short'), '');

    await edit('value');
    const marker = page.getByRole('button', {name: 'Unsaved changes. Open the save menu'});
    const tabMarker = (name: string) => page.locator('.dv-tab').and(page.getByRole('tab', {name, exact: true}))
        .locator('[data-tw-plus-unsaved-tab]');
    await expect(tabMarker('Cat')).toBeVisible();
    await expect(tabMarker('Bird')).toBeHidden();
    await marker.click();
    await page.getByRole('button', {name: 'Save Project', exact: true}).click();
    await expect(status).toHaveText('Project folder saved.');
    await expect(marker).toHaveCount(0);
    await expect(tabMarker('Cat')).toBeHidden();
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
    git('add', projectFile);

    // Edits beyond blocks, including state a running project changes, save to the project file alone.
    const beforeOther = JSON.parse(await read());
    await page.evaluate(() => {
        const vm = window.vm;
        const cat = vm.runtime.targets.find(entry => entry.sprite.name === 'Cat');
        cat.setXY(30, -20);
        cat.setSize(150);
        const stage = vm.runtime.getTargetForStage();
        stage.createVariable('score_id', 'score', '');
        stage.variables.score_id.value = 7;
    });
    await save();
    assert.equal(git('diff', '--name-only'), projectFile);
    const other = JSON.parse(await read());
    assert.deepEqual({x: other.targets[1].x, y: other.targets[1].y, size: other.targets[1].size}, {x: 30, y: -20, size: 150});
    assert.deepEqual(other.targets[0].variables.score_id, ['score', 7]);
    for (const key of ['x', 'y', 'size']) beforeOther.targets[1][key] = other.targets[1][key];
    beforeOther.targets[0].variables = other.targets[0].variables;
    assert.deepEqual(other, beforeOther, 'nothing else in the project file changes');
    git('add', projectFile);
    // A renamed sprite keeps its folder entry, including fields the Editor does not know.
    await page.evaluate(() => {
        const vm = window.vm;
        vm.renameSprite(vm.runtime.targets.find(entry => entry.sprite.name === 'Cat').id, 'Kitten');
    });
    await save();
    assert.deepEqual(changes(), ['-"name": "Cat",', '+"name": "Kitten",']);
    assert.deepEqual(JSON.parse(await read()).targets[1].blocks.move_B.retainedData, {author: 'owner'});
    await page.evaluate(() => {
        const vm = window.vm;
        vm.renameSprite(vm.runtime.targets.find(entry => entry.sprite.name === 'Kitten').id, 'Cat');
    });
    await save();
    assert.equal(git('status', '--short'), 'M  project.source.json');

    // A new sprite with a new costume writes the asset and the manifest; deleting it removes them again.
    const manifestPath = path.join(folder, 'sb3-source.json');
    const manifestBefore = await readFile(manifestPath, 'utf8');
    const green = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#2a9d4b"/></svg>';
    const added = await page.evaluate(async svg => {
        const vm = window.vm;
        await vm.duplicateSprite(vm.runtime.targets.find(entry => entry.sprite.name === 'Cat').id);
        const copy = vm.runtime.targets.find(entry => entry.isOriginal && entry.sprite.name === 'Cat2');
        const storage = vm.runtime.storage;
        const asset = storage.createAsset(storage.AssetType.ImageVector, 'svg', new TextEncoder().encode(svg), null, true);
        const md5ext = `${asset.assetId}.svg`;
        await vm.addCostume(md5ext, {name: 'Green', asset, dataFormat: 'svg', assetId: asset.assetId, md5: md5ext,
            rotationCenterX: 16, rotationCenterY: 16, bitmapResolution: 1}, copy.id);
        return md5ext;
    }, green);
    await save();
    assert.equal(await readFile(path.join(folder, 'assets', added), 'utf8'), green);
    assert.ok(JSON.parse(await readFile(manifestPath, 'utf8')).archiveEntries.includes(added));
    const withCopy = JSON.parse(await read());
    assert.deepEqual(withCopy.targets.map(target => target.name), ['Stage', 'Cat', 'Bird', 'Cat2']);
    assert.ok(withCopy.targets[3].costumes.some(entry => entry.md5ext === added));
    // The saved folder opens again as it was saved.
    await open();
    assert.ok(await page.evaluate(name => window.vm.runtime.targets.some(entry => entry.sprite.name === name), 'Cat2'));
    // Sprite deletion confirmation is on by default and asks before deleting.
    page.once('dialog', dialog => dialog.accept());
    await page.evaluate(() => {
        const vm = window.vm;
        vm.deleteSprite(vm.runtime.targets.find(entry => entry.isOriginal && entry.sprite.name === 'Cat2').id);
    });
    await save();
    await expect.poll(() => readFile(path.join(folder, 'assets', added)).then(() => true, () => false)).toBe(false);
    assert.equal(await readFile(manifestPath, 'utf8'), manifestBefore);
    assert.deepEqual(JSON.parse(await read()).targets.map(target => target.name), ['Stage', 'Cat', 'Bird']);
    assert.deepEqual(git('status', '--short').split('\n').map(line => line.slice(3)), [projectFile], 'only the project file differs');
    assert.equal((await observe()).writes, 8);

    await edit('value', '35');
    const external = '\uFEFF' + await read();
    await writeFile(path.join(folder, projectFile), external);
    await save('The project folder changed outside the editor or is no longer open. Your edits are still in the editor.');
    assert.equal(await read(), external);
    assert.equal(await page.evaluate(() => JSON.parse(window.vm.toJSON(undefined, {allowOptimization: false}))
        .targets.find(entry => entry.name === 'Cat').blocks.move_B.inputs.STEPS[1][1]), '35');
    assert.deepEqual(await observe(), {
        writes: 8, loads: ['string', 'string', 'string'], options: {id: 'turbowarp-plus-project-folder', mode: 'readwrite'}, zipSaves: 0
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
    assert.equal((await observe()).writes, 9);
    await page.evaluate(() => {
        FileSystemWritableFileStream.prototype.write = (window as any).folderTest.originalWrite;
    });

    // The Git panel reuses one granted repository handle to open a nested project.
    const nested = path.join(folder, 'projects', 'demo');
    await mkdir(nested, {recursive: true});
    for (const name of [projectFile, 'sb3-source.json', 'embedded-extensions.json', 'assets', 'extensions']) {
        await cp(path.join(folder, name), path.join(nested, name), {recursive: true});
    }
    await mkdir(path.join(nested, 'imports'));
    const indexPath = path.join(folder, '.git', 'index');
    const indexBefore = await readFile(indexPath);
    const panel = page.locator('.twgit-panel');
    // The panel opens from the branch button left of the stage launcher, no longer from the File menu.
    const branchButton = page.locator('.twgit-branch-button');
    const branchMenu = page.getByRole('menu', {name: 'Branches'});
    const showGit = async () => {
        await branchButton.click();
        await branchMenu.getByRole('menuitem', {name: 'Open Local Git'}).click();
        await expect(panel).toBeVisible();
    };
    const gitTab = page.getByRole('tab', {name: 'Local Git', exact: true});
    const closeGit = async () => {
        const close = gitTab.getByRole('button', {name: 'Close Local Git', exact: true});
        const sprites = drawerBar.getByRole('button', {name: 'Sprites', exact: true});
        if (await gitTab.locator('[data-fixed-project-tab]').count()) await sprites.click();
        await gitTab.click();
        await close.click();
    };
    await drawerBar.getByRole('button', {name: 'Project folder', exact: true}).click();
    await expect(gitTab.locator('[data-fixed-project-tab]')).toBeVisible();
    await expect(gitTab.locator('.tw-plus-folder-tab-icon')).toBeVisible();
    await expect(gitTab.getByRole('button', {name: 'Close Local Git', exact: true})).toHaveCount(0);
    await expect(page.locator('.dv-tab').first()).toHaveAttribute('aria-label', 'Local Git');
    await gitTab.focus();
    await page.keyboard.press('Delete');
    await expect(gitTab).toBeVisible();
    await drawerBar.getByRole('button', {name: 'Sprites', exact: true}).click();
    await gitTab.click();
    await expect(gitTab.getByRole('button', {name: 'Close Local Git', exact: true})).toBeVisible();
    await drawerBar.getByRole('button', {name: 'Project folder', exact: true}).click();
    await expect(gitTab.locator('.tw-plus-folder-tab-icon')).toBeVisible();
    await page.getByText('File', {exact: true}).click();
    await expect(page.getByText('Open Project Folder…', {exact: true})).toBeVisible();
    await expect(page.getByText('Local Git…', {exact: true})).toHaveCount(0);
    await page.getByText('File', {exact: true}).click();
    // Before a repository is chosen the button reads "Git" and offers to choose one.
    const noRepository = page.getByRole('button', {name: 'Local Git', exact: true});
    await expect(noRepository).toHaveText('Git▾');
    assert.ok(await noRepository.evaluate(button => {
        const launcher = [...document.querySelectorAll('button')].find(item => item.textContent === 'Open stage');
        return !launcher || Boolean(button.compareDocumentPosition(launcher) & Node.DOCUMENT_POSITION_FOLLOWING);
    }), 'The branch button comes before the stage launcher.');
    await noRepository.click();
    assert.deepEqual(await branchMenu.getByRole('menuitem').allTextContents(), ['Choose Repository…', 'Open Local Git']);
    await page.keyboard.press('Escape');
    await expect(noRepository).toBeFocused();
    await showGit();
    await expect(panel.getByRole('button', {name: 'Close', exact: true})).toHaveCount(0);
    await expect(panel.getByRole('button', {name: 'Refresh local status', exact: true}).locator('svg')).toBeVisible();
    await expect(panel.getByRole('button', {name: 'Choose Repository…'})).toHaveCount(0);
    await fileMenu.click();
    await page.getByRole('button', {name: 'Choose Repository…', exact: true}).click();
    const reviewStep = panel.getByRole('button', {name: 'Commit saved changes', exact: true});
    const saveTask = panel.getByRole('button', {name: 'Save files', exact: true});
    const saveTaskPanel = panel.getByRole('region', {name: 'Save files', includeHidden: true});
    const commitTaskPanel = panel.getByRole('region', {name: 'Commit saved changes', includeHidden: true});
    const recordStep = panel.getByRole('button', {name: 'Create PR', exact: true});
    await expect(reviewStep).toHaveAttribute('aria-expanded', 'true');
    await recordStep.click();
    // A commit row of the history graph is named by its subject, then its author, date and branches.
    await expect(panel.getByRole('button', {name: /^fixture, /})).toBeVisible();
    await expect(page.getByRole('button', {name: `Branch: ${git('branch', '--show-current')}`, exact: true})).toBeVisible();
    await reviewStep.click();
    await closeGit();
    await drawerBar.getByRole('button', {name: 'Git history', exact: true}).click();
    const drawerCommit = page.locator('.twgit-history-view').getByRole('button', {name: /^fixture, /});
    const committedProject = panel.getByRole('region', {name: 'Changes by project element'})
        .getByRole('button', {name: 'Code: 1 change Added Committed'}).first();
    await drawerCommit.click();
    await expect(gitTab).toHaveAttribute('aria-selected', 'true');
    await expect(recordStep).toHaveAttribute('aria-expanded', 'true');
    await expect(panel.getByRole('button', {name: /^fixture, /})).toHaveAttribute('aria-pressed', 'true');
    await expect(committedProject).toBeInViewport();
    await reviewStep.click();
    await drawerCommit.press('Enter');
    await expect(recordStep).toHaveAttribute('aria-expanded', 'true');
    await expect(committedProject).toBeInViewport();
    await drawerBar.getByRole('button', {name: 'Project folder', exact: true}).click();
    await reviewStep.click();
    await expect(panel.getByRole('button', {name: 'Open Project', exact: true})).toHaveCount(0);
    await expect(panel.getByRole('button', {name: 'Show File List', exact: true})).toHaveCount(0);
    const openNestedProject = async () => {
        await page.evaluate(async () => {
            const testState = (window as any).folderTest;
            testState.projectHandle = await (await testState.handle.getDirectoryHandle('projects')).getDirectoryHandle('demo');
        });
        await open();
        await showGit();
    };
    page.once('dialog', dialog => dialog.accept());
    await openNestedProject();
    await expect(panel.getByRole('button', {name: 'Open Project', exact: true})).toHaveCount(0);
    await expect(panel.getByRole('heading', {name: 'Local Git', exact: true})).toHaveCount(0);
    await expect(panel.locator('header [data-git-project-path]')).toHaveCount(0);
    await expect(panel.locator('header strong')).toHaveText(path.basename(folder));
    await expect(panel.getByText('Branch and Git status', {exact: true})).toHaveCount(0);
    await expect(panel.getByText('No unsaved edits', {exact: true})).toHaveCount(0);
    await expect(panel.locator('[data-git-upstream]')).toHaveCount(0);
    const sideBar = page.getByRole('toolbar', {name: 'Drawer views'});
    await sideBar.getByRole('button', {name: 'Git history', exact: true}).click();
    await page.getByRole('button', {name: 'Search commits'}).click();
    const commitSearch = page.getByRole('searchbox', {name: 'Search commits'});
    await commitSearch.fill('no such commit');
    await expect(page.getByText('No matching commits.')).toBeVisible();
    await commitSearch.fill('FIXTURE');
    await expect(page.locator('[data-drawer-content="git-history"]').getByRole('button', {name: /^fixture, /})).toBeVisible();
    await commitSearch.press('Escape');
    await sideBar.getByRole('button', {name: 'Project folder', exact: true}).click();
    await expect(panel.getByRole('button', {name: 'Show File List', exact: true})).toHaveCount(0);
    const folderTools = page.getByRole('group', {name: 'Project folder tools'});
    const [folderPopup] = await Promise.all([page.waitForEvent('popup', {timeout: 7000}),
        folderTools.getByRole('button', {name: 'Open in another window'}).click()]);
    await expect(folderPopup.getByRole('tree', {name: 'Project folder'})).toBeVisible();
    await folderPopup.close();
    await expect(sideBar.getByRole('button', {name: 'Project folder', exact: true})).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-drawer-content="project"]').getByRole('tree', {name: 'Project folder'})).toBeVisible();

    await expect(panel.locator('header').getByRole('button', {name: 'Reload Project', exact: true})).toHaveCount(0);
    await expect(reviewStep.locator('.twgit-count')).toHaveText('5');
    // A selected project lists its changes by stage, sprite and element; the list by file stays one click away.
    const elements = panel.getByRole('region', {name: 'Changes by project element'});
    await expect(elements.locator('[data-git-element="costumes"]')).toHaveCount(3);
    await expect(elements).toContainText('Cat');
    await elements.getByText('List by file', {exact: true}).click();
    const commitFooter = commitTaskPanel.getByRole('form', {name: 'Commit selected files'});
    const changesList = commitTaskPanel.locator('.twgit-commit-changes');
    const footerPosition = await commitFooter.boundingBox();
    await changesList.evaluate(list => {list.scrollTop = list.scrollHeight;});
    await expect.poll(async () => (await commitFooter.boundingBox())?.y).toBe(footerPosition?.y);
    await expect(commitFooter).toBeInViewport();
    await panel.locator('[data-git-group="untracked"]').filter({hasText: 'projects/demo/project.source.json'}).click();
    // Project data opens as block comparisons; the line diff stays one switch away.
    const projectChanges = panel.getByRole('region', {name: 'Project changes'});
    await expect(projectChanges.locator('.twgit-review-script')).toHaveCount(3);
    await projectChanges.locator('.twgit-review-script summary').first().click();
    await expect(projectChanges.locator('.twgit-review-script svg.blocklySvg')).toHaveCount(1);
    await expect(projectChanges.locator('.twgit-review-target h5 img, .twgit-block-diff-preview img')).toHaveCount(0);
    // The panel is a tab beside the code, and the working-tree version can point at its script in the Editor.
    await expect(panel).toHaveClass(/twgit-panel-tab/);
    await projectChanges.getByRole('button', {name: 'After · Highlight in Editor'}).click();
    // The code now has the front of the tab group, so the panel's status is attached but hidden behind it.
    await expect(panel.locator('[role=status]', {hasText: 'Highlighted in the Editor.'})).toBeAttached();
    assert.ok(await page.evaluate(() => (window as any).ScratchBlocks.getMainWorkspace().getAllBlocks(false)
        .some(block => block.getSvgRoot()?.classList.contains('twgit-changed-block'))));
    await showGit();
    await panel.getByRole('button', {name: 'Text', exact: true}).click();
    await expect(panel.locator('.twgit-diff .diff')).toContainText('move_B');
    assert.deepEqual(await readFile(indexPath), indexBefore);
    // The left drawer shows the open project folder, with what each file is for and its Git status, and the history.
    await drawerBar.getByRole('button', {name: 'Project folder', exact: true}).click();
    await expect(page.locator(`[data-path="${projectFile}"]`)).toHaveAttribute('aria-label', `${projectFile}, Untracked, Project data`);

    // The drawer operates on the open project within the repository and accepts real local files from a Chromium drop.
    const incoming = await mkdtemp(path.join(path.dirname(folder), 'tw-folder-drop-'));
    t.after(() => rm(incoming, {recursive: true, force: true}));
    for (const [name, content] of [['root-note.txt', 'root'], ['reference.txt', 'reference'], ['資料.txt', 'binary\0data']]) {
        await writeFile(path.join(incoming, name), content);
    }
    const explorer = page.locator('.twpf-explorer');
    const explorerRow = (file: string) => explorer.locator(`[data-path="${file}"]`);
    const idle = () => expect(explorer.getByText('Working…', {exact: true})).toHaveCount(0);
    const dropFiles = async (target, names: string[]) => {
        const box = await target.boundingBox();
        assert.ok(box);
        for (const type of ['dragEnter', 'dragOver', 'drop'] as const) {
            await cdp.send('Input.dispatchDragEvent', {type, x: box.x + box.width / 2, y: box.y + box.height / 2,
                data: {items: [], files: names.map(name => path.join(incoming, name)), dragOperationsMask: 1}});
        }
    };
    const contextAction = async (file: string, action: string, keyboard = false) => {
        if (keyboard) {
            await explorerRow(file).focus();
            await page.keyboard.press('Shift+F10');
        } else {
            await explorerRow(file).click({button: 'right'});
        }
        await page.getByRole('menu', {name: 'File and folder actions'}).getByRole('menuitem', {name: action, exact: true}).click();
    };
    await dropFiles(explorerRow(projectFile), ['root-note.txt']);
    await expect(explorerRow('root-note.txt')).toBeVisible();
    await idle();
    await dropFiles(explorerRow('imports'), ['reference.txt', '資料.txt']);
    await expect(explorerRow('imports/reference.txt')).toBeVisible();
    await expect(explorerRow('imports/資料.txt')).toBeVisible();
    await idle();
    assert.equal(await readFile(path.join(nested, 'imports/資料.txt'), 'utf8'), 'binary\0data');
    assert.equal(await readFile(path.join(incoming, 'reference.txt'), 'utf8'), 'reference');
    await writeFile(path.join(incoming, 'reference.txt'), 'different');
    await dropFiles(explorerRow('imports'), ['reference.txt']);
    await expect(explorer.getByRole('alert')).toContainText('A file or folder with this name already exists.');
    assert.equal(await readFile(path.join(nested, 'imports/reference.txt'), 'utf8'), 'reference');
    assert.equal(await readFile(path.join(nested, 'root-note.txt'), 'utf8'), 'root');

    // Work in the folder drawer with another tab in front of the fixed Git tab.
    await page.getByRole('tab', {name: 'Cat', exact: true}).click();
    await expect(panel).not.toBeVisible();
    const stagedPaths = () => git('diff', '--cached', '--name-only', '-z').split('\0').filter(Boolean).sort();
    const previouslyStaged = stagedPaths();
    const rootNote = 'projects/demo/root-note.txt';
    await contextAction('imports', 'Stage in Git');
    await expect.poll(stagedPaths)
        .toEqual([...previouslyStaged, 'projects/demo/imports/reference.txt', 'projects/demo/imports/資料.txt'].sort());
    await idle();
    await contextAction('root-note.txt', 'Stage in Git', true);
    await expect.poll(stagedPaths).toContain(rootNote);
    await expect(explorerRow('root-note.txt')).toHaveAttribute('data-staged', '');
    await idle();
    await contextAction('imports', 'Unstage in Git');
    await expect.poll(stagedPaths).toEqual([...previouslyStaged, rootNote].sort());
    await idle();
    await contextAction('root-note.txt', 'Unstage in Git');
    await expect.poll(stagedPaths).toEqual(previouslyStaged);
    await expect(explorerRow('root-note.txt')).not.toHaveAttribute('data-staged');
    await idle();

    await contextAction('imports', 'Create New Folder');
    const create = page.getByRole('dialog', {name: 'Create New Folder'});
    await create.getByRole('textbox', {name: 'Folder name'}).fill('整理');
    await create.getByRole('button', {name: 'Create New Folder'}).click();
    await expect(explorerRow('imports/整理')).toBeVisible();
    await idle();
    await explorerRow('imports/reference.txt').dragTo(explorerRow('imports/整理'));
    await expect(explorerRow('imports/整理/reference.txt')).toBeVisible();
    await expect(explorerRow('imports/reference.txt')).toHaveCount(0);
    assert.equal(await readFile(path.join(nested, 'imports/整理/reference.txt'), 'utf8'), 'reference');
    await assert.rejects(readFile(path.join(nested, 'imports/reference.txt')), {code: 'ENOENT'});
    await idle();
    await explorerRow('imports/整理/reference.txt').dragTo(explorerRow('imports'));
    await expect(explorerRow('imports/reference.txt')).toBeVisible();
    await expect(explorerRow('imports/整理/reference.txt')).toHaveCount(0);
    await idle();

    const rename = async (file: string, name: string) => {
        await contextAction(file, 'Rename…');
        const dialog = page.getByRole('dialog', {name: 'Rename'});
        await dialog.getByRole('textbox', {name: 'New name'}).fill(name);
        await dialog.getByRole('button', {name: 'Rename', exact: true}).click();
        await idle();
        await expect(explorerRow(file)).toHaveCount(0);
    };
    await rename('root-note.txt', 'root-note-renamed.txt');
    assert.equal(await readFile(path.join(nested, 'root-note-renamed.txt'), 'utf8'), 'root');
    await rename('imports', 'references');
    await explorerRow('references').click();
    await expect(explorerRow('references/資料.txt')).toBeVisible();
    assert.equal(await readFile(path.join(nested, 'references/reference.txt'), 'utf8'), 'reference');
    await contextAction('references', 'Delete…');
    const remove = page.getByRole('dialog', {name: 'Delete'});
    await remove.getByRole('button', {name: 'Cancel'}).click();
    await expect(explorerRow('references')).toBeVisible();
    for (const file of ['references', 'root-note-renamed.txt']) {
        await contextAction(file, 'Delete…');
        await remove.getByRole('button', {name: 'Delete', exact: true}).click();
        await expect(explorerRow(file)).toHaveCount(0);
        await idle();
        await assert.rejects(readFile(path.join(nested, file)), {code: 'ENOENT'});
    }
    await showGit();
    await drawerBar.getByRole('button', {name: 'Git history', exact: true}).click();
    await expect(page.locator('.twgit-history-view .twgit-graph-commit').filter({hasText: 'fixture'})).toBeVisible();
    await drawerBar.getByRole('button', {name: 'Sprites', exact: true}).click();

    const nestedFile = path.join(nested, projectFile);
    const nestedSteps = async () => JSON.parse(await readFile(nestedFile, 'utf8')).targets[1].blocks.move_B.inputs.STEPS[1][1];
    await closeGit();
    await edit('value', '45');
    await save();
    assert.equal(await nestedSteps(), '45');
    assert.equal(await read(), concurrent);

    // The open panel follows an external Git command without Refresh.
    await showGit();
    const stagedDemo = panel.locator('[data-git-group="staged"]').filter({hasText: 'projects/demo/project.source.json'});
    await expect(stagedDemo).toHaveCount(0);
    git('add', 'projects/demo');
    const stagedIndex = await readFile(indexPath);
    await expect(stagedDemo).toBeVisible();
    assert.deepEqual(await readFile(indexPath), stagedIndex);
    // With a diff open, an external edit keeps the diff and asks for a refresh.
    await stagedDemo.click();
    await expect(projectChanges.locator('.twgit-review-script').first()).toBeVisible();
    const externalProject = JSON.parse(await readFile(nestedFile, 'utf8'));
    externalProject.targets[1].blocks.move_B.inputs.STEPS[1][1] = '50';
    await writeFile(nestedFile, stringify(externalProject));
    await expect(panel.getByText('The repository changed outside the Editor. Refresh to read the current state.')).toBeVisible();
    await expect(projectChanges.locator('.twgit-review-script').first()).toBeVisible();
    await closeGit();
    await openNestedProject();
    await closeGit();
    await edit('value', '60');
    await save();
    assert.equal(await nestedSteps(), '60');
    assert.deepEqual(await readFile(indexPath), stagedIndex);
    assert.equal(await page.evaluate(() => (window as any).folderTest.picks.filter(id => id === 'turbowarp-plus-git-root').length), 1);
    // Re-open the nested folder to establish a fresh baseline before observing file reads.
    await openNestedProject();
    await closeGit();
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
            state.lastRead = performance.now();
            return read.call(this);
        };
        state.lastRead = performance.now();
    });
    // The Git panel may still finish reading its review after closing; start the log once all reads have settled.
    await page.waitForFunction(() => performance.now() - (window as any).folderTest.lastRead > 1000, null, {polling: 100});
    await page.evaluate(() => {(window as any).folderTest.reads = [];});
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
    // The closed Git panel keeps the branch button current from HEAD and the branch refs; the project reads only its file.
    const gitRefs = new Set(['HEAD', 'packed-refs', ...git('for-each-ref', '--format=%(refname:lstrip=-1)').split('\n')]);
    assert.deepEqual((await page.evaluate(() => (window as any).folderTest.reads) as string[]).filter(name => !gitRefs.has(name)),
        [projectFile]);
    assert.deepEqual(await observe(), ioBefore);
    assert.equal(await page.evaluate(() => (window as any).ReduxStore.getState().scratchGui.projectChanged), false);
    assert.equal(await readFile(nestedFile, 'utf8'), disk);
    assert.deepEqual(await readFile(indexPath), stagedIndex);

    // Adding a block replaces only its script; the other sprite, the stage and the selection stay.
    const structural = JSON.parse(disk);
    structural.targets[1].blocks.move_B.next = 'turn_C';
    structural.targets[1].blocks.turn_C = {opcode: 'motion_turnright', next: null, parent: 'move_B',
        inputs: {DEGREES: [1, [4, '15']]}, fields: {}, shadow: false, topLevel: false};
    const structuralDisk = stringify(structural);
    await writeFile(nestedFile, structuralDisk);
    await notifyFocus();
    await expect.poll(() => page.evaluate(() =>
        Boolean(window.ScratchBlocks.getMainWorkspace().getBlockById('turn_C')))).toBe(true);
    await expect(notice).toBeHidden();
    assert.deepEqual(await page.evaluate(() => {
        const state = (window as any).folderTest;
        const vm = window.vm;
        const cat = vm.runtime.targets.find(entry => entry.sprite.name === 'Cat');
        const bird = vm.runtime.targets.find(entry => entry.sprite.name === 'Bird');
        const turn = cat.blocks.getBlock('turn_C');
        return {same: state.stage === vm.runtime.getTargetForStage() && state.bird === bird && state.cat === cat &&
            vm.editingTarget === cat, next: cat.blocks.getBlock('move_B').next, parent: turn.parent,
            degrees: cat.blocks.getBlock(turn.inputs.DEGREES.shadow).fields.NUM.value};
    }), {same: true, next: 'turn_C', parent: 'move_B', degrees: '15'});
    assert.equal(await page.evaluate(() => (window as any).ReduxStore.getState().scratchGui.projectChanged), false);
    assert.equal(await readFile(nestedFile, 'utf8'), structuralDisk);
    assert.deepEqual(await readFile(indexPath), stagedIndex);
    // The replaced script has new block objects; later checks compare against them.
    await page.evaluate(() => {
        const state = (window as any).folderTest;
        state.flag = state.cat.blocks.getBlock('flag_A');
        state.move = state.cat.blocks.getBlock('move_B');
    });

    // A block that needs a variable the project lacks waits for a whole reload and leaves the VM as it is.
    const unknown = JSON.parse(structuralDisk);
    unknown.targets[1].blocks.set_D = {opcode: 'data_setvariableto', next: null, parent: null,
        inputs: {VALUE: [1, [10, '0']]}, fields: {VARIABLE: ['missing', 'missing-variable-id']},
        shadow: false, topLevel: true, x: 400, y: 400};
    await writeFile(nestedFile, stringify(unknown));
    await notifyFocus();
    await expect(notice).toContainText('need the whole project to be reloaded');
    await expect(notice.getByRole('button', {name: 'Reload Whole Project'})).toBeEnabled();
    assert.equal(await page.evaluate(() => Boolean((window as any).folderTest.cat.blocks.getBlock('set_D'))), false);
    assert.deepEqual(await memory(), {value: '71', x: 180, y: 130, same: true});
    await writeFile(nestedFile, structuralDisk);
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
    // Unsaved edits are compared with the folder before the user chooses to replace them.
    const compare = notice.getByRole('button', {name: 'Compare and Choose…'});
    const comparison = page.getByRole('dialog', {name: 'External changes and your unsaved edits'});
    await compare.click();
    await expect(comparison.getByRole('region', {name: 'Your unsaved edits'})).toBeVisible();
    await expect(comparison.getByRole('region', {name: 'Changes in the folder'})).toBeVisible();
    await expect(comparison.getByRole('button', {name: 'Keep My Edits'})).toBeFocused();
    await comparison.getByRole('button', {name: 'Keep My Edits'}).click();
    await expect(comparison).toHaveCount(0);
    await expect(compare).toBeEnabled();
    assert.equal((await memory()).value, '73');
    assert.equal(await readFile(nestedFile, 'utf8'), dirtyDisk);
    assert.deepEqual(await observe(), ioBefore);
    await compare.click();
    await comparison.getByRole('button', {name: 'Discard Edits and Load from Folder'}).click();
    await expect(comparison).toHaveCount(0);
    await expect(notice).toBeHidden();
    await expect.poll(workspaceValue).toBe('74');
    assert.equal(await page.evaluate(() => (window as any).ReduxStore.getState().scratchGui.projectChanged), false);
    assert.equal(await readFile(nestedFile, 'utf8'), dirtyDisk);
    git('config', 'user.name', 'Editor folder fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    await showGit();
    await reviewStep.click();
    await panel.getByRole('button', {name: 'Refresh local status', exact: true}).click();
    await expect(reviewStep.locator('[data-review-pending]')).toBeVisible();
    const commitPath = 'projects/demo/project.source.json';
    const untouchedPath = 'new.txt';
    await writeFile(path.join(folder, untouchedPath), 'Unrelated change\n');
    git('add', untouchedPath);
    const otherIndex = git('show', ':' + untouchedPath);
    const indexBeforeSelection = await readFile(indexPath);
    await reviewStep.click();
    const commitForm = commitTaskPanel.getByRole('form');
    await expect(commitForm).toBeVisible();
    await saveTask.press('Enter');
    await expect(saveTask).toBeFocused();
    await expect(saveTaskPanel).toBeVisible();
    await expect(commitForm).toBeHidden();
    await reviewStep.press('Enter');
    await expect(reviewStep).toBeFocused();
    await expect(commitForm).toBeVisible();
    const listByFile = commitTaskPanel.locator('.twgit-file-list');
    if (await listByFile.isVisible() && !await listByFile.evaluate(node => (node as HTMLDetailsElement).open))
        await listByFile.locator('summary').click();
    const selectedFile = panel.getByRole('checkbox', {name: 'Include in commit: ' + commitPath, exact: true});
    await selectedFile.check();
    assert.deepEqual(await readFile(indexPath), indexBeforeSelection);
    await selectedFile.uncheck();
    await expect(panel.getByRole('button', {name: 'Commit', exact: true})).toBeDisabled();
    await selectedFile.check();
    await panel.getByLabel('Commit message').fill('Update the demo from the Editor');
    await panel.getByRole('button', {name: 'Commit', exact: true}).click();
    await expect(panel.getByText('Recorded the changes (commit).')).toBeVisible();
    assert.equal(git('log', '-1', '--format=%s|%an'), 'Update the demo from the Editor|Editor folder fixture');
    assert.equal(git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'), commitPath);
    assert.equal(git('show', 'HEAD:' + commitPath), dirtyDisk.trim());
    assert.equal(git('status', '--porcelain', '--', commitPath), '');
    assert.equal(git('show', ':' + untouchedPath), otherIndex);
    git('fsck', '--no-progress');
    await recordStep.click();
    // The commit already refreshes local status. Another refresh clears the selected record.
    const record = panel.locator(`button.twgit-graph-commit[data-oid="${git('rev-parse', 'HEAD')}"]`);
    await record.click();
    await expect(record).toHaveAttribute('aria-pressed', 'true');
    // The file list can move into the collapsed project-element view when its asynchronous read completes.
    await expect(panel.getByText('Reading the project changes…', {exact: true})).toHaveCount(0);
    const fileList = panel.locator('details.twgit-file-list');
    if (await fileList.isVisible() && !await fileList.evaluate(details => (details as HTMLDetailsElement).open)) {
        await fileList.locator('summary').click();
    }
    await expect(panel.locator('[data-git-group="commit"]').filter({hasText: commitPath})).toBeVisible();

    // Unsaved text edits in an open file tab can be saved from the same Git view.
    const draftPath = 'draft.txt';
    await writeFile(path.join(incoming, draftPath), 'On disk\n');
    await drawerBar.getByRole('button', {name: 'Project folder', exact: true}).click();
    await dropFiles(explorerRow(projectFile), [draftPath]);
    await idle();
    await openFile(draftPath);
    const draftEditor = preview.getByRole('textbox', {name: draftPath, exact: true});
    await draftEditor.focus();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.insertText('From the Git panel');
    await showGit();
    await reviewStep.click();
    await saveTask.click();
    const draftInRepo = 'projects/demo/' + draftPath;
    const draftCheckbox = panel.getByRole('checkbox', {name: 'Include in commit: ' + draftInRepo, exact: true});
    await expect(saveTask.locator('.twgit-count')).toHaveText('1');
    await saveTaskPanel.getByRole('button', {name: draftInRepo, exact: true}).click();
    const draftDiff = saveTaskPanel.locator('.twgit-save-diff');
    await expect(draftDiff).toContainText('HEAD → Unsaved edits');
    await expect(draftDiff.locator('.diff')).toContainText('From the Git panel');
    await expect(draftDiff.locator('.diff')).not.toContainText('On disk');
    assert.equal(await readFile(path.join(nested, draftPath), 'utf8'), 'On disk\n');
    await expect(draftCheckbox).toHaveCount(0);
    await saveTaskPanel.getByRole('button', {name: 'Save unsaved files', exact: true}).click();
    await expect(saveTask.locator('.twgit-count')).toHaveText('0');
    await expect(saveTask).toHaveAttribute('aria-expanded', 'true');
    await expect(reviewStep.locator('.twgit-count')).toHaveText(/^[1-9]/);
    await reviewStep.click();
    await expect(commitTaskPanel.getByRole('heading', {name: 'Other files'})).toBeVisible();
    await expect(draftCheckbox).toBeEnabled();
    assert.equal(await readFile(path.join(nested, draftPath), 'utf8'), 'From the Git panel');
    await fileTab(draftPath).click();
    await closeFile(draftPath);
    await contextAction(draftPath, 'Delete…');
    await remove.getByRole('button', {name: 'Delete', exact: true}).click();
    await expect(explorerRow(draftPath)).toHaveCount(0);
    await showGit();
    await panel.getByRole('button', {name: 'Refresh local status', exact: true}).click();

    // Branch switching still requires a clean work tree.
    await recordStep.click();
    const base = git('branch', '--show-current');
    await panel.getByLabel('New branch name').fill('variant');
    await panel.getByRole('button', {name: 'Create Branch'}).click();
    await expect(panel.getByText('Stop the project, and save or record (or undo) every change, before switching branches.')).toBeVisible();
    assert.equal(git('branch', '--list', 'variant'), '');
    // The project folder was recorded above; the panel lists only that folder, so record the rest with Git CLI.
    git('add', '-A');
    git('-c', 'user.name=Editor folder fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Record the rest');
    assert.equal(git('status', '--porcelain'), '');
    await panel.getByRole('button', {name: 'Refresh local status', exact: true}).click();
    await panel.getByLabel('Switch to it').uncheck();
    await panel.getByLabel('New branch name').fill('variant');
    const createBranch = panel.getByRole('button', {name: 'Create Branch'});
    await expect(createBranch).toBeEnabled();
    await createBranch.click();
    await expect.poll(() => git('branch', '--list', 'variant')).toContain('variant');
    assert.equal(git('rev-parse', 'variant'), git('rev-parse', 'HEAD'));
    assert.equal(git('branch', '--show-current'), base);
    // Another tool records a change on the branch without touching this work tree.
    const variantText = dirtyDisk.replace('"74"', '"88"');
    assert.notEqual(variantText, dirtyDisk);
    const plumbing = (args: string[], input?: string) => execFileSync('git', args, {cwd: folder, encoding: 'utf8', input,
        env: {...process.env, GIT_INDEX_FILE: path.join(folder, '.git', 'variant-index')}}).trim();
    plumbing(['read-tree', 'variant']);
    const blob = plumbing(['hash-object', '-w', '--stdin'], variantText);
    plumbing(['update-index', '--cacheinfo', `100644,${blob},projects/demo/project.source.json`]);
    const tree = plumbing(['write-tree']);
    const variantCommit = plumbing(['-c', 'user.name=Other tool', '-c', 'user.email=other@example.invalid',
        'commit-tree', tree, '-p', 'variant', '-m', 'Move further on the variant']);
    git('update-ref', 'refs/heads/variant', variantCommit);
    await rm(path.join(folder, '.git', 'variant-index'));
    // Opening the custom folder from the File menu associates it with the selected repository again.
    await openNestedProject();
    await expect(panel.getByRole('button', {name: 'Open Project', exact: true})).toHaveCount(0);
    await recordStep.click();
    await panel.getByRole('button', {name: 'Switch: variant'}).click();
    await expect(panel.getByText('Switched branches. Use Reload Project to open the files of this branch.')).toBeVisible();
    assert.equal(git('branch', '--show-current'), 'variant');
    assert.equal(git('status', '--porcelain'), '');
    assert.equal(await readFile(nestedFile, 'utf8'), variantText);
    // No unsaved edits, so the reload asks nothing.
    await panel.getByRole('button', {name: 'Reload Project'}).click();
    await expect.poll(async () => (await memory()).value).toBe('88');
    // The branch button follows the panel's switch, and switches back through the panel's same operation.
    await page.getByRole('button', {name: 'Branch: variant', exact: true}).click();
    assert.equal(await branchMenu.getByRole('menuitemradio', {name: 'variant', exact: true}).getAttribute('aria-checked'), 'true');
    await branchMenu.getByRole('menuitemradio', {name: base, exact: true}).click();
    await expect(page.getByRole('button', {name: `Branch: ${base}`, exact: true})).toBeVisible();
    await expect(panel.getByRole('button', {name: 'Switch: variant'})).toBeVisible();
    assert.equal(git('branch', '--show-current'), base);
    assert.equal(await readFile(nestedFile, 'utf8'), dirtyDisk);
    // The result shows in a snackbar, whose Reload Project opens the branch's files as the panel's does.
    const snackbar = page.locator('[data-git-snackbar]');
    await expect(snackbar.getByRole('status')).toHaveText('Switched branches.');
    await snackbar.getByRole('button', {name: 'Reload Project'}).click();
    await expect(snackbar).toHaveCount(0);
    await expect.poll(async () => (await memory()).value).toBe('74');
    // A branch without the open project folder is confirmed first; declining changes nothing.
    git('branch', 'before-projects', git('rev-list', '--max-parents=0', 'HEAD'));
    await panel.getByRole('button', {name: 'Refresh local status', exact: true}).click();
    const missingFolder = new Promise<string>(resolve => page.once('dialog', dialog => {
        resolve(dialog.message());
        void dialog.dismiss();
    }));
    await panel.getByRole('button', {name: 'Switch: before-projects'}).click();
    assert.equal(await missingFolder, 'The open project folder is not on this branch. Switch anyway?');
    await expect(panel.getByRole('button', {name: 'Switch: before-projects'})).toBeEnabled();
    assert.equal(git('branch', '--show-current'), base);
    assert.equal(git('status', '--porcelain'), '');
    // Unsaved edits in the Editor keep the branch where it is, also from the branch button, which tells why in a snackbar.
    await edit('value', '90');
    await closeGit();
    await page.getByRole('button', {name: `Branch: ${base}`, exact: true}).click();
    await branchMenu.getByRole('menuitemradio', {name: 'variant', exact: true}).click();
    const refusal = 'Stop the project, and save or record (or undo) every change, before switching branches.';
    await expect(snackbar.getByRole('alert')).toHaveText(refusal);
    await expect(panel).toHaveCount(0);
    // Escape on the snackbar closes it; the panel opens from its action on the next refusal and shows the same reason.
    await snackbar.getByRole('button', {name: 'Open Local Git'}).focus();
    await page.keyboard.press('Escape');
    await expect(snackbar).toHaveCount(0);
    await page.getByRole('button', {name: `Branch: ${base}`, exact: true}).click();
    await branchMenu.getByRole('menuitemradio', {name: 'variant', exact: true}).click();
    await snackbar.getByRole('button', {name: 'Open Local Git'}).click();
    await expect(panel.getByText(refusal)).toBeVisible();
    assert.equal(git('branch', '--show-current'), base);
    assert.equal(await readFile(nestedFile, 'utf8'), dirtyDisk);
    assert.equal((await memory()).value, '90');
    // With the panel closed, the button follows branches that another tool creates and switches to.
    await closeGit();
    git('branch', 'from-another-tool');
    await page.getByRole('button', {name: `Branch: ${base}`, exact: true}).click();
    await expect(branchMenu.getByRole('menuitemradio', {name: 'from-another-tool', exact: true})).toBeVisible();
    await page.keyboard.press('Escape');
    git('symbolic-ref', 'HEAD', 'refs/heads/from-another-tool');
    await expect(page.getByRole('button', {name: 'Branch: from-another-tool', exact: true})).toBeVisible();

    // The explorer follows file changes and the index even with the Git panel closed.
    await drawerBar.getByRole('button', {name: 'Project folder', exact: true}).click();
    const row = page.locator(`.twpf-explorer-item[data-path="${projectFile}"]`);
    const star = row.locator('.twpf-explorer-name + [data-tw-plus-unsaved-marker]');
    const gitMarker = row.locator('[data-git-change]');
    await expect(star).toHaveText('*');
    await expect(row).toHaveAccessibleName(/Unsaved changes/);
    await expect(star).toHaveCSS('font-weight', '700');
    await showGit();
    await reviewStep.click();
    await saveTask.click();
    await expect(saveTask.locator('.twgit-count')).toHaveText(/^[1-9]/);
    await saveTaskPanel.getByRole('button', {name: 'projects/demo/' + projectFile, exact: true}).click();
    const unsavedProjectDiff = saveTaskPanel.locator('.twgit-save-diff');
    await expect(unsavedProjectDiff).toContainText('HEAD → Unsaved edits');
    await unsavedProjectDiff.locator('.twgit-review-script summary').first().click();
    await expect(unsavedProjectDiff.locator('svg.blocklySvg').last()).toBeVisible();
    await saveTaskPanel.getByRole('button', {name: 'Save unsaved files', exact: true}).click();
    await expect(saveTask.locator('.twgit-count')).toHaveText('0');
    await expect(reviewStep.locator('.twgit-count')).toHaveText(/^[1-9]/);
    await page.getByRole('tab', {name: 'Cat', exact: true}).click();
    await edit('value', '92');
    await expect(star).toHaveText('*');
    assert.notEqual(await star.evaluate(node => getComputedStyle(node).color),
        await row.locator('.twpf-explorer-name').evaluate(node => getComputedStyle(node).color));
    await save();
    await expect(star).toHaveCount(0);
    await expect(gitMarker).toHaveCSS('font-weight', '700');
    await expect(row).toHaveAccessibleName(/Saved, not committed/);
    await expect(row).not.toHaveAccessibleName(/Unsaved changes/);
    const pathInRepo = 'projects/demo/' + projectFile;
    git('add', pathInRepo);
    await expect(row).toHaveAttribute('data-staged', '');
    await expect(gitMarker).toHaveCSS('font-weight', '700');
    await edit('value', '91');
    await expect(star).toHaveText('*');
    await expect(row).toHaveAttribute('data-staged', '');
    git('reset', '-q', 'HEAD', '--', pathInRepo);
    await expect(row).not.toHaveAttribute('data-staged');
    await expect(star).toHaveText('*');
    await save();
    await expect(star).toHaveCount(0);
    git('add', pathInRepo);
    git('-c', 'user.name=Editor folder fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'decoration');
    await expect(gitMarker).toHaveCount(0);
    await expect(row).toHaveAttribute('data-revision', 'committed');
    await expect(row).toHaveAccessibleName(/Committed/);

    const pushed = git('rev-parse', 'HEAD');
    const pushedBlob = git('rev-parse', 'HEAD:' + pathInRepo);
    const merge = 'a'.repeat(40), mergeTree = 'b'.repeat(40);
    let showMerge = () => {};
    const confirmed = new Promise<void>(resolve => {showMerge = resolve;});
    const github = 'https://api.github.com/repos/fixture-owner/project';
    await page.route(github + '/**', async route => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname.endsWith('/commits/' + pushed + '/pulls')) {
            await confirmed;
            await route.fulfill({json: [{number: 1, title: 'Update project', merged_at: '2026-11-13T00:00:00Z',
                merge_commit_sha: merge, base: {sha: pushed, ref: 'main', repo: {full_name: 'fixture-owner/project'}},
                head: {sha: pushed, ref: 'from-another-tool', repo: {full_name: 'fixture-owner/project'}}}]});
        } else if (pathname.endsWith('/git/commits/' + merge)) {
            await route.fulfill({json: {tree: {sha: mergeTree}}});
        } else if (pathname.endsWith('/git/trees/' + mergeTree)) {
            await route.fulfill({json: {truncated: false, tree: [{path: pathInRepo, sha: pushedBlob, type: 'blob', mode: '100644'}]}});
        } else if (pathname.endsWith('/pulls/1/files')) {
            await route.fulfill({json: [{filename: pathInRepo, status: 'modified', sha: pushedBlob}]});
        } else {
            await route.fulfill({status: 503, json: {}});
        }
    });
    git('remote', 'add', 'origin', 'https://github.com/fixture-owner/project.git');
    git('update-ref', 'refs/remotes/origin/from-another-tool', pushed);
    try {
        await expect(row).toHaveAttribute('data-revision', 'pushed');
        await expect(row).toHaveAccessibleName(/Pushed/);
    } finally {
        showMerge();
    }
    await expect(row).toHaveAttribute('data-revision', 'merged');
    await expect(row).toHaveAccessibleName(/Pull request merged/);
    await expect(explorerRow('sb3-source.json')).toHaveAttribute('data-revision', 'pushed');
    git('branch', 'unconfirmed', pushed);
    git('update-ref', 'refs/remotes/origin/unconfirmed', pushed);
    git('symbolic-ref', 'HEAD', 'refs/heads/unconfirmed');
    await expect(row).toHaveAttribute('data-revision', 'pushed');
    git('remote', 'remove', 'origin');
    await expect(row).toHaveAttribute('data-revision', 'committed');

    const removedFile = 'removed.txt';
    await writeFile(path.join(nested, removedFile), 'Temporary file');
    git('add', 'projects/demo/' + removedFile);
    git('commit', '-qm', 'Add a file for the deletion check');
    await rm(path.join(nested, removedFile));
    const removed = explorerRow(removedFile);
    const removedName = removed.locator('.twpf-explorer-name');
    await expect(removedName).toHaveCSS('text-decoration-line', 'line-through');
    await expect(removed).toHaveAttribute('aria-disabled', 'true');
    git('restore', '--', 'projects/demo/' + removedFile);
    await expect(removedName).toHaveCSS('text-decoration-line', 'none');
    await expect(removed).not.toHaveAttribute('aria-disabled');

    await page.goto(`${origin}${prefix}editor.html?lang=en&twPlusLocalGit=0`);
    await expect(page.locator('[data-project-folder-status]')).toHaveCount(1);
    await page.getByText('File', {exact: true}).click();
    await expect(page.getByRole('list').getByRole('button', {name: 'Open Project Folder…', exact: true})).toBeVisible();
    await expect(page.getByText('Local Git…', {exact: true})).toHaveCount(0);
    await expect(page.locator('.twgit-branch-button')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(drawerBar.getByRole('button', {name: 'Project folder', exact: true})).toBeAttached();
    await expect(drawerBar.getByRole('button', {name: 'Git history', exact: true})).toHaveCount(0);
    assert.deepEqual(errors, []);
});
