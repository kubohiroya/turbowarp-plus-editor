import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium, expect} from '@playwright/test';
import {verifyWebEditor} from '../scripts/site/editor-revision.ts';

const origin = 'http://localhost:41015';
const prefix = '/turbowarp-plus-editor/';
const api = 'https://api.github.com';
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav', '.wasm': 'application/wasm'};
const oldHead = 'a'.repeat(40), newHead = 'b'.repeat(40), mergeBase = 'c'.repeat(40);
const pr = {number: 42, title: 'Start together', body_text: 'Move after the start signal.', state: 'open', changed_files: 2,
    user: {login: 'tester'},
    base: {sha: oldHead, ref: 'main', repo: {full_name: 'owner/game'}},
    head: {sha: newHead, ref: 'start', repo: {full_name: 'owner/game'}}};
const project = (steps: string) => JSON.stringify({targets: [{name: 'Sprite', isStage: false, blocks: {
    flag: {opcode: 'event_whenflagclicked', next: 'custom', parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 10, y: 10},
    custom: {opcode: 'example_action', next: 'move', parent: 'flag', inputs: {}, fields: {OPTION: ['ready', null]},
        shadow: false, topLevel: false},
    move: {opcode: 'motion_movesteps', next: null, parent: 'custom', inputs: {STEPS: [1, [4, steps]]}, fields: {}, shadow: false, topLevel: false}
}}]}, null, 2);

test('the Editor Git panel opens a pull request overview and renders its changed script', {timeout: 120000}, async t => {
    const buildPath = process.env.E2E_PROJECT_FOLDER_BUILD;
    assert.ok(buildPath && path.isAbsolute(buildPath));
    const build = path.resolve(buildPath);
    await verifyWebEditor(build);
    const directory = await mkdtemp(path.join(process.platform === 'darwin' ? '/private/tmp' : tmpdir(), 'tw-pr-review-'));
    t.after(() => rm(directory, {recursive: true, force: true}));
    const git = (...args: string[]) => execFileSync('git', args, {cwd: directory, encoding: 'utf8'});
    await writeFile(path.join(directory, 'README.md'), 'Local repository\n');
    git('init', '-q');
    git('add', '.');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
    git('remote', 'add', 'origin', 'git@github.com:owner/game.git');
    const status = git('status', '--porcelain');
    const config = await readFile(path.join(directory, '.git/config'));

    const args = ['--enable-experimental-web-platform-features', '--enable-unsafe-swiftshader'];
    if (process.platform === 'darwin') args.push('--single-process', '--no-zygote', '--disable-crash-reporter');
    const browser = await chromium.launch({headless: true, args});
    t.after(() => browser.close());
    const page = await browser.newPage({viewport: {width: 1330, height: 940}});
    const requests: string[] = [], errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin === api) {
            requests.push(url.pathname + url.search);
            const headers = {'Access-Control-Allow-Origin': origin};
            const repo = '/repos/owner/game';
            if (url.pathname === repo + '/pulls') return route.fulfill({headers, json: [pr]});
            if (url.pathname === repo + '/pulls/42') return route.fulfill({headers, json: pr});
            if (url.pathname === repo + '/pulls/42/files') return route.fulfill({headers, json: [
                {filename: 'game/project.source.json', status: 'modified'},
                {filename: 'game/assets/start.svg', status: 'added'}
            ]});
            if (url.pathname === repo + '/compare/' + oldHead + '...' + newHead) {
                return route.fulfill({headers, json: {merge_base_commit: {sha: mergeBase}}});
            }
            if (url.pathname === repo + '/contents/game/project.source.json') {
                const ref = url.searchParams.get('ref');
                if (ref === mergeBase || ref === newHead) return route.fulfill({headers, body: project(ref === mergeBase ? '10' : '25')});
            }
            return route.fulfill({headers, status: 404});
        }
        if (url.origin !== origin || !url.pathname.startsWith(prefix)) return route.abort();
        const file = path.resolve(build, decodeURIComponent(url.pathname.slice(prefix.length)));
        if (!file.startsWith(build + path.sep)) return route.abort();
        const data = await readFile(file).catch(() => null);
        return data ? route.fulfill({body: data, contentType: mime[path.extname(file)] ?? 'application/octet-stream'}) :
            route.fulfill({status: 404});
    });
    await page.addInitScript(() => {
        let directory: FileSystemHandle;
        for (const type of ['dragenter', 'dragover', 'drop']) {
            window.addEventListener(type, async event => {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (type === 'drop') {
                    const item = (event as DragEvent).dataTransfer!.items[0] as DataTransferItem & {
                        getAsFileSystemHandle(): Promise<FileSystemHandle>;
                    };
                    directory = await item.getAsFileSystemHandle();
                }
            }, {capture: true});
        }
        Object.defineProperty(window, 'showDirectoryPicker', {value: async () => directory});
        Object.defineProperty(window, 'gitReviewDirectoryReady', {get: () => directory?.kind === 'directory'});
    });
    await page.goto(origin + prefix + 'editor.html?lang=en');
    await page.waitForFunction(() => Boolean(window.vm?.runtime.getTargetForStage()), null, {timeout: 45000});
    const cdp = await page.context().newCDPSession(page);
    for (const type of ['dragEnter', 'dragOver', 'drop'] as const) {
        await cdp.send('Input.dispatchDragEvent', {type, x: 100, y: 100, data: {items: [], files: [directory], dragOperationsMask: 1}});
    }
    await page.waitForFunction(() => Reflect.get(window, 'gitReviewDirectoryReady'));
    await page.getByText('File', {exact: true}).click();
    await page.getByText('Local Git…', {exact: true}).click();
    const panel = page.locator('.twgit-panel');
    await panel.getByRole('button', {name: 'Choose Repository…'}).click();
    await expect(panel.getByRole('button', {name: 'Pull requests', exact: true})).toBeVisible();
    assert.deepEqual(requests, []);
    await panel.getByRole('button', {name: 'Pull requests', exact: true}).click();
    await panel.getByRole('button', {name: '#42 Start together'}).click();
    const review = panel.getByRole('region', {name: 'Change review'});
    await expect(review.getByRole('heading', {name: 'Start together'})).toBeVisible();
    await expect(review.getByText('Move after the start signal.')).toBeVisible();
    await expect(review.getByText('game/assets/start.svg')).toBeVisible();
    const script = review.locator('details').filter({hasText: 'When green flag clicked'});
    await script.locator('summary').click();
    await expect(script.locator('svg.blocklySvg').first()).toContainText('10');
    await expect(script.locator('svg.blocklySvg').last()).toContainText('25');
    await expect(script.locator('svg.blocklySvg').last()).toContainText('Unregistered: example_action');
    await expect(script.locator('svg.blocklySvg').last()).toContainText('ready');
    // Both versions zoom together, with the Editor's minimap and zoom row, until they are unlinked.
    const frames = script.locator('.twgit-block-diff-preview');
    const scale = (index: number) => frames.nth(index).locator('.blocklyBlockCanvas').evaluate(canvas =>
        Number(/scale\(([\d.]+)\)/.exec(canvas.getAttribute('transform') ?? '')?.[1]));
    await expect(frames.nth(1).locator('[data-workspace-minimap]')).toHaveCount(1);
    const start = await scale(0);
    assert.equal(await scale(1), start);
    await frames.nth(1).locator('[data-plus-zoom-action="in"]').click();
    await expect.poll(() => scale(0)).toBeGreaterThan(start);
    assert.equal(await scale(0), await scale(1));
    await script.getByRole('checkbox', {name: 'Move both versions together'}).uncheck();
    const unlinked = await scale(0);
    await frames.nth(1).locator('[data-plus-zoom-action="in"]').click();
    await expect.poll(() => scale(1)).toBeGreaterThan(unlinked);
    assert.equal(await scale(0), unlinked);
    await panel.getByRole('button', {name: 'Local changes', exact: true}).click();
    await expect(panel.getByRole('button', {name: 'fixture', exact: true})).toBeVisible();
    await page.waitForFunction(() => {
        const blockly = Reflect.get(window, 'ScratchBlocks');
        return blockly && !Object.keys(blockly.Blocks).some(type => type.startsWith('twgit_review_placeholder_'));
    });
    assert.equal(git('status', '--porcelain'), status);
    assert.deepEqual(await readFile(path.join(directory, '.git/config')), config);
    assert.deepEqual(errors, []);
});
