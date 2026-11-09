import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFile, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium, expect} from '@playwright/test';
import {verifyWebEditor} from '../scripts/site/editor-revision.ts';

const prefix = '/turbowarp-plus-editor/';
const mime = new Map([['.html', 'text/html'], ['.js', 'text/javascript'], ['.css', 'text/css'],
    ['.json', 'application/json'], ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.wasm', 'application/wasm']]);
const writeBearer = 'w'.repeat(43);
const readBearer = 'r'.repeat(43);

test('Git panel fetches, fast-forwards and pushes with scoped authorization', {timeout: 120000}, async t => {
    const build = process.env.E2E_PROJECT_FOLDER_BUILD;
    const fixtureFile = process.env.E2E_GIT_HTTP_FIXTURE;
    assert.ok(build && path.isAbsolute(build), 'Set E2E_PROJECT_FOLDER_BUILD to the built Editor directory');
    assert.ok(fixtureFile && path.isAbsolute(fixtureFile), 'Set E2E_GIT_HTTP_FIXTURE to the Git Smart HTTP test fixture module');
    await verifyWebEditor(build);
    const {startFixture, git, commit} = await import(pathToFileURL(fixtureFile).href);
    const fixture = await startFixture(t);
    const {client, seed, bare} = fixture;
    const source = path.join(client, 'project.txt');
    const config = path.join(client, '.git/config');
    const initial = git(client, 'rev-parse', 'HEAD');
    const configBefore = await readFile(config);

    const server = createServer(async (req, res) => {
        try {
            const url = new URL(req.url ?? '/', 'http://127.0.0.1');
            if (!url.pathname.startsWith(prefix)) {res.writeHead(404).end(); return;}
            const file = path.resolve(build, decodeURIComponent(url.pathname.slice(prefix.length)));
            if (!file.startsWith(build + path.sep)) {res.writeHead(404).end(); return;}
            const data = await readFile(file);
            res.writeHead(200, {'Content-Type': mime.get(path.extname(file)) ?? 'application/octet-stream'}).end(data);
        } catch {res.writeHead(404).end();}
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise<void>(resolve => {server.close(() => resolve()); server.closeAllConnections();}));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const origin = 'http://127.0.0.1:' + address.port;
    fixture.origins.add(origin);
    fixture.sessions.set(writeBearer, {mode: 'desktop', write: true});
    fixture.sessions.set(readBearer, {mode: 'desktop', write: false});

    const args = ['--enable-experimental-web-platform-features', '--enable-unsafe-swiftshader'];
    if (process.platform === 'darwin') args.push('--single-process', '--no-zygote', '--disable-crash-reporter');
    const browser = await chromium.launch({headless: true, args});
    t.after(() => browser.close());
    t.diagnostic('Chromium ' + browser.version());
    const page = await browser.newPage({viewport: {width: 1280, height: 920}});
    let browserPushes = 0;
    page.on('request', request => {
        if (request.method() === 'POST' && request.url().endsWith('/git-receive-pack')) browserPushes++;
    });
    await page.route('**/*', route => [origin, fixture.origin].includes(new URL(route.request().url()).origin) ?
        route.continue() : route.abort());
    await page.addInitScript(({proxyOrigin, writeBearer, readBearer}) => {
        const view = window as any;
        let directory: FileSystemHandle | undefined;
        let write = false;
        const session = () => ({connection: {mode: 'desktop', proxyOrigin},
            account: {login: 'fixture'}, bearer: write ? writeBearer : readBearer, expiresAt: Date.now() + 60_000});
        view.EditorPreload = {localGit: {
            async begin() {
                return {userCode: 'TEST-CODE', verificationUri: 'https://github.com/login/device', expiresAt: Date.now() + 60_000};
            },
            async finish() {},
            async authorizeRepository(_url: string, granted: boolean) {write = granted; return session();},
            async getSession() {return session();},
            async disconnect() {write = false;}
        }};
        for (const type of ['dragenter', 'dragover', 'drop']) window.addEventListener(type, async event => {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (type === 'drop') {
                const item = (event as DragEvent).dataTransfer!.items[0] as DataTransferItem & {
                    getAsFileSystemHandle(): Promise<FileSystemHandle>;
                };
                directory = await item.getAsFileSystemHandle();
                view.gitDirectoryReady = directory?.kind === 'directory';
            }
        }, {capture: true});
        view.showDirectoryPicker = async () => directory;
    }, {proxyOrigin: fixture.origin, writeBearer, readBearer});
    await page.goto(origin + prefix + 'editor.html?lang=en');
    await page.waitForFunction(() => Boolean(window.vm?.runtime.getTargetForStage()), null, {timeout: 45000});
    const cdp = await page.context().newCDPSession(page);
    for (const type of ['dragEnter', 'dragOver', 'drop'] as const) await cdp.send('Input.dispatchDragEvent', {
        type, x: 100, y: 100, data: {items: [], files: [client], dragOperationsMask: 1}
    });
    await page.waitForFunction(() => (window as any).gitDirectoryReady);
    await page.getByText('File', {exact: true}).click();
    await page.getByText('Local Git…', {exact: true}).click();
    const panel = page.getByRole('dialog', {name: 'Local Git'});
    const button = (name: string) => panel.getByRole('button', {name, exact: true});
    const status = panel.locator('[data-git-connection-state]');
    const notice = panel.getByText('Git operation completed.', {exact: true});
    await button('Choose Repository…').click();
    await expect(button('initial')).toBeVisible();
    await panel.getByText('GitHub connection', {exact: true}).click();
    await panel.getByRole('combobox', {name: 'Connection mode'}).selectOption('desktop');
    const connect = async () => {
        await button('Connect to GitHub').click();
        await expect(panel.getByText('TEST-CODE')).toBeVisible();
        await button('Check connection').click();
        await expect(status).toHaveText('Connected');
    };
    await connect();
    await expect(button('Push')).toBeDisabled();
    await writeFile(path.join(seed, 'project.txt'), 'browser incoming\n');
    const incoming = commit(seed, 'browser incoming');
    git(seed, 'push', bare, 'main');
    await button('Fetch').click();
    await expect(notice).toBeVisible();
    assert.equal(git(client, 'rev-parse', 'refs/remotes/origin/main'), incoming);
    assert.equal(git(client, 'rev-parse', 'HEAD'), initial);
    assert.equal(await readFile(source, 'utf8'), 'initial\n');

    const editorDirty = (changed: boolean) => page.evaluate(changed => (window as any).ReduxStore.dispatch({
        type: 'scratch-gui/project-changed/SET_PROJECT_CHANGED', changed
    }), changed);
    await editorDirty(true);
    const priorRequests = fixture.upstream.length;
    await button('Pull (fast-forward only)').click();
    await expect(panel.getByRole('alert')).toContainText('clear unsaved or local Git changes');
    assert.equal(fixture.upstream.length, priorRequests);
    await editorDirty(false);
    await writeFile(source, 'external edit\n');
    await button('Pull (fast-forward only)').click();
    await expect(panel.getByRole('alert')).toContainText('clear unsaved or local Git changes');
    assert.equal(await readFile(source, 'utf8'), 'external edit\n');
    await writeFile(source, 'initial\n');
    await button('Pull (fast-forward only)').click();
    await expect(notice).toBeVisible();
    assert.equal(git(client, 'rev-parse', 'HEAD'), incoming);
    assert.equal(await readFile(source, 'utf8'), 'browser incoming\n');

    await button('Disconnect').click();
    await expect(status).toHaveText('Disconnected');
    await panel.getByRole('checkbox', {name: 'Authorize push'}).check();
    await connect();
    await writeFile(source, 'browser outgoing\n');
    const outgoing = commit(client, 'browser outgoing');
    page.once('dialog', dialog => dialog.accept());
    await button('Push').click();
    await expect(notice).toBeVisible();
    assert.equal(git(bare, 'rev-parse', 'main'), outgoing);
    assert.equal(git(bare, 'show', 'main:project.txt'), 'browser outgoing');
    await writeFile(source, 'browser uncertain\n');
    const uncertain = commit(client, 'browser uncertain');
    fixture.dropPush = 'after-headers';
    const pushes = () => fixture.upstream.filter(request => request.method === 'POST' &&
        request.path.endsWith('/git-receive-pack')).length;
    const previousPushes = pushes();
    page.once('dialog', dialog => dialog.accept());
    await button('Push').click();
    await expect(panel.getByRole('alert')).toContainText('The push result is unknown');
    assert.equal(pushes(), previousPushes + 1);
    assert.equal(git(bare, 'rev-parse', 'main'), uncertain);
    page.once('dialog', dialog => dialog.accept());
    await button('Push').click();
    await expect(panel.getByRole('alert')).toContainText('The push result is unknown');
    assert.equal(pushes(), previousPushes + 1);
    fixture.dropPush = false;
    await button('Fetch').click();
    await expect(notice).toBeVisible();
    assert.equal(git(client, 'rev-parse', 'refs/remotes/origin/main'), uncertain);

    await writeFile(source, 'browser disconnected before headers\n');
    const dropped = commit(client, 'browser disconnected before headers');
    fixture.dropPush = true;
    const beforeDrop = pushes();
    const beforeBrowser = browserPushes;
    const beforeReceived = fixture.requests.length;
    const duplicateResponse = page.waitForResponse(response =>
        response.url().startsWith(fixture.origin) && response.url().endsWith('/git-receive-pack') &&
        response.status() === 409);
    page.once('dialog', dialog => dialog.accept());
    await button('Push').click();
    // The fixture answers a replayed receive-pack with 409 only for PUSH_DUPLICATE. Its body is read by the
    // page, so Playwright cannot always fetch it again.
    await duplicateResponse;
    await expect(panel.getByRole('alert')).toContainText('The push result is unknown');
    assert.equal(browserPushes, beforeBrowser + 1);
    assert.equal(git(bare, 'rev-parse', 'main'), dropped);
    const replays = fixture.requests.slice(beforeReceived).filter(request => request.method === 'POST' &&
        request.url.endsWith('/git-receive-pack'));
    assert.equal(replays.length, 2);
    assert.equal(replays[0].headers['git-push-id'], replays[1].headers['git-push-id']);
    assert.equal(pushes(), beforeDrop + 1);
    t.diagnostic('Desktop: two receive-pack requests, one upstream');
    fixture.dropPush = false;

    const oauthState = 's'.repeat(43);
    const cloudTicket = oauthState + '.' + 't'.repeat(43);
    const cloudBearer = oauthState + '.' + 'c'.repeat(43);
    const cloudProxy = 'https://proxy.git.test';
    const cloudAuth: {method: string; write?: boolean}[] = [];
    let replayCloudPush = false;
    // Route the two HTTPS endpoints through the local fixture. The Desktop path above uses real CORS.
    fixture.sessions.set(cloudBearer, {mode: 'desktop', write: true});
    await page.route('https://bff.git.test/v1/git-auth/**', async route => {
        const request = route.request();
        const headers = {'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET,POST,DELETE',
            'Access-Control-Allow-Headers': 'Authorization,Content-Type'};
        if (request.method() === 'OPTIONS') return route.fulfill({status: 204, headers});
        if (request.method() === 'POST') {
            cloudAuth.push({method: 'POST', write: request.postDataJSON().write});
            return route.fulfill({headers, json: {ticket: cloudTicket,
                authorizationUrl: 'https://github.com/login/oauth/authorize?state=' + oauthState}});
        }
        assert.equal((await request.allHeaders()).authorization, 'Bearer ' + cloudTicket);
        cloudAuth.push({method: request.method()});
        return route.fulfill({headers, json: {connection: {mode: 'cloudflare', proxyOrigin: cloudProxy},
            account: {login: 'cloud-fixture'}, bearer: cloudBearer, expiresAt: Date.now() + 60_000}});
    });
    await page.route(cloudProxy + '/v1/git/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const headers = await request.allHeaders();
        delete headers.host;
        delete headers['content-length'];
        const forward = () => route.fetch({url: fixture.origin + url.pathname + url.search,
            headers: {...headers, origin}, maxRedirects: 0});
        const response = await forward();
        if (replayCloudPush && request.method() === 'POST' && url.pathname.endsWith('/git-receive-pack')) {
            replayCloudPush = false;
            assert.equal(response.status(), 200);
            const duplicate = await forward();
            assert.equal(duplicate.status(), 409);
            assert.equal((await duplicate.json()).code, 'PUSH_DUPLICATE');
            return route.fulfill({response: duplicate});
        }
        return route.fulfill({response});
    });
    await panel.getByRole('combobox', {name: 'Connection mode'}).selectOption('cloudflare');
    await expect(status).toHaveText('Disconnected');
    await button('Connect to GitHub').click();
    await expect(panel.getByRole('link', {name: 'Open GitHub authorization'})).toBeVisible();
    await button('Check connection').click();
    await expect(status).toHaveText('Connected');
    assert.deepEqual(cloudAuth[0], {method: 'POST', write: true});
    await button('Fetch').click();
    await expect(notice).toBeVisible();
    git(seed, 'pull', '--ff-only', bare, 'main');
    await writeFile(path.join(seed, 'project.txt'), 'cloud incoming\n');
    const cloudIncoming = commit(seed, 'cloud incoming');
    git(seed, 'push', bare, 'main');
    await button('Pull (fast-forward only)').click();
    await expect(notice).toBeVisible();
    assert.equal(git(client, 'rev-parse', 'HEAD'), cloudIncoming);
    assert.equal(await readFile(source, 'utf8'), 'cloud incoming\n');
    await writeFile(source, 'cloud outgoing\n');
    const cloudOutgoing = commit(client, 'cloud outgoing');
    page.once('dialog', dialog => dialog.accept());
    await button('Push').click();
    await expect(notice).toBeVisible();
    assert.equal(git(bare, 'rev-parse', 'main'), cloudOutgoing);
    await writeFile(source, 'cloud replay\n');
    const cloudReplayed = commit(client, 'cloud replay');
    const beforeCloudReplay = pushes();
    replayCloudPush = true;
    page.once('dialog', dialog => dialog.accept());
    await button('Push').click();
    await expect(panel.getByRole('alert')).toContainText('The push result is unknown');
    assert.equal(pushes(), beforeCloudReplay + 1);
    assert.equal(git(bare, 'rev-parse', 'main'), cloudReplayed);
    page.once('dialog', dialog => dialog.accept());
    await button('Push').click();
    await expect(panel.getByRole('alert')).toContainText('The push result is unknown');
    assert.equal(pushes(), beforeCloudReplay + 1);
    await button('Fetch').click();
    await expect(notice).toBeVisible();
    assert.equal(git(client, 'rev-parse', 'refs/remotes/origin/main'), cloudReplayed);
    t.diagnostic('Cloudflare: duplicate mapped to unknown, fetch reconciled the ref');

    git(seed, 'pull', '--ff-only', bare, 'main');
    await writeFile(path.join(seed, 'project.txt'), 'remote diverged\n');
    commit(seed, 'remote diverged');
    git(seed, 'push', bare, 'main');
    await writeFile(source, 'local diverged\n');
    const diverged = commit(client, 'local diverged');
    const index = await readFile(path.join(client, '.git/index'));
    await button('Pull (fast-forward only)').click();
    await expect(panel.getByRole('alert')).toContainText('Pull requires a fast-forward');
    assert.equal(git(client, 'rev-parse', 'HEAD'), diverged);
    assert.equal(await readFile(source, 'utf8'), 'local diverged\n');
    assert.deepEqual(await readFile(path.join(client, '.git/index')), index);
    assert.deepEqual(await readFile(config), configBefore);
});
