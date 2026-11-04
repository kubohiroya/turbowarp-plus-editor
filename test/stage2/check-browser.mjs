import assert from 'node:assert/strict';
import {spawn, execFile} from 'node:child_process';
import {EventEmitter, once} from 'node:events';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {setTimeout as sleep} from 'node:timers/promises';
import {promisify} from 'node:util';
import {chromium} from 'playwright';

const desktop = process.env.TW151_DESKTOP_APP;
const executable = desktop ? join(desktop, 'Contents/MacOS/TurboWarp') :
    process.env.TW151_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const output = resolve(process.env.TW151_STAGE2_BUILD || '/private/tmp/tw151-stage2/build');
const origin = 'http://localhost:15100';
const report = {host: desktop ? 'Packaged Desktop stage 2 fixture' : 'Chrome stage 2 fixture', checks: [], errors: []};
const profile = await mkdtemp(join(tmpdir(), 'tw151-stage2-'));
await writeFile(join(profile, 'tw_config.json'), JSON.stringify({v2: {updateChecker: 'never'}}));
const processArgs = [`--user-data-dir=${profile}`, '--remote-debugging-port=0', '--no-first-run',
    '--use-mock-keychain', '--password-store=basic'];
if (!desktop) processArgs.push('--disable-popup-blocking', 'about:blank');
const child = spawn(executable, processArgs, {
    env: {...process.env, TW155_DESKTOP_POPOUT: '1', TW155_DESKTOP_TEST_CONTROL: '1'},
    stdio: ['pipe', 'pipe', 'pipe']
});
const stopped = once(child, 'close');
const events = new EventEmitter();
createInterface({input: child.stdout}).on('line', line => {
    if (line.startsWith('TW155_CONTROL ')) {
        const response = JSON.parse(line.slice('TW155_CONTROL '.length));
        events.emit(String(response.id), response);
    }
});
let log = '';
child.stderr.on('data', data => {log = (log + data).slice(-16000);});
let id = 0;
async function desktopRequest(request) {
    const current = ++id;
    const reply = once(events, String(current), {signal: AbortSignal.timeout(6000)});
    child.stdin.write(JSON.stringify({id: current, ...request}) + '\n');
    const [response] = await reply;
    if (response.error) throw new Error(response.error);
    return request.native ? response.value : response.found;
}
let browser;
async function until(get) {
    for (let attempt = 0; attempt < 100; attempt++) {
        const value = await get();
        if (value) return value;
        await sleep(100);
    }
    throw new Error('Window or state not ready');
}
const observe = page => page.on('pageerror', error => report.errors.push(error.message));

async function arrangement(context, parent, popup) {
    if (desktop) {
        const snapshot = () => desktopRequest({native: 'snapshot'});
        const windows = await snapshot();
        const editor = windows.find(window => window.kind === 'editor');
        const surface = windows.find(window => window.kind === 'code');
        await desktopRequest({native: 'mark-a', windowId: surface.id});
        for (const window of [editor, surface]) await desktopRequest({native: 'layout', windowId: window.id});
        return async page => (await snapshot()).find(window =>
            window.id === (page === parent ? editor.id : surface.id)).content;
    }
    const session = await browser.newBrowserCDPSession();
    const area = await parent.evaluate(() => ({
        x: screen.availLeft, y: screen.availTop, width: screen.availWidth, height: screen.availHeight
    }));
    for (const [page, fraction] of [[parent, 0.02], [popup, 0.55]]) {
        const target = await context.newCDPSession(page);
        const {targetInfo} = await target.send('Target.getTargetInfo');
        await target.detach();
        const {windowId} = await session.send('Browser.getWindowForTarget', {targetId: targetInfo.targetId});
        await session.send('Browser.setWindowBounds', {windowId, bounds: {
            left: area.x + Math.round(area.width * fraction), top: area.y + 45,
            width: Math.round(area.width * 0.4), height: Math.round(area.height * 0.55)
        }});
    }
    await session.detach();
    return page => page.evaluate(() => ({
        x: screenX + (outerWidth - innerWidth) / 2,
        y: screenY + outerHeight - innerHeight
    }));
}

async function nativeDrag(bounds, from, source, to, destination) {
    if (desktop) assert.equal(await desktopRequest({url: from.url()}), true);
    else await from.bringToFront();
    await until(() => from.evaluate(() => document.hasFocus()));
    await sleep(250);
    const [a, b, first, last] = await Promise.all([
        bounds(from), bounds(to), from.locator(source).boundingBox(), to.locator(destination).boundingBox()
    ]);
    const coordinates = [a.x + first.x + first.width / 2, a.y + first.y + first.height / 2,
        b.x + last.x + last.width / 2, b.y + last.y + last.height / 2];
    const button = from.locator(source);
    const target = to.locator(destination);
    await button.evaluate(element => {
        element.addEventListener('dragstart', event => {
            if (event.isTrusted) element.dataset.nativeDrag = 'started';
        });
    });
    await target.evaluate(element => {
        delete element.dataset.nativeDrop;
        element.addEventListener('drop', event => {
            if (event.isTrusted) element.dataset.nativeDrop = 'received';
        }, {once: true});
    });
    // Retry only a missing OS input. The caller still asserts the result of every delivered drop.
    for (let attempt = 0; attempt < 3; attempt++) {
        await button.evaluate(element => {element.dataset.nativeDrag = 'pending';});
        await promisify(execFile)('python3', [join(import.meta.dirname, 'native-mouse.py'), ...coordinates.map(String)]);
        if (await target.getAttribute('data-native-drop') === 'received') {
            assert.equal(await button.getAttribute('data-native-drag'), 'started');
            return coordinates;
        }
        await sleep(300);
    }
    throw new Error(`The OS did not deliver a drop at ${coordinates.slice(2).join(', ')}`);
}

try {
    const endpoint = await until(() => log.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1]);
    browser = await chromium.connectOverCDP(endpoint, {noDefaults: true});
    const context = browser.contexts()[0];
    context.setDefaultTimeout(9000);
    if (!desktop) {
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            const file = url.pathname.slice(1);
            if (url.origin !== origin || !['editor.html', 'editor.js', 'child.js', 'code-popout.html'].includes(file)) {
                return route.abort();
            }
            return route.fulfill({path: join(output, file)});
        });
    }
    const parent = desktop ?
        await until(() => context.pages().find(page => page.url().includes('/gui/gui.html?tw155-shared'))) :
        await context.newPage();
    observe(parent);
    if (!desktop) await parent.goto(origin + '/editor.html');
    report.browser = await parent.evaluate(() => navigator.userAgent);
    if (desktop) assert.equal(await parent.evaluate(() => typeof globalThis.EditorPreload?.getInitialFile), 'function');
    const docked = () => parent.locator('#dock #panel').count();
    const state = expected => parent.waitForFunction(value =>
        document.querySelector('#surface-state')?.textContent === value, expected, {polling: 50});
    const undock = async () => {
        const [popup] = await Promise.all([parent.waitForEvent('popup'), parent.locator('#undock').click()]);
        observe(popup);
        return popup;
    };
    await parent.locator('#open-mode').selectOption('blocked');
    await parent.locator('#undock').click();
    await state('docked:blocked');
    assert.equal(await docked(), 1);
    await parent.locator('#open-mode').selectOption('failed');
    const failed = await undock();
    assert.equal(await docked(), 1);
    await state('docked:failed');
    await until(() => failed.isClosed());
    assert.equal(await docked(), 1);
    report.checks.push('Blocked and failed initialization retain the docked panel');

    await parent.locator('#open-mode').selectOption('normal');
    let popup = await undock();
    await state('external');
    assert.equal(await docked(), 0);
    assert.equal(await popup.locator('#mount #panel').count(), 1);
    const bounds = await arrangement(context, parent, popup);
    const first = await nativeDrag(bounds, parent, '#editor-source', popup, '#panel-drop');
    report.firstDrag = first;
    const awaitCopy = (editor, panel) => parent.waitForFunction(({editor, panel}) => {
        const output = document.querySelector('#copies');
        const count = JSON.parse(output.textContent);
        return output.dataset.result === 'applied' && count.editor === editor && count.panel === panel;
    }, {editor, panel}, {polling: 50});
    await awaitCopy(0, 1);
    assert.equal(await parent.locator('#copies').getAttribute('data-trusted'), 'true');
    assert.equal(await parent.locator('#copies').getAttribute('data-document'), new URL(popup.url()).pathname);
    assert.equal(JSON.parse(await parent.locator('#copies').textContent()).last, 'Editor fixture');
    const second = await nativeDrag(bounds, popup, '#panel-source', parent, '#editor-drop');
    await awaitCopy(1, 1);
    assert.equal(await parent.locator('#copies').getAttribute('data-trusted'), 'true');
    assert.equal(await parent.locator('#copies').getAttribute('data-document'), new URL(parent.url()).pathname);
    assert.equal(JSON.parse(await parent.locator('#copies').textContent()).last, 'Panel fixture');
    report.checks.push({name: 'Native macOS HID drag copied once each way across two windows', first, second});

    await popup.locator('#dock-button').click();
    await state('docked:returned');
    await until(() => popup.isClosed());
    assert.equal(await docked(), 1);
    popup = await undock();
    await state('external');
    await popup.reload({waitUntil: 'commit'}).catch(() => {});
    await state('docked:disconnected');
    assert.equal(await docked(), 1);
    await until(() => popup.isClosed());
    popup = await undock();
    await state('external');
    await popup.close({runBeforeUnload: true});
    await state('docked:disconnected');
    assert.equal(await docked(), 1);
    await until(() => popup.isClosed());
    popup = await undock();
    await state('external');
    await parent.reload();
    await state('docked');
    await until(() => popup.isClosed());
    assert.equal(await docked(), 1);
    report.checks.push('Return, child reload/close and parent reload leave one docked panel');
    assert.deepEqual(report.errors, []);
} catch (error) {
    report.failure = String(error);
    report.stderr = log;
    if (desktop) report.windows = await desktopRequest({native: 'snapshot'}).catch(() => []);
    if (browser) {
        report.pages = await Promise.all(browser.contexts()[0].pages().map(page => page.evaluate(() => ({
            url: location.href, focused: document.hasFocus(), state: document.querySelector('#surface-state')?.textContent,
            copies: document.querySelector('#copies')?.outerHTML
        })).catch(() => null)));
    }
    console.error(error.stack);
    process.exitCode = 1;
} finally {
    console.log(JSON.stringify(report, null, 2));
    if (child.exitCode === null && child.signalCode === null) {
        if (desktop) child.stdin.end('{"quit":true}\n');
        else child.kill();
        if (!await Promise.race([stopped.then(() => true), sleep(4000, false, {ref: false})])) child.kill('SIGKILL');
    }
    await stopped;
    if (browser) await browser.close();
    await rm(profile, {recursive: true, force: true});
}
