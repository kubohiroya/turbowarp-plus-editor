import assert from 'node:assert/strict';
import {execFile, spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {setTimeout as delay} from 'node:timers/promises';
import {promisify} from 'node:util';
import {chromium} from 'playwright';

const app = resolve(process.argv[2] || '/private/tmp/tw151-desktop23/TurboWarp-Plus-Backpack.app');
const mime = 'application/x-turbowarp-editor-transfer';
const itemName = 'Desktop native Backpack stack';
const modeLabel = /^(Flexible layout mode|自由配置モード)$/;
const undockLabel = /^(Open Backpack in a separate window|バックパックを別ウィンドウで開く)$/;
const dockLabel = /^(Dock Backpack|バックパックを元の位置に戻す)$/;
const report = {checks: [], errors: []};
const launcher = promisify(execFile);
const mousePath = join(import.meta.dirname, '../stage2/native-mouse.py');

async function until (read, description) {
    for (let attempt = 0; attempt < 150; attempt++) {
        const value = await read();
        if (value) return value;
        await delay(100);
    }
    throw new Error(`Timed out: ${description}`);
}

async function run (enabled, test) {
    const profile = await mkdtemp(join(tmpdir(), 'tw-plus-desktop-stage3-'));
    await writeFile(join(profile, 'tw_config.json'), JSON.stringify({v2: {updateChecker: 'never', locale: 'en'}}));
    const processArgs = [`--user-data-dir=${profile}`, '--remote-debugging-port=0'];
    const processEnv = {...process.env, TW_PLUS_DESKTOP_TEST_CONTROL: '1'};
    delete processEnv.TW_PLUS_DESKTOP_WINDOW_LAYOUT;
    delete processEnv.TW_PLUS_DESKTOP_BACKPACK_POPOUT;
    delete processEnv.TW_PLUS_DESKTOP_INTERNAL_WINDOWS;
    delete processEnv.TW_PLUS_DESKTOP_SPRITE_PROPERTIES;
    delete processEnv.TW_PLUS_DESKTOP_STAGE_PANEL;
    if (enabled) {
        processEnv.TW_PLUS_DESKTOP_WINDOW_LAYOUT = '1';
        if (enabled === 'internal' || enabled === 'sprite' || enabled === 'stage') processEnv.TW_PLUS_DESKTOP_INTERNAL_WINDOWS = '1';
        else processEnv.TW_PLUS_DESKTOP_BACKPACK_POPOUT = '1';
        if (enabled === 'sprite') processEnv.TW_PLUS_DESKTOP_SPRITE_PROPERTIES = '1';
        if (enabled === 'stage') processEnv.TW_PLUS_DESKTOP_STAGE_PANEL = '1';
    }
    const application = spawn(join(app, 'Contents/MacOS/TurboWarp'), processArgs, {env: processEnv});
    const stopped = once(application, 'close');
    const replies = new Map();
    let stderr = '';
    let id = 0;
    let browser;
    let editor;
    let context;
    application.stderr.on('data', data => {stderr = (stderr + data).slice(-16000);});
    createInterface({input: application.stdout}).on('line', line => {
        if (!line.startsWith('TWPLUS_DESKTOP ')) return;
        const reply = JSON.parse(line.slice('TWPLUS_DESKTOP '.length));
        replies.set(reply.id, reply);
    });
    async function control (operation, windowId) {
        const current = ++id;
        application.stdin.write(`${JSON.stringify({id: current, operation, windowId})}\n`);
        const reply = await until(() => replies.get(current), operation);
        replies.delete(current);
        if (reply.error) throw new Error(reply.error);
        return reply.result;
    }
    try {
        const endpoint = await until(() => stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1], 'CDP endpoint');
        browser = await chromium.connectOverCDP(endpoint, {noDefaults: true});
        report.chromium = browser.version();
        context = browser.contexts()[0];
        context.setDefaultTimeout(10000);
        editor = await until(() => context.pages().find(page => page.url().startsWith('tw-editor://./gui/gui.html')),
            'official Desktop editor');
        report.electron = await editor.evaluate(() => navigator.userAgent.match(/Electron\/([\d.]+)/)?.[1]);
        editor.on('pageerror', error => report.errors.push(error.message));
        await editor.waitForFunction(() => window.vm?.editingTarget?.isOriginal &&
            window.ScratchBlocks?.getMainWorkspace());
        assert.equal(await editor.evaluate(() => typeof EditorPreload.getInitialFile), 'function');
        await test({editor, context, control});
    } catch (error) {
        report.diagnostics = {stderr, urls: context?.pages().map(page => page.url())};
        report.diagnostics.editor = await editor?.evaluate(() => ({
            url: location.href, text: document.body.innerText.slice(-1000), events: window.nativeEvidence,
            focus: document.hasFocus(), ready: !!window.vm?.editingTarget
        })).catch(() => null);
        throw error;
    } finally {
        if (application.exitCode === null && application.signalCode === null) {
            application.stdin.write(JSON.stringify({id: ++id, operation: 'quit'}) + '\n');
            if (!await Promise.race([stopped.then(() => true), delay(3000, false, {ref: false})])) {
                application.kill('SIGKILL');
                await stopped;
            }
        }
        await rm(profile, {recursive: true, force: true});
    }
}

async function screenPoint (control, kind, locator, horizontal = 0.5) {
    const window = (await control('windows')).find(window => window.kind === kind);
    assert.ok(window, `Missing native ${kind} bounds`);
    const box = await locator.boundingBox();
    assert.ok(box, `Missing visible ${kind} control`);
    return [
        window.content.x + (box.x + horizontal * box.width) * window.zoom,
        window.content.y + (box.y + box.height / 2) * window.zoom
    ];
}

async function click (control, kind, locator) {
    const point = await screenPoint(control, kind, locator);
    await launcher('python3', [mousePath, '--click', ...point.map(String)]);
}

async function observeNative (page) {
    await page.evaluate(() => {
        window.nativeEvidence = [];
        for (const type of ['click', 'dragstart', 'drop']) document.addEventListener(type, event => {
            window.nativeEvidence.push({
                type, trusted: event.isTrusted, mime: Array.from(event.dataTransfer?.types || []),
                label: event.target.closest?.('button')?.getAttribute('aria-label') ||
                    event.target.textContent?.trim().slice(0, 80)
            });
        }, true);
    });
}

async function seedBackpack (page) {
    return page.evaluate(async name => {
        const vm = window.vm;
        const target = vm.editingTarget;
        await vm.duplicateSprite(target.id);
        const other = vm.runtime.targets.find(sprite => sprite.isOriginal && !sprite.isStage && sprite !== target);
        vm.setEditingTarget(target.id);
        const block = (id, opcode, parent, next) => ({id, opcode, parent, next,
            topLevel: parent === null, shadow: false, fields: {}, inputs: {}, x: 30, y: 30});
        const stack = [block('desktop-hide', 'looks_hide', null, 'desktop-show'),
            block('desktop-show', 'looks_show', 'desktop-hide', null)];
        const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('TW_Backpack', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('backpack',
                {keyPath: 'id', autoIncrement: true});
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        try {
            await new Promise((resolve, reject) => {
                const transaction = db.transaction('backpack', 'readwrite');
                transaction.objectStore('backpack').add({
                    type: 'script', mime: 'application/json', name,
                    bodyData: new TextEncoder().encode(JSON.stringify(vm.exportStandaloneBlocks(stack))).buffer,
                    thumbnailData: Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
                        character => character.charCodeAt(0)).buffer
                });
                transaction.oncomplete = resolve;
                transaction.onerror = () => reject(transaction.error);
            });
        } finally {
            db.close();
        }
        return {a: target.id, b: other.id};
    }, itemName);
}

async function checkInternal ({editor, control}) {
    const parent = (await control('windows')).find(window => window.kind === 'editor');
    await control('layout', parent.id);
    await control('focus', parent.id);
    await until(() => editor.evaluate(() => document.hasFocus()), 'native editor focus');
    const mode = editor.getByRole('button', {name: modeLabel});
    const labels = {
        backpack: /^(Backpack|バックパック)$/,
        code: /^(Code|コード)$/,
        costumes: /^(Costumes|コスチューム)$/,
        sounds: /^(Sounds|音)$/,
        action: /^(Open in another window|別画面で開く)$/,
        dock: /^(Close and dock|閉じる（ドックに戻す）)$/
    };
    const launch = editor.getByRole('button', {name: /^(Undock Backpack|バックパックを別画面で開く)$/});
    const backpack = editor.getByRole('region', {name: labels.backpack});
    const open = editor.getByRole('button', {name: labels.action});
    const fullScreen = editor.getByRole('button', {name: /^(Full-screen editor|エディター全体を全画面表示)$/});
    await fullScreen.waitFor();
    const search = editor.getByRole('searchbox');
    const tabs = editor.getByRole('tablist');
    assert.equal(await launch.count(), 0);
    assert.equal(await open.count(), 0);
    await seedBackpack(editor);
    await observeNative(editor);
    await click(control, 'editor', mode);
    if (await mode.getAttribute('aria-pressed') !== 'true') {
        await control('focus', parent.id);
        await click(control, 'editor', mode);
    }
    await launch.waitFor();
    await click(control, 'editor', editor.locator('[class*="backpack_backpack-header"]'));
    await editor.getByText(itemName, {exact: true}).waitFor();
    await click(control, 'editor', launch);
    await backpack.getByText(itemName, {exact: true}).waitFor();
    assert.equal(await editor.getByText(itemName, {exact: true}).count(), 1);
    assert.equal((await control('windows')).length, 1);
    assert.equal(await backpack.getByRole('button', {name: 'Move to browser window'}).count(), 0);
    const workArea = editor.locator('.tw-window-desktop');
    const normal = await workArea.boundingBox();
    await fullScreen.click();
    await editor.waitForFunction(() => document.fullscreenElement === document.documentElement);
    await until(async () => (await control('windows')).some(window => window.id === parent.id && window.fullScreen),
        'native BrowserWindow fullscreen');
    await fullScreen.and(editor.locator('[aria-pressed="true"]')).waitFor();
    await until(async () => (await workArea.boundingBox()).width > normal.width, 'fullscreen work area grows');
    await editor.locator('[class*="menu-bar_menu-bar_"]').first().waitFor();
    await backpack.getByText(itemName, {exact: true}).waitFor();
    const start = await backpack.boundingBox();
    const handle = await backpack.locator('.tw-desktop-window__handle').boundingBox();
    const pointer = {x: handle.x + 40, y: handle.y + 12};
    const distance = normal.x + normal.width - (start.x + start.width) + 100;
    await editor.mouse.move(pointer.x, pointer.y);
    await editor.mouse.down();
    await editor.mouse.move(pointer.x + distance, pointer.y, {steps: 8});
    await editor.mouse.up();
    await until(async () => {
        const box = await backpack.boundingBox();
        return box.x + box.width > normal.x + normal.width;
    }, 'Backpack is placed outside the future normal-size bounds');
    await fullScreen.click();
    await editor.waitForFunction(() => !document.fullscreenElement);
    await until(async () => (await control('windows')).some(window => window.id === parent.id && !window.fullScreen),
        'native BrowserWindow exits fullscreen');
    await fullScreen.and(editor.locator('[aria-pressed="false"]')).waitFor();
    await until(async () => {
        const [area, box] = await Promise.all([workArea.boundingBox(), backpack.boundingBox()]);
        return area.width <= normal.width && box.x + box.width <= area.x + area.width + 0.5;
    }, 'Backpack fits the normal-size work area after resize');
    await until(() => editor.evaluate(() => document.hasFocus()), 'native editor focus after fullscreen');
    await click(control, 'editor', backpack.getByRole('button', {name: labels.dock}));
    report.checks.push('Full-screen editor includes the menu and live Backpack and returns from native BrowserWindow fullscreen');
    await editor.getByText(itemName, {exact: true}).waitFor();
    assert.equal(await backpack.count(), 0);
    await until(() => launch.evaluate(button => button === document.activeElement), 'Backpack launch focus after dock');
    report.checks.push('Native clicks undock the actual Backpack in the Editor and restore it, with no child BrowserWindow');

    for (const [label, content] of [
        [labels.code, '.blocklySvg'],
        [labels.costumes, '[class*="asset-panel_wrapper"]'],
        [labels.sounds, '[class*="asset-panel_wrapper"]']
    ]) {
        const tab = editor.getByRole('tab', {name: label});
        await tab.click();
        assert.equal(await tab.getAttribute('aria-selected'), 'true');
        assert.equal(await open.count(), 1);
        await search.waitFor();
        const [buttonBox, searchBox, tabsBox] = await Promise.all([open.boundingBox(), search.boundingBox(),
            tabs.boundingBox()]);
        assert.ok(buttonBox.x >= searchBox.x + searchBox.width);
        assert.ok(buttonBox.y < tabsBox.y + tabsBox.height && searchBox.y < buttonBox.y + buttonBox.height);
        await editor.getByRole('tabpanel').locator(content).first().evaluate(node => {window.savedPanelNode = node;});
        await open.click();
        const frame = editor.getByRole('region', {name: label});
        const moved = frame.locator(content).first();
        await moved.waitFor();
        assert.ok(await moved.evaluate(node => node === window.savedPanelNode));
        assert.equal(await open.isDisabled(), true);
        await frame.getByRole('button', {name: labels.dock}).click();
        await frame.waitFor({state: 'hidden'});
        assert.ok(await open.evaluate(button => button === document.activeElement));
        assert.ok(await editor.getByRole('tabpanel').locator(content).first().evaluate(node =>
            node === window.savedPanelNode));
    }

    const costumeTab = editor.getByRole('tab', {name: labels.costumes});
    await costumeTab.click();
    await open.click();
    await editor.getByRole('region', {name: labels.costumes}).waitFor();
    await editor.getByRole('tab', {name: labels.sounds}).click();
    await editor.getByRole('region', {name: labels.costumes}).waitFor();
    await open.click();
    await editor.getByRole('region', {name: labels.sounds}).waitFor();
    await mode.click();
    assert.equal(await editor.getByRole('region', {name: labels.sounds}).count(), 0);
    assert.equal(await editor.getByRole('region', {name: labels.costumes}).count(), 0);
    assert.equal(await open.count(), 0);
    assert.ok(await editor.evaluate(pattern => window.nativeEvidence.filter(event =>
        event.type === 'click' && event.trusted && pattern.test(event.label)).length === 5, labels.action));
    report.checks.push('The shared action is to the right of the find bar and moves each active live panel, keeps it open across tab changes, and docks on close or mode exit');
}

const spritePropertiesLabel = /^(Sprite properties|スプライトのプロパティ)$/;

async function checkSpriteProperties ({editor, control}) {
    const panel = editor.getByRole('region', {name: spritePropertiesLabel});
    const x = panel.getByRole('spinbutton', {name: 'x', exact: true});
    const heading = editor.getByRole('heading', {name: /^(Sprite|スプライト)$/});
    const action = heading.locator('..').getByRole('button', {name: /^(Open in another window|別画面で開く)$/});
    const floating = editor.getByRole('region', {name: /^(Sprite|スプライト)$/});
    await panel.waitFor();
    assert.equal(await action.count(), 0);
    await editor.getByRole('button', {name: modeLabel}).click();
    await x.evaluate(node => {window.stage5SpriteX = node;});
    await action.click();
    await floating.getByRole('region', {name: spritePropertiesLabel}).waitFor();
    assert.equal(await control('windows').then(windows => windows.length), 1);
    assert.ok(await x.evaluate(node => node === window.stage5SpriteX));
    await x.fill('52');
    await x.press('Enter');
    await editor.waitForFunction(() => window.vm.editingTarget.x === 52);
    await floating.getByRole('button', {name: /^(Close and dock|閉じる（ドックに戻す）)$/}).click();
    await floating.waitFor({state: 'hidden'});
    assert.equal(await x.inputValue(), '52');
    assert.ok(await x.evaluate(node => node === window.stage5SpriteX));
    report.checks.push('The licensed sprite properties form uses the same live VM in the dock and in-app on Desktop');
}

async function checkStagePanel ({editor, control}) {
    const canvas = editor.locator('[data-gui-stage] canvas').first();
    const frame = editor.getByRole('region', {name: /^(Stage|ステージ)$/});
    const action = editor.locator('[class*="basic-panel-overlay-action_"]').getByRole('button', {
        name: /^(Open in another window|別画面で開く)$/
    });
    await editor.getByRole('button', {name: modeLabel}).click();
    await canvas.evaluate(node => {window.stage5DesktopCanvas = node;});
    await action.focus();
    await editor.keyboard.press('Enter');
    await frame.locator('[data-gui-stage] canvas').waitFor();
    assert.equal((await control('windows')).length, 1);
    assert.ok(await canvas.evaluate(node => node === window.stage5DesktopCanvas && node === window.vm.renderer.canvas));
    await frame.getByRole('button', {name: /^(Close and dock|閉じる（ドックに戻す）)$/}).click();
    await frame.waitFor({state: 'hidden'});
    assert.ok(await canvas.evaluate(node => node === window.stage5DesktopCanvas));
    report.checks.push('Desktop retains the live stage canvas when moving between the dock and the in-app window');
}

try {
    await run(false, async ({editor, control}) => {
        assert.equal(await editor.getByRole('button', {name: modeLabel}).count(), 0);
        assert.equal(await editor.getByRole('button', {name: undockLabel}).count(), 0);
        assert.equal(await editor.getByRole('region', {name: spritePropertiesLabel}).count(), 0);
        assert.equal(await editor.evaluate(() =>
            window.open('about:blank', `tw-plus-backpack-${crypto.randomUUID()}`) === null), true);
        assert.equal((await control('windows')).length, 1);
        report.checks.push('Desktop startup defaults OFF and denies the reserved native window');
    });

    if (process.argv.includes('--sprite-properties')) await run('sprite', checkSpriteProperties);
    else if (process.argv.includes('--stage-panel')) await run('stage', checkStagePanel);
    else if (process.argv.includes('--internal')) await run('internal', checkInternal);
    else await run(true, async ({editor, context, control}) => {
        const parent = (await control('windows')).find(window => window.kind === 'editor');
        await control('layout', parent.id);
        await control('focus', parent.id);
        await until(() => editor.evaluate(() => document.hasFocus()), 'native editor focus');
        const mode = editor.getByRole('button', {name: modeLabel});
        const undock = editor.getByRole('button', {name: undockLabel});
        const header = editor.locator('[class*="backpack_backpack-header"]');
        assert.equal(await undock.count(), 0);
        const ids = await seedBackpack(editor);
        await observeNative(editor);
        await click(control, 'editor', mode);
        await undock.waitFor();
        assert.equal(await mode.getAttribute('aria-pressed'), 'true');
        await click(control, 'editor', header);
        await editor.getByText(itemName, {exact: true}).waitFor();

        const denied = await editor.evaluate(() => [
            window.open('about:blank', 'tw-plus-backpack-invalid') === null,
            window.open('/gui/backpack-popout.html', `tw-plus-backpack-${crypto.randomUUID()}`) === null
        ]);
        assert.deepEqual(denied, [true, true]);
        await click(control, 'editor', undock);
        const child = await until(() => context.pages().find(page =>
            page.url().startsWith('tw-editor://./gui/backpack-popout.html#')), 'native Backpack child');
        child.on('pageerror', error => report.errors.push(error.message));
        await child.getByText(itemName, {exact: true}).waitFor();
        assert.equal(await editor.getByText(itemName, {exact: true}).count(), 0);
        assert.equal(await editor.evaluate(label =>
            window.nativeEvidence.some(event => event.type === 'click' && event.trusted && label.test(event.label)),
        undockLabel), true);
        const childWindow = (await control('windows')).find(window => window.kind === 'backpack');
        assert.deepEqual(childWindow.preferences,
            {sandbox: true, contextIsolation: true, nodeIntegration: false, preload: false});
        assert.deepEqual(await child.evaluate(() => ({
            opener: window.opener === null,
            preload: typeof window.EditorPreload,
            require: typeof window.require,
            nestedDenied: window.open('about:blank', `tw-plus-backpack-${crypto.randomUUID()}`) === null
        })), {opener: true, preload: 'undefined', require: 'undefined', nestedDenied: true});
        report.checks.push('Native click opens the real Backpack through the locked Desktop child policy');

        await control('layout', childWindow.id);
        await control('focus', childWindow.id);
        await until(() => child.evaluate(() => document.hasFocus()), 'native Backpack focus');
        await observeNative(child);
        await editor.evaluate(() => {
            const original = window.fetch;
            window.fetch = async (url, options) => {
                if (typeof url === 'string' && url.startsWith('data:application/json;base64,')) {
                    await new Promise(resolve => {window.nativeBackpackRead = resolve;});
                    window.fetch = original;
                }
                return original(url, options);
            };
        });
        const source = child.getByTestId('backpack-script-drag');
        const workspace = editor.locator('.blocklySvg').first();
        const points = [
            ...await screenPoint(control, 'backpack', source),
            ...await screenPoint(control, 'editor', workspace, 0.76)
        ];
        report.drag = points;
        await launcher('python3', [mousePath, ...points.map(String)]);
        await editor.waitForFunction(() => typeof window.nativeBackpackRead === 'function');
        const event = (await editor.evaluate(() => window.nativeEvidence)).find(event => event.type === 'drop');
        assert.ok(event?.trusted && event.mime.includes(mime));
        const started = (await child.evaluate(() => window.nativeEvidence)).find(event => event.type === 'dragstart');
        assert.ok(started?.trusted);
        await editor.evaluate(other => {
            window.vm.setEditingTarget(other);
            window.nativeBackpackRead();
        }, ids.b);
        await editor.waitForFunction(id => window.vm.runtime.getTargetById(id).blocks.getScripts().length === 1, ids.a);
        assert.deepEqual(await editor.evaluate(({a, b}) => [a, b].map(id => {
            const blocks = window.vm.runtime.getTargetById(id).blocks;
            return blocks.getScripts().map(root => {
                const block = blocks.getBlock(root);
                return [block.opcode, blocks.getBlock(block.next)?.opcode];
            });
        }), ids), [[['looks_hide', 'looks_show']], []]);
        await editor.evaluate(id => window.vm.setEditingTarget(id), ids.a);
        await editor.waitForFunction(() => window.ScratchBlocks.getMainWorkspace().getTopBlocks()
            .some(block => block.type === 'looks_hide' && block.getNextBlock()?.type === 'looks_show'));
        await child.getByText(itemName, {exact: true}).waitFor();
        report.checks.push('Trusted macOS HID drag copies once to the drop-time sprite and renders in the main editor');

        // Snapshot the native click in the parent document via a test-only, same-origin event listener.
        await child.evaluate(label => {
            const dock = Array.from(document.querySelectorAll('button')).find(button => label.test(button.textContent));
            dock.addEventListener('click', event => localStorage.setItem('tw-stage3-test-dock', String(event.isTrusted)),
                {capture: true, once: true});
        }, dockLabel);
        await control('focus', childWindow.id);
        const dockPoint = await screenPoint(control, 'backpack', child.getByRole('button', {name: dockLabel}));
        const childURL = child.url();
        await child.evaluate(() => window.location.assign('/gui/gui.html'));
        await delay(300);
        assert.equal(await child.evaluate(() => location.href), childURL);
        const closed = child.waitForEvent('close');
        await launcher('python3', [mousePath, '--click', ...dockPoint.map(String)]);
        await closed;
        await editor.getByText(itemName, {exact: true}).waitFor();
        assert.equal(await editor.evaluate(() => localStorage.getItem('tw-stage3-test-dock')), 'true');
        assert.equal((await control('windows')).length, 1);
        assert.deepEqual(await editor.evaluate(async () => {
            const vm = window.vm;
            const sb3 = await vm.saveProjectSb3();
            await vm.loadProject(await sb3.arrayBuffer());
            return vm.runtime.targets.filter(target => target.isOriginal && !target.isStage)
                .map(target => target.blocks.getScripts().length).sort();
        }), [0, 1]);
        report.checks.push('Trusted macOS HID dock click restores the original Backpack; SB3 reload retains the copy');
    });
    assert.deepEqual(report.errors, []);
} catch (error) {
    report.failure = String(error);
    console.error(error.stack);
    process.exitCode = 1;
} finally {
    console.log(JSON.stringify(report, null, 2));
}
