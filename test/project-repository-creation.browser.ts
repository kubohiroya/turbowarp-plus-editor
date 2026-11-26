import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {test} from 'node:test';
import {chromium, expect, webkit} from '@playwright/test';
import type {Page} from '@playwright/test';
import {verifyWebEditor} from '../scripts/site/editor-revision.ts';

const bffOrigin = 'https://github-create.example.invalid';
const proxyOrigin = 'https://github-git.example.invalid';
const prefix = '/turbowarp-plus-editor/';
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav', '.wasm': 'application/wasm'};
const creationState = 'c'.repeat(43);
const gitState = 'g'.repeat(43);
const sessionKey = 's'.repeat(43);
const writeBearer = 'w'.repeat(43);

// Without the folder picker, as in Safari, the repository goes to the browser's own storage (OPFS) instead (#660).
const cases = [
    {mode: 'desktop', storage: 'device', engine: 'chromium'},
    {mode: 'cloudflare', storage: 'device', engine: 'chromium'},
    {mode: 'cloudflare', storage: 'browser', engine: 'chromium'},
    {mode: 'cloudflare', storage: 'browser', engine: 'webkit'}
] as const;
for (const {mode, storage, engine} of cases) {
    const where = storage === 'browser' ? ' into the browser\'s storage' : '';
    test(`Editor creates, resumes and pushes the first local Git commit via ${mode}${where} (${engine})`, {timeout: 120000}, async t => {
        const build = process.env.E2E_PROJECT_SAVE_BUILD;
        const fixtureFile = process.env.E2E_GIT_HTTP_FIXTURE;
        assert.ok(build && path.isAbsolute(build), 'Set E2E_PROJECT_SAVE_BUILD to the creation preview');
        assert.ok(fixtureFile && path.isAbsolute(fixtureFile), 'Set E2E_GIT_HTTP_FIXTURE to the Git Smart HTTP test fixture');
        const info = JSON.parse(await readFile(path.join(build, 'build-info.json'), 'utf8'));
        const pins = JSON.parse(await readFile(new URL('../site/source.json', import.meta.url), 'utf8'));
        assert.equal(info.revision, pins.guiRevision);
        await verifyWebEditor(build);
        const server = createServer(async (req, res) => {
            try {
                const url = new URL(req.url ?? '', 'http://127.0.0.1');
                if (!url.pathname.startsWith(prefix)) {res.writeHead(404).end(); return;}
                const filename = path.resolve(build, decodeURIComponent(url.pathname.slice(prefix.length)));
                if (!filename.startsWith(build + path.sep)) {res.writeHead(404).end(); return;}
                const body = await readFile(filename);
                res.writeHead(200, {'Content-Type': mime[path.extname(filename)] || 'application/octet-stream'}).end(body);
            } catch {res.writeHead(404).end();}
        });
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
        t.after(() => new Promise<void>(resolve => {server.close(() => resolve()); server.closeAllConnections();}));
        const address = server.address();
        assert.ok(address && typeof address === 'object');
        const origin = 'http://127.0.0.1:' + address.port;
        const {startFixture, git, remote} = await import(pathToFileURL(fixtureFile).href);
        const fixture = await startFixture(t);
        const destination = path.join(fixture.root, 'new-work');
        await mkdir(destination);
        git(fixture.bare, 'update-ref', '-d', 'refs/heads/main');
        fixture.origins.add(origin);
        fixture.sessions.set(writeBearer, {mode: 'desktop', write: true});
        const repository = {id: 37, owner: 'fixture', name: 'work', visibility: 'private', remote};
        const connection = {mode, proxyOrigin: mode === 'desktop' ? fixture.origin : bffOrigin};
        const creationBearer = mode === 'desktop' ? 'create.' + creationState : 'create.' + creationState + '.' + sessionKey;
        const gitBearer = gitState + '.' + writeBearer;
        const session = {account: {login: 'fixture'}, expiresAt: Date.now() + 60_000};
        const grant = {connection, ...session, scope: 'repository-creation', bearer: creationBearer};
        let operationId: string;
        let creationRequests = 0;
        let topicRequests = 0;
        let cloudflareReconciled = false;
        let desktopReconciled = false;
        let cloudflareRevoke = 0;

        const viewport = {width: 1280, height: 920};
        let page: Page;
        if (engine === 'webkit') {
            // WebKit has no folder picker, and keeps an origin private file system only in a persistent profile.
            const profile = await mkdtemp(path.join(os.tmpdir(), 'tw-plus-webkit-'));
            const context = await webkit.launchPersistentContext(profile, {headless: true, viewport});
            t.after(async () => {
                await context.close();
                await rm(profile, {recursive: true, force: true});
            });
            page = context.pages()[0] ?? await context.newPage();
        } else {
            const args = ['--enable-experimental-web-platform-features', '--enable-unsafe-swiftshader'];
            if (process.platform === 'darwin') args.push('--single-process', '--no-zygote', '--disable-crash-reporter');
            const browser = await chromium.launch({headless: true, args});
            t.after(() => browser.close());
            page = await browser.newPage({viewport});
        }
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.stack || error.message));
        await page.exposeFunction('didAdopt', (id: string, repositoryId: number) => {
            assert.equal(id, operationId);
            assert.equal(repositoryId, repository.id);
            desktopReconciled = true;
        });
        await page.context().route('**/*', async route => {
            const req = route.request();
            const url = new URL(req.url());
            if (url.origin === origin) return route.continue();
            if ([fixture.origin, proxyOrigin].includes(url.origin) && url.pathname.startsWith('/v1/git/')) {
                if (req.method() === 'OPTIONS') return route.fulfill({status: 204, headers: {
                    'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET,POST',
                    'access-control-allow-headers': 'authorization,content-type,git-push-id'
                }});
                assert.equal(req.headers().authorization, 'Bearer ' + (mode === 'desktop' ? writeBearer : gitBearer));
                const response = await route.fetch({url: fixture.origin + url.pathname + url.search, maxRedirects: 0,
                    headers: {...req.headers(), origin, authorization: 'Bearer ' + writeBearer}});
                return route.fulfill({response});
            }
            if (url.origin !== connection.proxyOrigin) return route.abort();
            const headers = {'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization,content-type',
                'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS'};
            const reply = (status: number, json?: object) => route.fulfill({status, headers, json});
            if (req.method() === 'OPTIONS') return reply(204);
            const authorization = (state: string, callback: string) => 'https://github.com/login/oauth/authorize?' +
                new URLSearchParams({state, redirect_uri: bffOrigin + callback, code_challenge_method: 'S256'});
            if (url.pathname === '/v1/github-create/start') return reply(200, {
                ticket: 'login.' + creationState + '.' + sessionKey, authorizationUrl: authorization(creationState, '/v1/github-create/callback')
            });
            if (url.pathname === '/v1/github-create/session') return req.method() === 'DELETE' ? reply(204) : reply(200, grant);
            if (url.pathname === '/v1/git-auth/start') {
                assert.deepEqual(req.postDataJSON(), {remote, write: true, repositoryId: repository.id});
                return reply(200, {ticket: gitState + '.' + sessionKey, authorizationUrl: authorization(gitState, '/v1/git-auth/callback')});
            }
            if (url.pathname === '/v1/git-auth/session') {
                if (req.method() === 'DELETE') {cloudflareRevoke++; return reply(204);}
                return reply(200, {...session, connection: {mode, proxyOrigin}, repositoryId: repository.id, bearer: gitBearer});
            }
            assert.equal(req.headers().authorization, 'Bearer ' + creationBearer);
            if (url.pathname === '/v1/github-create/owners') return reply(200, {
                owners: [{login: 'fixture', type: 'User', canCreate: {private: true, public: true}}]
            });
            if (url.pathname === '/v1/github-create/repos') {
                const intent = req.postDataJSON();
                assert.match(intent.operationId, /^[a-f0-9-]{36}$/u);
                assert.match(intent.seedDigest, /^[a-f0-9]{64}$/u);
                assert.deepEqual([intent.owner, intent.name, intent.description, intent.visibility, intent.topics],
                    ['fixture', 'work', 'A demo project', 'private', ['scratch', 'demo']]);
                operationId ??= intent.operationId;
                assert.equal(intent.operationId, operationId);
                creationRequests++;
                return desktopReconciled || cloudflareReconciled ? reply(201, repository) : reply(409, {code: 'unknown'});
            }
            if (url.pathname === '/v1/github-create/operations/' + operationId) {
                return reply(200, {status: 'unknown', candidate: {...repository, createdAt: Date.now()}});
            }
            if (url.pathname === '/v1/github-create/operations/' + operationId + '/reconcile') {
                assert.deepEqual(req.postDataJSON(), {repositoryId: repository.id});
                cloudflareReconciled = true;
                return reply(201, repository);
            }
            if (url.pathname === '/v1/github-create/repos/' + repository.id + '/topics') {
                assert.deepEqual(req.postDataJSON(), {operationId});
                topicRequests++;
                return reply(204);
            }
            return reply(404);
        });
        await page.context().addInitScript(({mode, storage, engine, connection, grant, writeBearer, repository}) => {
            const view = window as any;
            const browserOpen = window.open.bind(window);
            view.open = (target?: string, ...options: [string?, string?]) => {
                const url = new URL(target ?? '', location.href);
                if (url.origin === location.origin && url.searchParams.has('twPlusOpenTab')) {
                    return browserOpen(target, ...options);
                }
                // Authorization is simulated; only the real same-origin Editor popup may open.
                return {opener: view, closed: false, location: {replace() {}}, close() {}};
            };
            if (mode === 'desktop') {
                let connected = false;
                view.EditorPreload = {localGitCreation: {
                    async getConnection() {return connection;},
                    async getGrant() {return connected ? grant : null;},
                    async begin() {return {userCode: 'ABCD-EFGH', verificationUri: 'https://github.com/login/device',
                        expiresAt: Date.now() + 60_000};},
                    async finish() {
                        if (!view.finishedLogin) await new Promise(resolve => {view.completeLogin = resolve;});
                        view.finishedLogin = connected = true;
                        return grant;
                    },
                    async inspectUnknown() {return repository;},
                    async adoptUnknown(id: string, repositoryId: number) {
                        await view.didAdopt(id, repositoryId);
                        return repository;
                    },
                    async authorizeInitialPush(_id: string, repositoryId: number) {
                        if (repositoryId !== repository.id) return null;
                        return {remote: repository.remote, repositoryId, session: {...grant, bearer: writeBearer}};
                    },
                    async disconnect() {}
                }};
            }
            if (storage === 'browser' && engine === 'chromium') {
                // Exercise the same fallback through Chromium while preserving the real WebKit test.
                Object.defineProperty(view, 'showDirectoryPicker', {value: undefined, configurable: true});
                return;
            }
            if (engine === 'webkit') {
                // Playwright's WebKit hands a Blob body to page.route as empty, so the push is sent as bytes here.
                const send = window.fetch.bind(window);
                window.fetch = async (input, init) => init?.body instanceof Blob ?
                    send(input, {...init, body: await init.body.arrayBuffer()}) : send(input, init);
                return;
            }
            for (const type of ['dragenter', 'dragover', 'drop']) window.addEventListener(type, async event => {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (type !== 'drop') return;
                const item = (event as DragEvent).dataTransfer.items[0] as DataTransferItem & {
                    getAsFileSystemHandle(): Promise<FileSystemDirectoryHandle>;
                };
                view.repoDirectory = await item.getAsFileSystemHandle();
            }, {capture: true});
            view.showDirectoryPicker = async () => view.repoDirectory;
        }, {mode, storage, engine, connection, grant, writeBearer, repository});
        await page.goto(origin + prefix + 'editor.html?lang=en');
        await page.waitForFunction(() => Boolean(window.vm?.runtime.getTargetForStage()), null, {timeout: 45000});
        await page.evaluate(async () => {
            const vm = window.vm;
            vm.runtime.getTargetForStage().volume = 72;
            const sb3 = await vm.saveProjectSb3('arraybuffer');
            await vm.loadProject(sb3);
        });
        if (storage === 'device') {
            const cdp = await page.context().newCDPSession(page);
            for (const type of ['dragEnter', 'dragOver', 'drop'] as const) await cdp.send('Input.dispatchDragEvent', {type, x: 100, y: 100,
                data: {items: [], files: [destination], dragOperationsMask: 1}});
            await page.waitForFunction(() => Boolean((window as any).repoDirectory));
        } else assert.equal(await page.evaluate(() => typeof (window as any).showDirectoryPicker), 'undefined');
        const showSaveAs = async () => {
            await page.getByText('File', {exact: true}).click();
            await page.getByText('Save a Copy of the Project…', {exact: true}).click();
        };
        await showSaveAs();
        const dialog = page.getByRole('dialog', {name: 'Save a Copy of the Project', exact: true});
        const button = (name: string) => dialog.getByRole('button', {name, exact: true});
        await dialog.getByLabel('Save format').selectOption('folder');
        await dialog.getByLabel('Use Git version control').check();
        await dialog.getByLabel('Name', {exact: true}).fill('First GitHub project');
        await dialog.getByLabel('GitHub URL (optional)').fill('https://github.com/fixture/work');
        await dialog.getByLabel('Description').fill('A demo project');
        await dialog.getByLabel('Topics (comma separated)').fill('scratch,demo');
        await dialog.getByLabel('License').selectOption('MPL-2.0');
        await button('Connect to GitHub…').click();
        if (mode === 'desktop') {
            await expect(dialog.getByText('ABCD-EFGH')).toBeVisible();
            await page.evaluate(() => (window as any).completeLogin());
        }
        await expect(dialog.getByText('GitHub account fixture')).toBeVisible();
        await button('Review Repository').click();
        await expect(dialog.getByRole('heading', {name: 'Review GitHub repository creation'})).toBeVisible();
        assert.equal(creationRequests, 0);
        await button('Create Repository').click();
        await expect(button('Check Creation Result')).toBeEnabled();
        assert.equal(creationRequests, 1);

        await button('Cancel').click();
        await showSaveAs();
        await button('Resume setup for fixture/work').click();
        await button('Check Creation Result').click();
        await expect(dialog.getByText(/An empty repository with ID 37/u)).toBeVisible();
        await button('Continue with This Repository').click();
        await expect(button('Authorize and Push…')).toBeEnabled().catch(async error => {
            t.diagnostic(JSON.stringify({errors, text: await dialog.innerText()}));
            throw error;
        });
        assert.equal(topicRequests, 1);
        assert.equal(fixture.upstream.length, 0);
        // The commit is read from the picked folder before the push; a commit in the browser's storage, from GitHub after it.
        const checkCommit = (directory: string, commit: string) => {
            assert.match(git(directory, 'show', commit + ':README.md'), /First GitHub project/u);
            assert.match(git(directory, 'show', commit + ':LICENSE'), /Mozilla Public License/u);
            const project = JSON.parse(git(directory, 'show', commit + ':project.source.json'));
            assert.equal(project.targets[0].volume, 72);
            assert.equal(project.turboWarpPlusProject.title, 'First GitHub project');
        };
        const localOid = storage === 'device' ? git(destination, 'rev-parse', 'HEAD') : null;
        if (storage === 'device') checkCommit(destination, 'HEAD');
        await button('Authorize and Push…').click();
        await expect(button('Open the Local Project')).toBeEnabled().catch(error => {
            t.diagnostic(JSON.stringify({errors, proxyRequests: fixture.requests.map(({url, method}) => ({url, method}))}));
            throw error;
        });
        if (storage === 'device') {
            assert.equal(git(fixture.bare, 'rev-parse', 'main'), localOid);
            assert.equal(git(destination, 'rev-parse', 'origin/main'), localOid);
        } else checkCommit(fixture.bare, 'main');
        assert.equal(fixture.upstream.filter(request => request.method === 'POST').length, 1);
        if (mode === 'cloudflare') await expect.poll(() => cloudflareRevoke).toBe(1);
        const opened = page.context().waitForEvent('page', {timeout: 20000});
        const retry = page.getByRole('button', {name: 'Open in a new tab', exact: true});
        await button('Open the Local Project').click();
        if (await Promise.race([opened.then(() => false), retry.waitFor({state: 'visible'}).then(() => true)])) {
            await retry.click();
        }
        const projectTab = await opened;
        await expect(projectTab.getByRole('button', {name: 'Branch: main', exact: true})).toBeVisible();
        await expect(projectTab.getByRole('textbox', {name: 'Project title here'})).toHaveValue('First GitHub project');
        await expect(dialog).toBeVisible();
        await button('Cancel').click();
        await expect(dialog).toBeHidden();
        if (storage === 'browser') {
            // Without the folder picker, the drawer still shows the project folder and the Git history kept in the browser.
            const drawerView = (name: string) => projectTab.getByRole('toolbar', {name: 'Drawer views', exact: true})
                .getByRole('button', {name, exact: true});
            await drawerView('Project folder').click();
            await expect(projectTab.locator('[data-drawer-content]').getByText('project.source.json').first()).toBeVisible();
            await drawerView('Git history').click();
            await expect(projectTab.locator('[data-drawer-content]').getByText('Import project from TurboWarp Plus Editor').first())
                .toBeVisible();
        }
        assert.deepEqual(errors, []);
    });
}
