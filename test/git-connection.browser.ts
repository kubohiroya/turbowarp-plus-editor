import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium, expect, type Page} from '@playwright/test';
import {verifyWebEditor} from '../scripts/site/editor-revision.ts';

const origin = 'http://localhost:41015';
const prefix = '/turbowarp-plus-editor/';
const bff = 'https://bff.git.test';
const proxy = 'https://proxy.git.test';
const remote = 'https://github.com/owner/project.git';
const oauthState = 's'.repeat(43);
const ticket = oauthState + '.' + 't'.repeat(43);
const bearer = oauthState + '.' + 'b'.repeat(43);
const editor = origin + prefix + 'editor.html?lang=en';
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav', '.wasm': 'application/wasm'};

test('GitHub connection settings isolate the selected provider and keep the working tree intact', {timeout: 120000}, async t => {
    const build = process.env.E2E_PROJECT_FOLDER_BUILD;
    assert.ok(build && path.isAbsolute(build), 'Set E2E_PROJECT_FOLDER_BUILD to the built Editor directory');
    await verifyWebEditor(build);
    const folder = await mkdtemp(path.join(process.platform === 'darwin' ? '/private/tmp' : tmpdir(), 'tw-git-connection-'));
    t.after(() => rm(folder, {recursive: true, force: true}));
    const project = path.join(folder, 'project.source.json');
    const git = (...args: string[]) => execFileSync('git', args, {cwd: folder, encoding: 'utf8'}).trim();
    await writeFile(project, '{"committed":true}\n');
    git('init', '-q');
    git('add', '.');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
    git('remote', 'add', 'origin', remote);
    await writeFile(project, '{"localEdit":true}\n');
    const files = [project, path.join(folder, '.git/config'), path.join(folder, '.git/index'), path.join(folder, '.git/HEAD')];
    const before = await Promise.all(files.map(file => readFile(file)));

    const args = ['--enable-experimental-web-platform-features', '--enable-unsafe-swiftshader'];
    if (process.platform === 'darwin') args.push('--single-process', '--no-zygote', '--disable-crash-reporter');
    const browser = await chromium.launch({headless: true, args});
    t.after(() => browser.close());
    t.diagnostic('Chromium ' + browser.version());
    const context = await browser.newContext({viewport: {width: 1280, height: 920}});
    const page = await context.newPage();
    const failures: string[] = [];
    page.on('pageerror', error => failures.push(error.message));
    const requests: {method: string; url: string; authorization?: string; body: unknown}[] = [];
    let failCloudflare = true;
    let finishCloudflare = false;
    await page.context().route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === bff) {
            const method = request.method();
            const headers = {'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET,POST,DELETE',
                'Access-Control-Allow-Headers': 'Authorization,Content-Type'};
            if (method === 'OPTIONS') return route.fulfill({status: 204, headers});
            requests.push({method, url: url.pathname, authorization: (await request.allHeaders()).authorization,
                body: request.postDataJSON()});
            if (method === 'POST' && url.pathname === '/v1/git-auth/start') {
                if (failCloudflare) return route.fulfill({status: 502, headers});
                return route.fulfill({headers, json: {ticket,
                    authorizationUrl: 'https://github.com/login/oauth/authorize?state=' + oauthState}});
            }
            if (url.pathname === '/v1/git-auth/session') {
                if (method === 'DELETE') return route.fulfill({status: 204, headers});
                if (method === 'GET' && !finishCloudflare) return route.fulfill({status: 202, headers});
                if (method === 'GET') return route.fulfill({headers, json: {connection: {mode: 'cloudflare', proxyOrigin: proxy},
                    account: {login: 'cloud-account'}, bearer, expiresAt: Date.now() + 60_000}});
            }
            return route.fulfill({status: 404, headers});
        }
        if (url.origin !== origin || !url.pathname.startsWith(prefix)) return route.abort();
        const filename = path.resolve(build, decodeURIComponent(url.pathname.slice(prefix.length)));
        if (!filename.startsWith(build + path.sep)) return route.abort();
        const body = await readFile(filename).catch(() => null);
        if (body === null) return route.fulfill({status: 404});
        return route.fulfill({body, contentType: mime[path.extname(filename) as keyof typeof mime] || 'application/octet-stream'});
    });
    const installDesktopFixture = (target: Page) => target.addInitScript(() => {
        const view = window as any;
        const fixture = {calls: [] as unknown[][], failBegin: true, failDisconnect: false,
            helperAvailable: true, failPat: true, directory: undefined as FileSystemHandle | undefined};
        view.gitConnectionFixture = fixture;
        const session = () => ({
            connection: {mode: 'desktop', proxyOrigin: 'http://127.0.0.1:49152'},
            account: {login: 'desktop-account'}, bearer: 'd'.repeat(43), expiresAt: Date.now() + 60_000
        });
        if (new URLSearchParams(location.search).has('desktopAuthFixture')) {
            view.EditorPreload = {externalYaml: {async open() {return null;}}, localGit: null, localGitAuth: {
                async getAuthMethods(target?: string) {
                    return target && fixture.helperAvailable ?
                        ['fine-grained-pat', 'git-credential-helper'] : ['fine-grained-pat'];
                },
                async connectPersonalAccessToken(url: string, remember: boolean) {
                    fixture.calls.push(['pat', url, remember]);
                    if (fixture.failPat) {
                        fixture.failPat = false;
                        throw new Error('REAUTH_REQUIRED');
                    }
                    return {status: 'connected'};
                },
                async connectGitCredential(url: string, login: string) {
                    fixture.calls.push(['helper', url, login]);
                    return null;
                },
                async authorizeRepository(url: string, write: boolean, review?: boolean) {
                    fixture.calls.push(['authorize', url, write, review]);
                    return session();
                },
                async getSession() {return session();},
                async disconnect() {fixture.calls.push(['disconnect']);}
            }};
        } else view.EditorPreload = {externalYaml: {async open() {return null;}}, localGit: {
            async begin(remember: boolean) {
                fixture.calls.push(['begin', remember]);
                if (fixture.failBegin) {fixture.failBegin = false; throw new Error('GIT_UNAVAILABLE');}
                return {userCode: 'TEST-CODE', verificationUri: 'https://github.com/login/device', expiresAt: Date.now() + 60_000};
            },
            async finish() {fixture.calls.push(['finish']);},
            async authorizeRepository(url: string, write: boolean) {fixture.calls.push(['authorize', url, write]); return session();},
            async getSession() {return session();},
            async disconnect() {
                fixture.calls.push(['disconnect']);
                if (fixture.failDisconnect) throw new Error('GIT_UNAVAILABLE');
            }
        }};
        for (const type of ['dragenter', 'dragover', 'drop']) {
            window.addEventListener(type, async event => {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (type === 'drop') {
                    const item = (event as DragEvent).dataTransfer!.items[0] as DataTransferItem & {
                        getAsFileSystemHandle(): Promise<FileSystemHandle>;
                    };
                    fixture.directory = await item.getAsFileSystemHandle();
                }
            }, {capture: true});
        }
        view.showDirectoryPicker = async () => fixture.directory;
    });
    await installDesktopFixture(page);
    const choose = async (target: Page) => {
        await target.getByText('File', {exact: true}).click();
        await expect(target.getByRole('button', {name: 'GitHub Connection Settings…', exact: true})).toHaveCount(0);
        await target.getByRole('button', {name: 'Choose Repository…', exact: true}).click();
    };
    const showSettings = async (target: Page) => {
        await target.getByRole('button', {name: 'Connect to GitHub…', exact: true}).click();
        const dialog = target.getByRole('dialog', {name: 'Repository GitHub connection'});
        await expect(dialog).toBeVisible();
        return dialog;
    };
    const showPreferences = async (target: Page) => {
        const label = 'TurboWarp Plus project information';
        await target.getByLabel(label, {exact: true}).first().click();
        const nav = target.getByRole('navigation', {name: label});
        const settings = nav.getByRole('button', {name: 'GitHub Connection Settings…'});
        await expect(settings.locator('xpath=following-sibling::*[1]')).toHaveText('AI agent settings…');
        await settings.click();
        return target.getByRole('dialog', {name: 'GitHub connection settings'});
    };
    const close = (dialog: ReturnType<Page['getByRole']>) => dialog.getByRole('button', {name: 'Close', exact: true}).click();
    await page.goto(editor);
    await page.waitForFunction(() => Boolean(window.vm?.runtime.getTargetForStage()), null, {timeout: 45000});
    const preferences = await showPreferences(page);
    const defaultMode = preferences.getByRole('combobox', {name: 'Default connection mode'});
    await expect(defaultMode).toHaveValue('desktop');
    await expect(preferences.getByRole('checkbox')).toHaveCount(0);
    await expect(preferences.getByRole('button', {name: 'Connect to GitHub'})).toHaveCount(0);
    await defaultMode.selectOption('cloudflare');
    await close(preferences);
    await expect(page.getByLabel('TurboWarp Plus project information', {exact: true}).first()).toBeFocused();
    await page.reload();
    await expect(await showPreferences(page)).toBeVisible();
    await expect(defaultMode).toHaveValue('cloudflare');
    await defaultMode.selectOption('desktop');
    await close(preferences);
    const cdp = await page.context().newCDPSession(page);
    for (const type of ['dragEnter', 'dragOver', 'drop'] as const) {
        await cdp.send('Input.dispatchDragEvent', {type, x: 100, y: 100,
            data: {items: [], files: [folder], dragOperationsMask: 1}});
    }
    await page.waitForFunction(() => (window as any).gitConnectionFixture.directory?.kind === 'directory');
    await choose(page);
    const panel = await showSettings(page);
    const mode = panel.getByText(/^Connection mode · /);
    await expect(panel.getByText('Repository · owner/project')).toBeVisible();
    await expect(panel.getByRole('combobox', {name: 'Default connection mode'})).toHaveCount(0);
    const status = panel.locator('[data-git-connection-state]');
    const connect = panel.getByRole('button', {name: 'Connect to GitHub'});
    const check = panel.getByRole('button', {name: 'Check connection'});
    await expect(mode).toHaveText('Connection mode · Desktop local');
    await expect(connect).toBeEnabled();
    assert.equal(requests.length, 0);
    await connect.click();
    await expect(panel.getByRole('alert')).toContainText('Retry using the selected connection');
    await expect(mode).toHaveText('Connection mode · Desktop local');
    await connect.click();
    await expect(panel.getByText('TEST-CODE')).toBeVisible();
    await check.click();
    await expect(status).toHaveText('Connected');
    await expect(panel.getByText('Account · desktop-account')).toBeVisible();
    await expect(panel.getByText('http://127.0.0.1:49152')).toBeVisible();
    assert.equal(requests.length, 0);

    await close(panel);
    await showPreferences(page);
    await defaultMode.selectOption('cloudflare');
    await close(preferences);
    await showSettings(page);
    await expect(status).toHaveText('Connected');
    await expect(mode).toHaveText('Connection mode · Desktop local');
    assert.equal(requests.length, 0);
    await page.evaluate(() => {(window as any).gitConnectionFixture.failDisconnect = true;});
    const disconnect = panel.getByRole('button', {name: 'Disconnect', exact: true});
    await disconnect.click();
    await expect(panel.getByRole('alert')).toContainText('Retry using the selected connection');
    await page.evaluate(() => {(window as any).gitConnectionFixture.failDisconnect = false;});
    await disconnect.click();
    await expect(status).toHaveText('Disconnected');
    await expect(mode).toHaveText('Connection mode · Cloudflare');
    assert.equal(requests.length, 0);
    await connect.click();
    await expect(panel.getByRole('alert')).toContainText('Retry using the selected connection');
    await expect(mode).toHaveText('Connection mode · Cloudflare');
    failCloudflare = false;
    await connect.click();
    await expect(panel.getByRole('link', {name: 'Open GitHub authorization'})).toHaveAttribute('href',
        'https://github.com/login/oauth/authorize?state=' + oauthState);
    await check.click();
    await expect(status).toHaveText('Waiting for GitHub');
    finishCloudflare = true;
    await check.click();
    await expect(status).toHaveText('Connected');
    await expect(panel.getByText('Account · cloud-account')).toBeVisible();
    await disconnect.click();
    await expect(status).toHaveText('Disconnected');
    await close(panel);
    await showPreferences(page);
    await defaultMode.selectOption('desktop');
    await close(preferences);

    assert.deepEqual(await page.evaluate(() => (window as any).gitConnectionFixture.calls), [
        ['begin', false], ['disconnect'], ['begin', false], ['finish'], ['authorize', remote, false], ['disconnect'], ['disconnect']
    ]);
    assert.deepEqual(requests.map(({method, url, authorization, body}) => [method, url, authorization, body]), [
        ...Array.from({length: 2}, () => ['POST', '/v1/git-auth/start', undefined, {remote, write: false}]),
        ...['GET', 'GET', 'DELETE'].map(method => [method, '/v1/git-auth/session', 'Bearer ' + ticket, null])
    ]);
    assert.deepEqual(await Promise.all(files.map(file => readFile(file))), before);
    assert.deepEqual(failures, []);

    const desktop = await context.newPage();
    await installDesktopFixture(desktop);
    await desktop.goto(editor + '&desktopAuthFixture=1');
    await desktop.waitForFunction(() => Boolean(window.vm?.runtime.getTargetForStage()), null, {timeout: 45000});
    const desktopCDP = await context.newCDPSession(desktop);
    for (const type of ['dragEnter', 'dragOver', 'drop'] as const) {
        await desktopCDP.send('Input.dispatchDragEvent', {type, x: 100, y: 100,
            data: {items: [], files: [folder], dragOperationsMask: 1}});
    }
    await desktop.waitForFunction(() => (window as any).gitConnectionFixture.directory?.kind === 'directory');
    await choose(desktop);
    const desktopPanel = await showSettings(desktop);
    const auth = desktopPanel.getByRole('combobox', {name: 'Authentication method'});
    const desktopStatus = desktopPanel.locator('[data-git-connection-state]');
    const desktopConnect = desktopPanel.getByRole('button', {name: 'Connect to GitHub'});
    await expect(auth.locator('option')).toHaveCount(2);
    await expect(auth.locator('option[value="github-app"]')).toHaveCount(0);
    await auth.selectOption('git-credential-helper');
    await expect(desktopConnect).toBeDisabled();
    await desktopPanel.getByRole('textbox', {name: 'GitHub account name'}).fill('desktop-account');
    await desktopConnect.click();
    await expect(desktopStatus).toHaveText('Disconnected');
    await expect(desktopConnect).toBeEnabled();
    await auth.selectOption('fine-grained-pat');
    await expect(desktopPanel.locator('input[type="password"]')).toHaveCount(0);
    await desktopPanel.getByRole('checkbox', {name: 'Save the token on this device'}).check();
    await desktopPanel.locator('[data-git-allow-review]').check();
    await desktopConnect.click();
    await expect(desktopPanel.getByRole('alert')).toContainText('Retry using the selected connection');
    await expect(desktopStatus).toHaveText('Disconnected');
    await expect(desktopPanel.getByRole('button', {name: 'Update remote refs (fetch)'})).toHaveCount(0);
    await desktopConnect.click();
    await expect(desktopStatus).toHaveText('Connected');
    await desktop.evaluate(() => {(window as any).gitConnectionFixture.helperAvailable = false;});
    await desktopPanel.getByRole('button', {name: 'Close', exact: true}).click();
    await choose(desktop);
    await showSettings(desktop);
    await expect(desktopStatus).toHaveText('Disconnected');
    await expect(auth.locator('option')).toHaveCount(1);
    assert.deepEqual(await desktop.evaluate(() => (window as any).gitConnectionFixture.calls), [
        ['helper', remote, 'desktop-account'], ['pat', remote, true], ['disconnect'], ['pat', remote, true],
        ['authorize', remote, false, true], ['disconnect']
    ]);
    assert.deepEqual(await Promise.all(files.map(file => readFile(file))), before);

    const web = await page.context().newPage();
    await web.goto(editor);
    await web.waitForFunction(() => Boolean(window.vm?.runtime.getTargetForStage()), null, {timeout: 45000});
    const webPanel = await showPreferences(web);
    await expect(webPanel.getByRole('combobox').locator('option[value="cloudflare"]')).toHaveCount(1);
    await expect(webPanel.getByRole('combobox').locator('option[value="desktop"]')).toHaveCount(0);
    const unsupported = await context.newPage();
    await unsupported.addInitScript(() => Object.defineProperty(window, 'showDirectoryPicker', {value: undefined}));
    await unsupported.goto(editor);
    await unsupported.waitForFunction(() => Boolean(window.vm?.runtime.getTargetForStage()), null, {timeout: 45000});
    await unsupported.getByText('File', {exact: true}).click();
    await expect(unsupported.getByText('Choose Repository…', {exact: true})).toHaveCount(0);
    await expect(unsupported.locator('.twgit-branch-button')).toHaveCount(0);
    await expect(await showPreferences(unsupported)).toBeVisible();
    await unsupported.goto(editor + '&twPlusLocalGit=0');
    await unsupported.getByLabel('TurboWarp Plus project information', {exact: true}).first().click();
    await expect(unsupported.getByRole('button', {name: 'GitHub Connection Settings…'})).toHaveCount(0);
    assert.equal(requests.length, 5);
});
