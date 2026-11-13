import assert from 'node:assert/strict';
import {mkdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {test} from 'node:test';
import {chromium, expect} from '@playwright/test';

const origin = 'http://localhost:41017';
const bffOrigin = 'https://github-create.example.invalid';
const proxyOrigin = 'https://github-git.example.invalid';
const prefix = '/turbowarp-plus-editor/';
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav', '.wasm': 'application/wasm'};
const creationState = 'c'.repeat(43);
const gitState = 'g'.repeat(43);
const sessionKey = 's'.repeat(43);
const writeBearer = 'w'.repeat(43);

for (const mode of ['desktop', 'cloudflare'] as const) {
    test(`Editor creates, resumes and pushes the first local Git commit via ${mode}`, {timeout: 120000}, async t => {
        const build = process.env.E2E_PROJECT_SAVE_BUILD;
        const fixtureFile = process.env.E2E_GIT_HTTP_FIXTURE;
        assert.ok(build && path.isAbsolute(build), 'Set E2E_PROJECT_SAVE_BUILD to the creation preview');
        assert.ok(fixtureFile && path.isAbsolute(fixtureFile), 'Set E2E_GIT_HTTP_FIXTURE to the Git Smart HTTP test fixture');
        const info = JSON.parse(await readFile(path.join(build, 'build-info.json'), 'utf8'));
        const pins = JSON.parse(await readFile(new URL('../site/source.json', import.meta.url), 'utf8'));
        assert.equal(info.revision, pins.guiRevision);
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

        const args = ['--enable-experimental-web-platform-features', '--enable-unsafe-swiftshader'];
        if (process.platform === 'darwin') args.push('--single-process', '--no-zygote', '--disable-crash-reporter');
        const browser = await chromium.launch({headless: true, args});
        t.after(() => browser.close());
        const page = await browser.newPage({viewport: {width: 1280, height: 920}});
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.stack || error.message));
        await page.exposeFunction('didAdopt', (id: string, repositoryId: number) => {
            assert.equal(id, operationId);
            assert.equal(repositoryId, repository.id);
            desktopReconciled = true;
        });
        await page.route('**/*', async route => {
            const req = route.request();
            const url = new URL(req.url());
            if (url.origin === origin && url.pathname.startsWith(prefix)) {
                const filename = path.resolve(build, decodeURIComponent(url.pathname.slice(prefix.length)));
                if (!filename.startsWith(build + path.sep)) return route.abort();
                const body = await readFile(filename).catch(() => null);
                if (body === null) return route.fulfill({status: 404});
                return route.fulfill({body, contentType: mime[path.extname(filename)] || 'application/octet-stream'});
            }
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
        await page.addInitScript(({mode, connection, grant, writeBearer, repository}) => {
            const view = window as any;
            view.open = () => ({opener: view, closed: false, location: {replace() {}}, close() {}});
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
        }, {mode, connection, grant, writeBearer, repository});
        await page.goto(origin + prefix + 'editor.html?lang=en');
        await page.waitForFunction(() => Boolean(window.vm?.runtime.getTargetForStage()), null, {timeout: 45000});
        await page.evaluate(async () => {
            const vm = window.vm;
            vm.runtime.getTargetForStage().volume = 72;
            const sb3 = await vm.saveProjectSb3('arraybuffer');
            await vm.loadProject(sb3);
        });
        const cdp = await page.context().newCDPSession(page);
        for (const type of ['dragEnter', 'dragOver', 'drop'] as const) await cdp.send('Input.dispatchDragEvent', {type, x: 100, y: 100,
            data: {items: [], files: [destination], dragOperationsMask: 1}});
        await page.waitForFunction(() => Boolean((window as any).repoDirectory));
        const showSaveAs = async () => {
            await page.getByText('File', {exact: true}).click();
            await page.getByText('Save As…', {exact: true}).click();
        };
        await showSaveAs();
        const dialog = page.getByRole('dialog', {name: 'Save As', exact: true});
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
        await expect(button('Authorize and Push…')).toBeEnabled();
        assert.equal(topicRequests, 1);
        assert.equal(fixture.upstream.length, 0);
        const localOid = git(destination, 'rev-parse', 'HEAD');
        assert.match(git(destination, 'show', 'HEAD:README.md'), /First GitHub project/u);
        assert.match(git(destination, 'show', 'HEAD:LICENSE'), /Mozilla Public License/u);
        const project = JSON.parse(git(destination, 'show', 'HEAD:project/project.source.json'));
        assert.equal(project.targets[0].volume, 72);
        assert.equal(project.turboWarpPlusProject.title, 'First GitHub project');
        await button('Authorize and Push…').click();
        await expect(button('Open the Local Project')).toBeEnabled().catch(error => {
            t.diagnostic(JSON.stringify({errors, proxyRequests: fixture.requests.map(({url, method}) => ({url, method}))}));
            throw error;
        });
        assert.equal(git(fixture.bare, 'rev-parse', 'main'), localOid);
        assert.equal(git(destination, 'rev-parse', 'origin/main'), localOid);
        assert.equal(fixture.upstream.filter(request => request.method === 'POST').length, 1);
        if (mode === 'cloudflare') await expect.poll(() => cloudflareRevoke).toBe(1);
        page.once('dialog', prompt => prompt.accept());
        await button('Open the Local Project').click();
        await expect(dialog).toBeHidden();
        await expect(page.getByRole('button', {name: 'Branch: main', exact: true})).toBeVisible();
        await expect(page.getByRole('textbox', {name: 'Project title here'})).toHaveValue('First GitHub project');
        assert.deepEqual(errors, []);
    });
}
