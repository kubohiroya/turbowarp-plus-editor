import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';
import {chromium, expect} from '@playwright/test';
import JSZip from '@turbowarp/jszip';
import type {PublicationIntent, PublicationJob} from '../packages/editor-ui/src/project-publication.ts';

const prefix = '/turbowarp-plus-editor/';
const bearer = 'w'.repeat(43);
const bff = 'https://github-create.example.invalid';
const proxy = 'https://github-git.example.invalid';
const cloudState = 's'.repeat(43);
const cloudTicket = cloudState + '.' + 't'.repeat(43);
const cloudBearer = cloudState + '.' + 'b'.repeat(43);
const mime = new Map([['.html', 'text/html'], ['.js', 'text/javascript'], ['.css', 'text/css'],
    ['.json', 'application/json'], ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.wasm', 'application/wasm']]);

for (const mode of ['desktop', 'desktop-stack', 'cloudflare', 'cloudflare-stack'] as const) test(
    `Editor queues a fixed commit and restores PR progress via ${mode}`, {timeout: 120000}, async t => {
    const cloud = mode.startsWith('cloudflare');
    const stacked = mode.endsWith('stack');
    const build = process.env.E2E_PROJECT_SAVE_BUILD;
    const fixtureFile = process.env.E2E_GIT_HTTP_FIXTURE;
    assert.ok(build && path.isAbsolute(build), 'Set E2E_PROJECT_SAVE_BUILD to the local webpack preview');
    assert.ok(fixtureFile && path.isAbsolute(fixtureFile), 'Set E2E_GIT_HTTP_FIXTURE to the Git Smart HTTP test fixture');
    const info = JSON.parse(await readFile(path.join(build, 'build-info.json'), 'utf8'));
    const pins = JSON.parse(await readFile(new URL('../site/source.json', import.meta.url), 'utf8'));
    assert.equal(info.projectSavePreview, true);
    assert.equal(info.revision, pins.guiRevision);
    const {startFixture, git, commit} = await import(pathToFileURL(fixtureFile).href);
    const fixture = await startFixture(t);
    const {client, bare, seed} = fixture;
    const baseOid = git(bare, 'rev-parse', 'main');
    let parentOid: string | undefined;
    if (stacked) {
        git(seed, 'switch', '-qc', 'parent');
        await writeFile(path.join(seed, 'project.txt'), 'The parent pull request\n');
        parentOid = commit(seed, 'Parent commit');
        git(seed, 'push', '-q', bare, 'parent');
        git(client, 'fetch', '-q', bare, 'refs/heads/parent:refs/remotes/origin/parent');
        git(client, 'switch', '-qc', 'child', parentOid);
    }
    const server = createServer(async (request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        if (!url.pathname.startsWith(prefix)) return response.writeHead(404).end();
        const filename = path.resolve(build, decodeURIComponent(url.pathname.slice(prefix.length)));
        if (!filename.startsWith(build + path.sep)) return response.writeHead(404).end();
        const bytes = await readFile(filename).catch(() => null);
        if (!bytes) return response.writeHead(404).end();
        response.writeHead(200, {'Content-Type': mime.get(path.extname(filename)) ?? 'application/octet-stream'}).end(bytes);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise<void>(resolve => {server.close(() => resolve()); server.closeAllConnections();}));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const origin = 'http://127.0.0.1:' + address.port;
    fixture.origins.add(origin);
    fixture.sessions.set(bearer, {mode: 'desktop', write: true});
    fixture.sessions.set(cloudBearer, {mode: 'desktop', write: true});
    await mkdir(path.join(client, 'project'));
    git(client, 'config', 'user.name', 'Fixture');
    git(client, 'config', 'user.email', 'fixture@example.invalid');

    const args = ['--enable-experimental-web-platform-features', '--enable-unsafe-swiftshader'];
    if (process.platform === 'darwin') args.push('--single-process', '--no-zygote', '--disable-crash-reporter');
    const browser = await chromium.launch({headless: true, args});
    t.after(() => browser.close());
    const page = await browser.newPage({viewport: {width: 1280, height: 920}});
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const transportErrors: string[] = [];
    page.on('requestfailed', request => {
        const url = new URL(request.url());
        if (url.origin === fixture.origin) transportErrors.push(request.method() + ' ' + url.pathname + ' ' + request.failure()?.errorText);
    });
    let cloudIntent: PublicationIntent | undefined;
    let cloudJob: PublicationJob | null = null;
    let approved = false;
    let verified = false;
    let cloudChecksPassed = false;
    let cloudParentMerged = false;
    const gitHead = (ref: string) => {
        assert.match(ref, /^tw-plus\/pr-[0-9a-f-]+$/u);
        try {return git(bare, 'rev-parse', '--verify', 'refs/heads/' + ref);} catch {return null;}
    };
    await page.context().route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if ([origin, fixture.origin].includes(url.origin)) return route.continue();
        if (!cloud) return route.abort();
        if (url.origin === proxy) {
            const headers = await request.allHeaders();
            delete headers.host;
            delete headers['content-length'];
            return route.fulfill({response: await route.fetch({url: fixture.origin + url.pathname + url.search,
                headers: {...headers, origin}, maxRedirects: 0})});
        }
        if (url.origin !== bff) return route.abort();
        const headers = {'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET,POST,DELETE',
            'Access-Control-Allow-Headers': 'Authorization,Content-Type'};
        const send = (json: object, status = 200) => route.fulfill({json, status, headers});
        const method = request.method();
        if (method === 'OPTIONS') return route.fulfill({status: 204, headers});
        if (url.pathname === '/v1/git-auth/start') {
            assert.equal(request.postDataJSON().write, true);
            return send({ticket: cloudTicket, authorizationUrl: 'https://github.com/login/oauth/authorize?state=' + cloudState});
        }
        if (url.pathname === '/v1/git-auth/session') {
            assert.equal((await request.allHeaders()).authorization, 'Bearer ' + cloudTicket);
            if (method === 'DELETE') return route.fulfill({status: 204, headers});
            return send({connection: {mode: 'cloudflare', proxyOrigin: proxy}, bearer: cloudBearer,
                account: {login: 'fixture'}, expiresAt: Date.now() + 60_000});
        }
        const prefix = '/v1/github-publication';
        if (url.pathname.startsWith(prefix + '/approval/')) {
            assert.equal(url.pathname, prefix + '/approval/' + 'a'.repeat(64) + '/' + cloudIntent?.id + '/' + 'b'.repeat(43));
            const form = (button: string) => route.fulfill({contentType: 'text/html',
                body: '<title>Confirm publication</title><form method="POST"><button>' + button + '</button></form>'});
            if (method === 'GET') return form(verified ? 'Approve publication' : 'Verify account');
            assert.equal(method, 'POST');
            if (!verified) {
                verified = true;
                return form('Approve publication');
            }
            assert.ok(cloudIntent);
            approved = true;
            cloudJob = {intent: cloudIntent, status: 'queued'};
            return route.fulfill({contentType: 'text/html', body: '<title>Approved</title><p>Approved</p>'});
        }
        assert.equal(method, 'POST');
        assert.equal((await request.allHeaders()).authorization, 'Bearer ' + cloudBearer);
        if (url.pathname === prefix + '/repository') return send({repositoryId: 7,
            capabilities: ['pulls-read', 'pulls-write', 'checks-read', 'merge', ...(stacked ? ['stacks'] : [])]});
        if (url.pathname === prefix + '/stack-parent') {
            const {number, repositoryId} = request.postDataJSON();
            assert.equal(number, 13);
            assert.equal(repositoryId, 7);
            return send({parent: {number, head: 'parent', headOid: parentOid, targetBase: 'main'}});
        }
        if (url.pathname === prefix + '/jobs') {
            cloudIntent = request.postDataJSON().intent;
            assert.ok(cloudIntent);
            return send({job: null, approvalUrl: bff + prefix + '/approval/' + 'a'.repeat(64) + '/' +
                cloudIntent.id + '/' + 'b'.repeat(43)});
        }
        if (url.pathname === prefix + '/jobs/status') return send({job: cloudJob,
            approval: approved ? 'approved' : cloudIntent ? 'pending' : 'missing', intent: cloudIntent});
        if (url.pathname === prefix + '/jobs/advance') {
            assert.ok(approved && cloudJob);
            if (gitHead(cloudJob.intent.head) !== cloudJob.intent.commitOid) return send({...cloudJob, awaitingPush: true});
            if (stacked && !cloudParentMerged) {
                cloudJob = {...cloudJob, status: 'waitingForParent', pullNumber: 42, stackNumber: 5};
                return send(cloudJob);
            }
            cloudJob = cloudChecksPassed ? {...cloudJob, status: 'done', pullNumber: 42, mergeOid: 'a'.repeat(40), pause: undefined} :
                {...cloudJob, status: 'waiting', pullNumber: 42, pause: 'checksFailed'};
            return send(cloudJob);
        }
        return send({}, 404);
    });
    await page.exposeFunction('publicationRemoteHead', (ref: string) => {
        return gitHead(ref);
    });
    await page.addInitScript(({proxyOrigin, bearer, cloud, stacked, parentOid, pushSessionId}) => {
        const view = window as unknown as {
            publicationDirectoryReady?: boolean;
            publicationRemoteHead(ref: string): Promise<string | null>;
            publicationChecksPassed?: boolean;
            publicationParentMerged?: boolean;
            publicationIntent?: PublicationIntent;
            EditorPreload?: object;
            showDirectoryPicker(options: {id: string}): Promise<FileSystemDirectoryHandle>;
        };
        const session = () => ({connection: {mode: 'desktop', proxyOrigin}, account: {login: 'fixture'},
            bearer, expiresAt: Date.now() + 60_000});
        let connected = false;
        let job: PublicationJob | null = null;
        if (!cloud) view.EditorPreload = {localGitAuth: {
            async restore() {connected = true; return true;},
            async authorizeRepository(_remote: string, write: boolean) {return connected && write ? session() : null;},
            async getSession() {return connected ? session() : null;},
            async disconnect() {connected = false;}
        }, localGitPublication: {
            async capabilities() {return ['pulls-read', 'pulls-write', 'checks-read', 'merge', ...(stacked ? ['stacks'] : [])];},
            async repository() {return {repositoryId: 7};},
            async stackParent(_remote: string, number: number) {
                return number === 13 && parentOid ? {number, head: 'parent', headOid: parentOid, targetBase: 'main'} : null;
            },
            async get() {return job;},
            async enqueue(intent: PublicationIntent) {
                view.publicationIntent = intent;
                job = {intent, status: 'queued'};
                return job;
            },
            async advance() {
                if (!job) throw new Error('PUBLICATION_NOT_FOUND');
                if (job.status === 'queued' && await view.publicationRemoteHead(job.intent.head) !== job.intent.commitOid)
                    return {...job, awaitingPush: true, pushAccount: 'fixture', pushSessionId};
                if (stacked && !view.publicationParentMerged) {
                    job = {...job, status: 'waitingForParent', pullNumber: 42, stackNumber: 5};
                    return job;
                }
                job = view.publicationChecksPassed ? {...job, status: 'done', pullNumber: 42,
                    mergeOid: 'a'.repeat(40), pause: undefined} : {...job, status: 'waiting', pullNumber: 42, pause: 'checksFailed'};
                return job;
            }
        }};
        let directory: FileSystemDirectoryHandle;
        for (const type of ['dragenter', 'dragover', 'drop']) window.addEventListener(type, async event => {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (type !== 'drop') return;
            const item = (event as DragEvent).dataTransfer!.items[0] as DataTransferItem & {
                getAsFileSystemHandle(): Promise<FileSystemDirectoryHandle>;
            };
            directory = await item.getAsFileSystemHandle();
            view.publicationDirectoryReady = true;
        }, {capture: true});
        view.showDirectoryPicker = async ({id}) => id === 'turbowarp-plus-git-root' ? directory :
            directory.getDirectoryHandle('project');
    }, {proxyOrigin: fixture.origin, bearer, cloud, stacked, parentOid, pushSessionId: createHash('sha256').update(bearer).digest('hex')});
    await page.goto(origin + prefix + 'editor.html?lang=en');
    await page.waitForFunction(() => Boolean(window.vm?.runtime.getTargetForStage()), null, {timeout: 45000});
    const cdp = await page.context().newCDPSession(page);
    for (const type of ['dragEnter', 'dragOver', 'drop'] as const) await cdp.send('Input.dispatchDragEvent', {
        type, x: 100, y: 100, data: {items: [], files: [client], dragOperationsMask: 1}
    });
    await page.waitForFunction(() => (window as unknown as {publicationDirectoryReady: boolean}).publicationDirectoryReady);
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
    await page.evaluate(bytes => window.vm.loadProject(Uint8Array.from(bytes).buffer),
        Array.from(await zip.generateAsync({type: 'uint8array'})));
    const command = async (name: string) => {
        await page.getByText('File', {exact: true}).click();
        await page.getByText(name, {exact: true}).click();
    };
    await command('Save As…');
    const save = page.getByRole('dialog', {name: 'Save As', exact: true});
    await save.getByLabel('Save format').selectOption('folder');
    await save.getByRole('button', {name: 'Choose Where to Save…'}).click();
    await expect(save).toBeHidden();

    await page.getByRole('button', {name: 'Local Git', exact: true}).click();
    await page.getByRole('menuitem', {name: 'Open Local Git'}).click();
    const panel = page.locator('.twgit-panel');
    await panel.getByRole('button', {name: 'Choose Repository…'}).click();
    await expect(panel.getByRole('button', {name: /^initial, /u})).toBeVisible();
    await panel.getByText('GitHub connection', {exact: true}).click();
    await panel.getByRole('combobox', {name: 'Connection mode'}).selectOption(cloud ? 'cloudflare' : 'desktop');
    await panel.getByLabel('Allow sending to GitHub (push)').check();
    if (cloud) {
        await panel.getByRole('button', {name: 'Connect to GitHub', exact: true}).click();
        await expect(panel.getByRole('link', {name: 'Open GitHub authorization'})).toBeVisible();
        await panel.getByRole('button', {name: 'Check connection'}).click();
    } else await panel.getByRole('button', {name: 'Restore saved Desktop connection'}).click();
    await expect(panel.locator('[data-git-connection-state]')).toHaveText('Connected');
    await panel.getByRole('button', {name: 'Close', exact: true}).click();
    await command('Save and Commit…');
    const local = page.getByRole('dialog', {name: 'Save and Commit', exact: true});
    await local.getByRole('button', {name: 'Save and review changes'}).click();
    await local.getByLabel('Commit message').fill('Record the project');
    await local.getByRole('button', {name: 'Commit', exact: true}).click();
    const publish = local.getByRole('button', {name: 'Create or view PR'});
    await expect(publish).toBeVisible();
    const approvedOid = git(client, 'rev-parse', 'HEAD');
    await writeFile(path.join(client, 'project.txt'), 'A later edit outside the publication\n');
    const laterOid = commit(client, 'Later local commit');
    await publish.click();
    const publication = page.getByRole('dialog').filter({has: page.getByRole('button', {name: 'Back to commits'})});
    await expect(publication.getByLabel('PR title')).toHaveValue('Record the project');
    try {
        await expect(publication.getByLabel('Base branch')).toHaveValue('main');
    } catch (error) {
        t.diagnostic(JSON.stringify({transportErrors, requests: fixture.requests.map(({method, url}) => [method, url])}));
        throw error;
    }
    await expect(publication.getByLabel('Merge after CI and review')).not.toBeChecked();
    await publication.getByLabel('Merge after CI and review').check();
    if (stacked) {
        const stack = publication.getByLabel('Stack on an existing pull request');
        await expect(stack).not.toBeChecked();
        await stack.check();
        await publication.getByLabel('Parent pull request number').fill('13');
        await publication.getByRole('button', {name: 'Verify parent pull request'}).click();
        await expect(publication.getByText('parent · ' + parentOid).last()).toBeVisible();
        await page.clock.install();
    }
    if (cloud) {
        const popupReady = page.context().waitForEvent('page');
        await publication.getByRole('button', {name: 'Review and approve in browser…'}).click();
        const popup = await popupReady;
        await popup.getByRole('button', {name: 'Verify account'}).click();
        const approval = popup.getByRole('button', {name: 'Approve publication'});
        await expect(approval).toBeVisible();
        assert.ok(cloudIntent);
        assert.equal(gitHead(cloudIntent.head), null);
        await approval.click();
    } else await publication.getByRole('button', {name: 'Queue pull request'}).click();
    if (stacked) {
        await expect(publication.getByRole('status').filter({hasText: 'Waiting for the parent pull request to merge'})).toBeVisible();
        await expect(publication.getByRole('link', {name: 'Parent PR #13'})).toHaveAttribute('href',
            'https://github.com/fixture/work/pull/13');
        if (cloud) cloudParentMerged = true;
        else await page.evaluate(() => {(window as unknown as {publicationParentMerged: boolean}).publicationParentMerged = true;});
        await page.clock.fastForward(30_000);
    }
    await expect(publication.getByRole('alert')).toHaveText('CI failed. Check the results on GitHub.');
    await expect(publication.getByRole('link', {name: 'PR #42'})).toHaveAttribute('href', 'https://github.com/fixture/work/pull/42');
    const intent = cloud ? cloudIntent :
        await page.evaluate(() => (window as unknown as {publicationIntent: PublicationIntent}).publicationIntent);
    assert.ok(intent);
    assert.equal(intent.commitOid, approvedOid);
    assert.equal(intent.baseOid, stacked ? parentOid : baseOid);
    if (stacked) assert.deepEqual(intent.stackParent, {number: 13, head: 'parent', headOid: parentOid, targetBase: 'main'});
    assert.equal(git(bare, 'rev-parse', 'refs/heads/' + intent.head), approvedOid);
    assert.equal(git(client, 'rev-parse', 'HEAD'), laterOid);

    await publication.getByRole('button', {name: 'Back to commits'}).click();
    await publish.click();
    await expect(publication.getByRole('alert')).toHaveText('CI failed. Check the results on GitHub.');
    if (cloud) cloudChecksPassed = true;
    else await page.evaluate(() => {(window as unknown as {publicationChecksPassed: boolean}).publicationChecksPassed = true;});
    await publication.getByRole('button', {name: 'Resume publication'}).click();
    await expect(publication.getByRole('status')).toHaveText('Merge complete');
    assert.deepEqual(errors, []);
});
