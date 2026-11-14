import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium, expect} from '@playwright/test';
import type {Page, Route} from '@playwright/test';
import {verifyWebEditor} from '../scripts/site/editor-revision.ts';

const origin = 'http://localhost:41015';
const prefix = '/turbowarp-plus-editor/';
const api = 'https://api.github.com';
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav', '.wasm': 'application/wasm'};
const oldHead = 'a'.repeat(40), newHead = 'b'.repeat(40), mergeBase = 'c'.repeat(40), laterHead = 'd'.repeat(40);
const pr = {number: 42, title: 'Start together', body_text: 'Move after the start signal.', state: 'open', changed_files: 2,
    user: {login: 'tester'},
    base: {sha: oldHead, ref: 'main', repo: {full_name: 'owner/game'}},
    head: {sha: newHead, ref: 'start', repo: {full_name: 'owner/game'}}};
const project = (steps: string, message = 'hi') => JSON.stringify({targets: [{name: 'Sprite', isStage: false, blocks: {
    flag: {opcode: 'event_whenflagclicked', next: 'custom', parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 10, y: 10},
    custom: {opcode: 'example_action', next: 'move', parent: 'flag', inputs: {}, fields: {OPTION: ['ready', null]},
        shadow: false, topLevel: false},
    move: {opcode: 'motion_movesteps', next: null, parent: 'custom', inputs: {STEPS: [1, [4, steps]]}, fields: {}, shadow: false, topLevel: false},
    click: {opcode: 'event_whenthisspriteclicked', next: 'say', parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 10, y: 300},
    say: {opcode: 'looks_say', next: null, parent: 'click', inputs: {MESSAGE: [1, [10, message]]}, fields: {}, shadow: false, topLevel: false}
}}]}, null, 2);
// The PR's head can move on; each head's version of the project.
const heads = new Map([[newHead, project('25', 'hello')], [laterHead, project('30', 'hello')]]);

function launchBrowser() {
    const args = ['--enable-experimental-web-platform-features', '--enable-unsafe-swiftshader'];
    if (process.platform === 'darwin') args.push('--single-process', '--no-zygote', '--disable-crash-reporter');
    return chromium.launch({headless: true, args});
}

async function readEditorFile(pathname: string, build: string) {
    if (!pathname.startsWith(prefix)) return null;
    const file = path.resolve(build, decodeURIComponent(pathname.slice(prefix.length)));
    if (!file.startsWith(build + path.sep)) return null;
    const body = await readFile(file).catch(() => null);
    return body && {body, contentType: mime[path.extname(file)] ?? 'application/octet-stream'};
}

async function serveEditor(route: Route, url: URL, build: string) {
    if (url.origin !== origin) return route.abort();
    return route.fulfill(await readEditorFile(url.pathname, build) ?? {status: 404});
}

async function prepareDirectoryPicker(page: Page) {
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
}

async function openRepository(page: Page, directory: string, editorOrigin = origin) {
    await page.goto(editorOrigin + prefix + 'editor.html?lang=en');
    await page.waitForFunction(() => Boolean(window.vm?.runtime.getTargetForStage()), null, {timeout: 45000});
    const cdp = await page.context().newCDPSession(page);
    try {
        for (const type of ['dragEnter', 'dragOver', 'drop'] as const) {
            await cdp.send('Input.dispatchDragEvent', {type, x: 100, y: 100, data: {items: [], files: [directory], dragOperationsMask: 1}});
        }
    } finally {
        await cdp.detach();
    }
    await page.waitForFunction(() => Reflect.get(window, 'gitReviewDirectoryReady'));
    await page.getByText('File', {exact: true}).click();
    await page.getByRole('button', {name: 'Choose Repository…', exact: true}).click();
    const panel = page.locator('.twgit-panel:not(.twgit-connection-dialog)');
    await expect(panel.locator('header strong')).toHaveText(path.basename(directory));
    return panel;
}

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

    const browser = await launchBrowser();
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
            if (url.pathname === repo + '/pulls') return route.fulfill({headers, json: [
                pr, {...pr, number: 43, title: 'Work in progress', draft: true},
                {...pr, number: 44, title: 'Already integrated', state: 'closed', merged_at: '2026-11-13T00:00:00Z'},
                {...pr, number: 45, title: 'Conflicting changes'}
            ]});
            if (url.pathname === repo + '/pulls/42') return route.fulfill({headers,
                json: {...pr, mergeable: true, mergeable_state: 'clean'}});
            if (url.pathname === repo + '/pulls/45') return route.fulfill({headers,
                json: {...pr, number: 45, mergeable: false, mergeable_state: 'dirty'}});
            if (url.pathname === repo + '/pulls/42/commits') return route.fulfill({headers, json: [
                {sha: pr.head.sha, commit: {message: 'Move after the start signal', author: {name: 'Fixture', date: '2026-11-13T00:00:00Z'}}}
            ]});
            if (url.pathname === repo + '/commits/' + pr.head.sha + '/check-runs') return route.fulfill({headers,
                json: {total_count: 1, check_runs: [{id: 1, name: 'Check project', status: 'completed', conclusion: 'success'}]}});
            if (url.pathname === repo + '/pulls/42/files') return route.fulfill({headers, json: [
                {filename: 'game/project.source.json', status: 'modified'},
                {filename: 'game/assets/start.svg', status: 'added'}
            ]});
            if (url.pathname === repo + '/compare/' + oldHead + '...' + pr.head.sha) {
                return route.fulfill({headers, json: {merge_base_commit: {sha: mergeBase}}});
            }
            if (url.pathname === repo + '/contents/game/project.source.json') {
                const ref = url.searchParams.get('ref');
                if (ref === mergeBase) return route.fulfill({headers, body: project('10')});
                if (ref && heads.has(ref)) return route.fulfill({headers, body: heads.get(ref)});
            }
            return route.fulfill({headers, status: 404});
        }
        return serveEditor(route, url, build);
    });
    await prepareDirectoryPicker(page);
    const panel = await openRepository(page, directory);
    assert.deepEqual(requests, []);
    await page.getByText('File', {exact: true}).click();
    const releaseCommand = page.getByRole('button', {name: 'Releases…', exact: true});
    await expect(releaseCommand).toHaveAttribute('tabindex', '0');
    await releaseCommand.press('Enter');
    const release = page.getByRole('dialog', {name: 'Release'});
    await expect(release.getByRole('heading', {name: 'Publish an npm package'})).toBeVisible();
    await expect(release).toContainText('npm publish --dry-run');
    await expect(release.getByRole('link', {name: 'Open GitHub Releases'}))
        .toHaveAttribute('href', 'https://github.com/owner/game/releases');
    await release.getByRole('textbox', {name: 'Tag name'}).fill('v1.0.0');
    await expect(release).toContainText('git push origin ' + git('rev-parse', 'HEAD').trim() + ':refs/tags/v1.0.0');
    await expect(release.getByRole('link', {name: 'Open Pages publishing settings'}))
        .toHaveAttribute('href', 'https://github.com/owner/game/settings/pages');
    await expect(release.getByRole('button', {name: 'Export HTML with Packager'})).toBeVisible();
    await release.getByRole('button', {name: 'Close', exact: true}).click();
    await panel.getByRole('button', {name: 'Merge', exact: true}).click();
    const picker = panel.getByRole('complementary', {name: 'Pull requests'});
    const selected = picker.getByRole('button', {name: /^#42 Start together/});
    await expect(picker.getByRole('spinbutton')).toHaveCount(0);
    await expect(picker.getByRole('button', {name: 'Open pull request', exact: true})).toHaveCount(0);
    await expect(selected).toHaveAttribute('data-status', 'mergeable');
    await expect(selected).toContainText('Ready to merge');
    await expect(picker.getByRole('button', {name: /#43.*Draft/})).toHaveAttribute('data-status', 'draft');
    await expect(picker.getByRole('button', {name: /#44.*Merged/})).toHaveAttribute('data-status', 'merged');
    await expect(picker.getByRole('button', {name: /#45.*Merge conflicts/})).toHaveAttribute('data-status', 'conflicting');
    await expect(picker.locator('svg[aria-hidden="true"]')).toHaveCount(4);
    const numberColor = (number: number) => picker.getByText('#' + number, {exact: true})
        .evaluate(element => getComputedStyle(element).color);
    assert.notEqual(await numberColor(42), await numberColor(45));
    await selected.focus();
    await selected.press('Enter');
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    const review = panel.getByRole('region', {name: 'Change review'});
    await expect(panel.getByRole('button', {name: 'Open PR project to run'})).toHaveCount(0);
    const title = panel.getByRole('heading', {name: '#42 Start together'});
    await expect(title.getByRole('link')).toHaveAttribute('href', 'https://github.com/owner/game/pull/42');
    await expect(panel.getByRole('combobox', {name: 'Comparison branch'})).toHaveCount(0);
    await expect(panel.getByRole('tabpanel', {name: 'Overview'})).toContainText('Move after the start signal.');
    await panel.getByRole('tab', {name: 'Overview', exact: true}).press('ArrowRight');
    await expect(panel.getByRole('tabpanel', {name: 'Commits'})).toContainText('Move after the start signal');
    await panel.getByRole('tab', {name: 'Commits', exact: true}).press('ArrowRight');
    await expect(panel.getByRole('tabpanel', {name: 'Checks'})).toContainText('Check project');
    await expect(panel.getByRole('tabpanel', {name: 'Checks'})).toContainText('Passed');
    await panel.getByRole('tab', {name: 'Files changed', exact: true}).click();
    await expect(review.getByText('game/assets/start.svg')).toBeVisible();
    await expect(review.locator('dt').getByText('Changed files', {exact: true})).toHaveCount(0);
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
    const zoomIn = frames.nth(1).locator('[data-plus-zoom-action="in"]');
    const start = await scale(0);
    assert.equal(await scale(1), start);
    await frames.nth(1).hover();
    await zoomIn.click();
    await expect.poll(() => scale(0)).toBeGreaterThan(start);
    assert.equal(await scale(0), await scale(1));
    await script.getByRole('checkbox', {name: 'Move both versions together'}).uncheck();
    const unlinked = await scale(0);
    await frames.nth(1).hover();
    await zoomIn.click();
    await expect.poll(() => scale(1)).toBeGreaterThan(unlinked);
    assert.equal(await scale(0), unlinked);
    // Resize the comparison so its bottom is below the browser viewport. Its controls still belong to the frame.
    const resized = frames.nth(1);
    await resized.evaluate(frame => {
        frame.style.height = '70vh';
        frame.scrollIntoView({block: 'start'});
        const pane = frame.closest('.twgit-diff')!;
        pane.scrollTop -= 200;
    });
    const navigation = () => resized.evaluate(frame => {
        const bounds = frame.getBoundingClientRect();
        const zoom = frame.querySelector('[data-plus-horizontal-zoom]')!.getBoundingClientRect();
        const map = frame.querySelector('[data-workspace-minimap]')!.getBoundingClientRect();
        return {
            belowViewport: bounds.bottom > document.documentElement.clientHeight + 80,
            zoomBelowViewport: zoom.bottom > document.documentElement.clientHeight,
            bottomInset: Math.round(bounds.bottom - zoom.bottom),
            rightInset: Math.round(bounds.right - zoom.right),
            mapGap: Math.round(zoom.top - map.bottom),
            mapAlignment: Math.round(Math.abs(map.right - zoom.right))
        };
    });
    await expect.poll(navigation).toMatchObject({
        belowViewport: true, zoomBelowViewport: true, mapGap: 8, mapAlignment: 0
    });
    const {bottomInset, rightInset} = await navigation();
    assert.ok(bottomInset >= 0 && bottomInset <= 32, `Zoom bottom inset: ${bottomInset}px`);
    assert.ok(rightInset >= 0 && rightInset <= 32, `Zoom right inset: ${rightInset}px`);
    await resized.evaluate(frame => {
        frame.style.height = '';
        frame.scrollIntoView({block: 'center'});
    });
    // Reviewed marks stay when the review opens again and after a reload, until the script itself changes.
    const clicked = review.locator('details').filter({hasText: 'When this sprite clicked'});
    await expect(review.getByText('0 / 2', {exact: true})).toBeVisible();
    const reviewed = script.locator('footer').getByRole('checkbox', {name: 'Reviewed'});
    await expect(reviewed).toHaveCSS('width', '20px');
    await reviewed.check();
    await clicked.locator('summary').click();
    await clicked.getByRole('checkbox', {name: 'Reviewed'}).check();
    await expect(review.getByText('2 / 2', {exact: true})).toBeVisible();
    await panel.getByRole('button', {name: 'Commit saved changes', exact: true}).click();
    await panel.getByRole('button', {name: 'Merge', exact: true}).click();
    await selected.click();
    await panel.getByRole('tab', {name: 'Files changed', exact: true}).click();
    await expect(review.getByText('2 / 2', {exact: true})).toBeVisible();
    await openRepository(page, directory);
    await panel.getByRole('button', {name: 'Merge', exact: true}).click();
    await selected.click();
    await panel.getByRole('tab', {name: 'Files changed', exact: true}).click();
    await expect(review.getByText('2 / 2', {exact: true})).toBeVisible();
    // The head moves on and changes only the green flag script: only its mark is dropped.
    pr.head.sha = laterHead;
    await openRepository(page, directory);
    await panel.getByRole('button', {name: 'Merge', exact: true}).click();
    await selected.click();
    await panel.getByRole('tab', {name: 'Files changed', exact: true}).click();
    await expect(review.getByText('1 / 2', {exact: true})).toBeVisible();
    await script.locator('summary').click();
    await expect(script.getByRole('checkbox', {name: 'Reviewed'})).not.toBeChecked();
    await clicked.locator('summary').click();
    await expect(clicked.getByRole('checkbox', {name: 'Reviewed'})).toBeChecked();
    await panel.getByRole('button', {name: 'Create PR', exact: true}).click();
    await expect(panel.getByRole('button', {name: /^fixture, /})).toBeVisible();
    await page.waitForFunction(() => {
        const blockly = Reflect.get(window, 'ScratchBlocks');
        return blockly && !Object.keys(blockly.Blocks).some(type => type.startsWith('twgit_review_placeholder_'));
    });
    assert.equal(git('status', '--porcelain'), status);
    assert.deepEqual(await readFile(path.join(directory, '.git/config')), config);
    assert.deepEqual(errors, []);
});

test('the Editor compares a connected PR and runs its project on a local branch', {timeout: 120000}, async t => {
    const build = process.env.E2E_PROJECT_FOLDER_BUILD;
    const fixtureFile = process.env.E2E_GIT_HTTP_FIXTURE;
    assert.ok(build && path.isAbsolute(build), 'Set E2E_PROJECT_FOLDER_BUILD to the built Editor directory');
    assert.ok(fixtureFile && path.isAbsolute(fixtureFile), 'Set E2E_GIT_HTTP_FIXTURE to the Git Smart HTTP test fixture module');
    await verifyWebEditor(build);
    const {startFixture, git} = await import(pathToFileURL(fixtureFile).href);
    const fixture = await startFixture(t);
    const {client, seed, bare} = fixture;
    const folder = path.join(seed, 'project');
    const source = 'project/project.source.json';
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32"/></svg>';
    const assetId = createHash('md5').update(svg).digest('hex');
    const costume = {name: 'Square', assetId, dataFormat: 'svg', md5ext: assetId + '.svg',
        rotationCenterX: 16, rotationCenterY: 16, bitmapResolution: 1};
    const playableProject = (steps: string) => {
        const sprite = JSON.parse(project(steps)).targets[0];
        sprite.blocks.flag.next = 'move';
        sprite.blocks.move.parent = 'flag';
        delete sprite.blocks.custom;
        const target = {variables: {}, lists: {}, broadcasts: {}, comments: {}, costumes: [costume],
            sounds: [], currentCostume: 0, volume: 100};
        return JSON.stringify({
            targets: [{...target, name: 'Stage', isStage: true, blocks: {}}, {...target, ...sprite, x: 0, y: 0, visible: true,
                size: 100, direction: 90, draggable: false, rotationStyle: 'all around'}],
            monitors: [], extensions: [], meta: {semver: '3.0.0'}
        }, null, 2) + '\n';
    };
    await mkdir(path.join(folder, 'assets'), {recursive: true});
    await mkdir(path.join(folder, 'extensions'));
    await Promise.all([
        writeFile(path.join(folder, 'assets', costume.md5ext), svg),
        writeFile(path.join(folder, 'embedded-extensions.json'), JSON.stringify({formatVersion: 1, extensions: []})),
        writeFile(path.join(folder, 'sb3-source.json'), JSON.stringify({formatVersion: 1, project: 'project.source.json',
            embeddedExtensions: 'embedded-extensions.json', assetsDirectory: 'assets', archiveEntries: ['project.json', costume.md5ext]})),
        writeFile(path.join(seed, source), playableProject('10'))
    ]);
    const record = (message: string) => {
        git(seed, 'add', 'project');
        git(seed, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', message);
        return git(seed, 'rev-parse', 'HEAD');
    };
    const base = record('Base project');
    git(seed, 'push', bare, 'main');
    git(client, 'pull', '--ff-only', bare, 'main');
    git(client, 'config', 'user.name', 'Fixture');
    git(client, 'config', 'user.email', 'fixture@example.invalid');
    // Git does not record an empty extensions directory, but the folder format requires it.
    await mkdir(path.join(client, 'project', 'extensions'));
    const config = await readFile(path.join(client, '.git/config'));
    await writeFile(path.join(seed, source), playableProject('25'));
    const head = record('PR project');
    git(seed, 'push', bare, 'HEAD:refs/pull/42/head');

    const server = createServer(async (request, response) => {
        try {
            const url = new URL(request.url ?? '/', 'http://127.0.0.1');
            const file = await readEditorFile(url.pathname, build);
            if (file) response.writeHead(200, {'Content-Type': file.contentType}).end(file.body);
            else response.writeHead(404).end();
        } catch {
            response.writeHead(404).end();
        }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
    }));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const editorOrigin = 'http://127.0.0.1:' + address.port;
    const bearer = 'r'.repeat(43);
    const pushSessionId = createHash('sha256').update(bearer).digest('hex');
    fixture.origins.add(editorOrigin);
    fixture.sessions.set(bearer, {mode: 'desktop', write: true});
    const browser = await launchBrowser();
    t.after(() => browser.close());
    const page = await browser.newPage({viewport: {width: 1330, height: 940}});
    const publicRequests: string[] = [], errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin === fixture.origin || url.origin === editorOrigin) return route.continue();
        if (url.origin === api) {
            assert.equal((await route.request().allHeaders()).authorization, undefined);
            publicRequests.push(url.pathname);
            return route.fulfill({status: 404, headers: {'Access-Control-Allow-Origin': editorOrigin}});
        }
        return route.abort();
    });
    await page.addInitScript(({proxyOrigin, bearer, head, base, pushSessionId}) => {
        const state = {checks: 'pending', merged: false, intent: null as Record<string, unknown> | null,
            expected: null as Record<string, unknown> | null};
        Reflect.set(window, 'publicationTest', state);
        const session = () => ({connection: {mode: 'desktop', proxyOrigin},
            account: {login: 'fixture'}, bearer, expiresAt: Date.now() + 60_000});
        Object.defineProperty(window, 'EditorPreload', {value: {externalYaml: {
            async open() {return null;},
            async save() {throw new Error('Unexpected YAML save');},
            async close() {}
        }, localGit: {
            async begin() {
                return {userCode: 'TEST-CODE', verificationUri: 'https://github.com/login/device', expiresAt: Date.now() + 60_000};
            },
            async finish() {},
            async authorizeRepository() {return session();},
            async getSession() {return session();},
            async disconnect() {}
        }, localGitPublication: {
            async repository() {return {repositoryId: 7, capabilities: ['pulls-read', 'pulls-write', 'checks-read', 'merge']};},
            async get() {return null;},
            async enqueue(intent) {state.intent = intent; return {intent, status: 'queued'};},
            async advance() {
                const count = Number(Reflect.get(state, 'advanceCount') ?? 0);
                Reflect.set(state, 'advanceCount', count + 1);
                return count === 0 ? {intent: state.intent, status: 'queued', awaitingPush: true,
                    pushAccount: 'fixture', pushSessionId} : {intent: state.intent, status: 'done', pullNumber: 76};
            },
            async mergeStatus() {
                return {number: 42, repositoryId: 7, headRepositoryId: 7, head: 'pull/42/head', base: 'main',
                    headOid: head, baseOid: base, state: state.merged ? 'merged' : 'open',
                    checks: state.checks, review: 'none', mergeable: 'ready', diffDigest: 'd'.repeat(64)};
            },
            async pullRequestChecks() {return {head, base, checks: state.checks};},
            async mergePullRequest(_remote, expected) {
                state.expected = expected;
                state.merged = true;
                return {state: 'merged'};
            }
        }}});
    }, {proxyOrigin: fixture.origin, bearer, head, base, pushSessionId});
    await prepareDirectoryPicker(page);
    page.on('dialog', dialog => dialog.accept());
    const panel = await openRepository(page, client, editorOrigin);
    const button = (name: string) => panel.getByRole('button', {name, exact: true});

    await button('Open Project').click();
    await expect(panel.getByRole('button', {name: 'Open Project', exact: true})).toHaveCount(0);
    const spriteX = () => page.evaluate(() => Reflect.get(window, 'vm').runtime.getSpriteTargetByName('Sprite')?.x);
    await expect.poll(spriteX).toBe(0);

    await panel.getByRole('button', {name: 'Merge', exact: true}).click();
    const picker = panel.getByRole('complementary', {name: 'Pull requests'});
    await expect(panel.locator('header').getByRole('button', {name: 'Choose Repository…', exact: true})).toHaveCount(0);
    await button('Connect to GitHub…').press('Enter');
    const settings = page.getByRole('dialog', {name: 'Repository GitHub connection'});
    await expect(settings).toBeVisible();
    await settings.getByRole('checkbox', {name: 'Allow sending to GitHub (push)'}).check();
    await settings.getByRole('button', {name: 'Connect to GitHub'}).click();
    await expect(settings.getByText('TEST-CODE')).toBeVisible();
    await settings.getByRole('button', {name: 'Check connection'}).click();
    await expect(settings.locator('[data-git-connection-state]')).toHaveText('Connected');
    await settings.getByRole('button', {name: 'Close', exact: true}).click();
    await expect(settings).toHaveCount(0);
    await expect(button('Update remote refs (fetch)')).toBeEnabled();
    await expect(panel.locator('.twgit-sync-branch')).toContainText('Current local branch: main');
    const row = picker.getByRole('button', {name: /^#42 Pull request/});
    await expect(row).toContainText('Status unavailable');
    await expect(row).toContainText('CI pending');
    await row.click();
    const review = panel.getByRole('region', {name: 'Change review'});
    await expect(panel.getByRole('heading', {name: '#42 Pull request'}).getByRole('link'))
        .toHaveAttribute('href', 'https://github.com/fixture/work/pull/42');
    await expect(panel.getByRole('combobox', {name: 'Comparison branch'})).toHaveCount(0);
    await expect(panel.locator('.twgit-pr-revision code')).toHaveText('main');
    const script = review.locator('details').filter({hasText: 'When green flag clicked'});
    await expect(panel.getByRole('button', {name: 'Reload PR information from GitHub'})).toBeVisible();
    await expect(panel.getByRole('button', {name: 'Squash and merge', exact: true})).toHaveCount(0);
    await page.evaluate(() => {Reflect.get(window, 'publicationTest').checks = 'passed';});
    await panel.getByRole('button', {name: 'Reload PR information from GitHub'}).click();
    await expect(row).toContainText('CI passed');

    await panel.getByRole('tab', {name: 'Commits', exact: true}).click();
    await expect(panel.getByRole('tabpanel', {name: 'Commits'})).toContainText('PR project');
    await panel.getByRole('tab', {name: 'Overview', exact: true}).click();
    await panel.getByRole('button', {name: 'Squash and merge', exact: true}).click();
    await expect(panel.locator('.twgit-merge-actions').getByText('Merged', {exact: true})).toBeVisible();
    assert.equal(await page.evaluate(() => Reflect.get(window, 'publicationTest').expected.headOid), head);
    await panel.getByRole('tab', {name: 'Files changed', exact: true}).click();
    await script.locator('summary').click();
    await expect(script.locator('svg.blocklySvg').first()).toContainText('10');
    await expect(script.locator('svg.blocklySvg').last()).toContainText('25');
    const reviewed = script.locator('footer').getByRole('checkbox', {name: 'Reviewed'});
    await reviewed.check();
    assert.ok(publicRequests.every(request => request === '/repos/fixture/work/pulls'));
    assert.equal(fixture.upstream.filter(request => request.path.endsWith('/git-upload-pack')).length, 2);
    assert.equal(git(client, 'rev-parse', 'refs/pull/origin/42/head'), head);
    assert.equal(git(client, 'rev-parse', 'HEAD'), base);
    await page.getByText('File', {exact: true}).click();
    const releaseCommand = page.getByRole('button', {name: 'Releases…', exact: true});
    await expect(releaseCommand).toHaveAttribute('tabindex', '0');
    await releaseCommand.click();
    const release = page.getByRole('dialog', {name: 'Release'});
    await release.getByRole('textbox', {name: 'Tag name'}).fill('v1.2.3');
    await release.getByRole('button', {name: 'Send tag to GitHub'}).click();
    await expect(release.getByText('The tag is available on GitHub.')).toBeVisible();
    assert.equal(git(bare, 'rev-parse', 'refs/tags/v1.2.3'), base);
    git(seed, 'push', bare, base + ':refs/heads/gh-pages');
    await release.getByRole('button', {name: 'Load publishing branches'}).click();
    await release.getByLabel('Publishing branch').selectOption('gh-pages');
    await release.getByLabel('Publishing folder').selectOption('/docs');
    const exportedHtml = '<!doctype html><title>Project</title>';
    await release.getByLabel('Exported HTML').setInputFiles({
        name: 'project.html', mimeType: 'text/html', buffer: Buffer.from(exportedHtml)
    });
    await release.getByRole('button', {name: 'Send HTML to GitHub'}).click();
    await expect(release.getByText('HTML sent. Check Pages settings on GitHub for the deployment status.')).toBeVisible();
    assert.equal(git(bare, 'show', 'gh-pages:docs/index.html'), exportedHtml);
    assert.equal(git(bare, 'rev-parse', 'gh-pages^'), base);
    assert.equal(git(bare, 'diff', '--name-only', base, 'gh-pages'), 'docs/index.html');
    assert.equal(git(client, 'rev-parse', 'HEAD'), base);
    await release.getByRole('button', {name: 'Close', exact: true}).click();

    const setEditorDirty = (changed: boolean) => page.evaluate(changed => Reflect.get(window, 'ReduxStore').dispatch({
        type: 'scratch-gui/project-changed/SET_PROJECT_CHANGED', changed
    }), changed);
    await setEditorDirty(true);
    await button('Open PR project to run').click();
    await expect(panel.getByRole('alert')).toContainText('before switching branches');
    assert.equal(git(client, 'rev-parse', 'HEAD'), base);
    assert.equal(git(client, 'branch', '--list', 'pr/42'), '');
    assert.equal(await readFile(path.join(client, source), 'utf8'), playableProject('10'));
    await setEditorDirty(false);

    await button('Open PR project to run').click();
    await expect(panel.getByText(/Opened pull request #42 on the local branch pr\/42.*switch to main/)).toBeVisible();
    assert.equal(git(client, 'branch', '--show-current'), 'pr/42');
    assert.equal(git(client, 'rev-parse', 'HEAD'), head);
    assert.equal(await readFile(path.join(client, source), 'utf8'), playableProject('25'));
    // Run the reopened project in the Editor VM while the Git dialog is in front.
    const greenFlag = () => page.evaluate(() => Reflect.get(window, 'vm').greenFlag());
    await greenFlag();
    await expect.poll(spriteX).toBe(25);

    await panel.getByRole('button', {name: 'Create PR', exact: true}).click();
    await button('Switch: main').click();
    await expect(button('Switch: pr/42')).toBeVisible();
    assert.equal(git(client, 'branch', '--show-current'), 'main');
    assert.equal(git(client, 'rev-parse', 'HEAD'), base);
    assert.equal(git(client, 'rev-parse', 'refs/pull/origin/42/head'), head);
    assert.equal(git(client, 'status', '--porcelain'), '');
    assert.deepEqual(await readFile(path.join(client, '.git/config')), config);

    await button('Reload Project').click();
    await expect.poll(spriteX).toBe(0);
    await greenFlag();
    await expect.poll(spriteX).toBe(10);
    const commitFile = async (file: string, message: string) => {
        await writeFile(path.join(client, file), message + '\n');
        git(client, 'add', file);
        git(client, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', message);
    };
    await commitFile('one.txt', 'First selected commit');
    await commitFile('skip.txt', 'Skipped commit');
    await commitFile('two.txt', 'Second selected commit');
    const localHead = git(client, 'rev-parse', 'HEAD');
    await button('Refresh local status').click();
    const create = panel.getByRole('region', {name: 'Commits to include'});
    await create.getByRole('checkbox', {name: 'Include First selected commit in the PR'}).check();
    await create.getByRole('checkbox', {name: 'Include Second selected commit in the PR'}).check();
    await create.getByLabel('PR title').fill('Selected local changes');
    await create.getByLabel('PR description').fill('Include the two selected changes.');
    await create.getByRole('button', {name: 'Prepare PR'}).click();
    await create.getByRole('button', {name: 'Create PR', exact: true}).click();
    await expect(create.getByRole('link', {name: 'Open PR #76 on GitHub'})).toBeVisible();
    const intent = await page.evaluate(() => Reflect.get(window, 'publicationTest').intent);
    assert.equal(intent.body, 'Include the two selected changes.');
    assert.equal(git(bare, 'rev-parse', 'refs/heads/' + intent.head), intent.commitOid);
    assert.equal(git(bare, 'diff', '--name-only', base, intent.commitOid), 'one.txt\ntwo.txt');
    assert.equal(git(client, 'rev-parse', 'HEAD'), localHead);
    assert.deepEqual(errors, []);
});
