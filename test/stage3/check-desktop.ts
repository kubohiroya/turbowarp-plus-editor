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
import {layoutMenu, readUndockButtonsChecked, toggleUndockButtons} from '../fixtures/layout-menu.ts';

const testMode = [
    '--sprite-properties', '--code-backpack-native', '--code-backpack', '--code-target-sync', '--code-stage', '--code-comments',
    '--code-popout', '--code-scalar-scope', '--code-list-scope', '--code-broadcast', '--code-procedures', '--code-extensions', '--code-dynamic', '--code-dynamic-branches', '--code-custom-fields', '--target-panels-popout',
    '--stage-popout', '--stage-display-menu', '--stage-panel', '--internal', '--plus-layout'
].find(flag => process.argv.includes(flag));
const usesSystemInput = !['--code-backpack', '--code-target-sync', '--code-stage', '--code-comments', '--code-popout',
    '--code-scalar-scope', '--code-list-scope', '--code-broadcast', '--code-procedures', '--code-extensions', '--code-dynamic', '--code-dynamic-branches', '--code-custom-fields', '--stage-display-menu', '--stage-panel', '--plus-layout'].includes(testMode);
if (usesSystemInput && process.env.TW_PLUS_NATIVE_INPUT !== '1') {
    throw new Error('Set TW_PLUS_NATIVE_INPUT=1 to run the macOS system input test.');
}

const app = resolve(process.argv[2] || '/private/tmp/tw151-desktop23/TurboWarp-Plus-Backpack.app');
const mime = 'application/x-turbowarp-editor-transfer';
const itemName = 'Desktop native Backpack stack';
const undockLabel = /^(Open Backpack in a separate window|バックパックを別ウィンドウで開く)$/;
const dockLabel = /^(Dock Backpack|バックパックを元の位置に戻す)$/;
const report: {
    checks: string[];
    errors: string[];
    chromium?: string;
    electron?: string;
    diagnostics?: {stderr: string;
    urls?: string[];
    windows: unknown;
    editor?: unknown};
    drag?: number[];
    monitorEvents?: MonitorEvidence[];
    dockInput?: unknown;
    redock?: unknown;
    failure?: string;
} = {checks: [], errors: []};
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
    const processEnv: NodeJS.ProcessEnv = {...process.env, TW_PLUS_DESKTOP_TEST_CONTROL: '1'};
    delete processEnv.TW_PLUS_DESKTOP_SPLITTER;
    if (testMode === '--plus-layout') delete processEnv.TW_PLUS_DESKTOP_STANDARD_LAYOUT;
    else processEnv.TW_PLUS_DESKTOP_STANDARD_LAYOUT = '0';
    delete processEnv.TW_PLUS_DESKTOP_WINDOW_LAYOUT;
    delete processEnv.TW_PLUS_DESKTOP_BACKPACK_POPOUT;
    delete processEnv.TW_PLUS_DESKTOP_INTERNAL_WINDOWS;
    delete processEnv.TW_PLUS_DESKTOP_SPRITE_PROPERTIES;
    delete processEnv.TW_PLUS_DESKTOP_STAGE_PANEL;
    delete processEnv.TW_PLUS_DESKTOP_STAGE_DISPLAY_MENU;
    delete processEnv.TW_PLUS_DESKTOP_STAGE_POPOUT;
    delete processEnv.TW_PLUS_DESKTOP_TARGET_LIST;
    delete processEnv.TW_PLUS_DESKTOP_TARGET_PANELS_POPOUT;
    delete processEnv.TW_PLUS_DESKTOP_CODE_POPOUT;
    if (enabled) {
        processEnv.TW_PLUS_DESKTOP_WINDOW_LAYOUT = '1';
        if (['internal', 'sprite', 'stage', 'stage-popout', 'stage-display-menu', 'target-panels', 'code-popout', 'code-backpack'].includes(enabled)) processEnv.TW_PLUS_DESKTOP_INTERNAL_WINDOWS = '1';
        else processEnv.TW_PLUS_DESKTOP_BACKPACK_POPOUT = '1';
        if (enabled === 'sprite' || enabled === 'target-panels') processEnv.TW_PLUS_DESKTOP_SPRITE_PROPERTIES = '1';
        if (['stage', 'stage-popout', 'stage-display-menu'].includes(enabled)) processEnv.TW_PLUS_DESKTOP_STAGE_PANEL = '1';
        if (['stage-popout', 'stage-display-menu'].includes(enabled)) processEnv.TW_PLUS_DESKTOP_STAGE_POPOUT = '1';
        if (enabled === 'stage-display-menu') processEnv.TW_PLUS_DESKTOP_STAGE_DISPLAY_MENU = '1';
        if (enabled === 'code-popout' || enabled === 'code-backpack') processEnv.TW_PLUS_DESKTOP_CODE_POPOUT = '1';
        if (enabled === 'code-backpack') processEnv.TW_PLUS_DESKTOP_BACKPACK_POPOUT = '1';
        if (enabled === 'target-panels') {
            processEnv.TW_PLUS_DESKTOP_TARGET_LIST = '1';
            processEnv.TW_PLUS_DESKTOP_TARGET_PANELS_POPOUT = '1';
        }
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
    async function control (operation: string, windowId?: number) {
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
            window.ScratchBlocks?.getMainWorkspace(), undefined, {polling: 100, timeout: 20000});
        assert.equal(await editor.evaluate(() => typeof window.EditorPreload.getInitialFile), 'function');
        await test({editor, context, control});
    } catch (error) {
        report.diagnostics = {stderr, urls: context?.pages().map(page => page.url()),
            windows: await control('windows').catch(() => null)};
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
    const window = (await control('windows')).find(window => window.kind === kind || window.id === kind);
    assert.ok(window, `Missing native ${kind} bounds`);
    const box = await locator.boundingBox();
    assert.ok(box, `Missing visible ${kind} control`);
    return [
        window.content.x + (box.x + horizontal * box.width) * window.zoom,
        window.content.y + (box.y + box.height / 2) * window.zoom
    ];
}

async function click (control, kind, locator, horizontal = 0.5) {
    const point = await screenPoint(control, kind, locator, horizontal);
    await launcher('python3', [mousePath, '--click', ...point.map(String)]);
}

async function observeNative (page) {
    await page.evaluate(() => {
        window.nativeEvidence = [];
        for (const type of ['click', 'dragstart', 'drop']) document.addEventListener(type, event => {
            window.nativeEvidence.push({
                type, trusted: event.isTrusted, mime: Array.from((event as DragEvent).dataTransfer?.types || []),
                label: (event.target as Element).closest?.('button')?.getAttribute('aria-label') ||
                    (event.target as Node).textContent?.trim().slice(0, 80)
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
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
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
    await toggleUndockButtons(editor, button => click(control, 'editor', button));
    if (!await readUndockButtonsChecked(editor)) {
        await control('focus', parent.id);
        await toggleUndockButtons(editor, button => click(control, 'editor', button));
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
    await toggleUndockButtons(editor);
    for (const label of [labels.sounds, labels.costumes]) {
        const frame = editor.getByRole('region', {name: label});
        await frame.waitFor();
        await frame.getByRole('button', {name: labels.dock}).click();
        await frame.waitFor({state: 'hidden'});
    }
    assert.equal(await open.count(), 0);
    assert.ok(await editor.evaluate(pattern => window.nativeEvidence.filter(event =>
        event.type === 'click' && event.trusted && pattern.test(event.label)).length === 5, labels.action));
    report.checks.push('The shared action is to the right of the find bar and moves each active live panel, keeps it open across tab changes, and keeps windows when undock buttons are hidden and docks on close');
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
    await toggleUndockButtons(editor);
    await x.evaluate(node => {window.stage5SpriteX = node;});
    await action.press('Enter');
    await floating.getByRole('region', {name: spritePropertiesLabel}).waitFor();
    assert.equal(await control('windows').then(windows => windows.length), 1);
    assert.ok(await x.evaluate(node => node === window.stage5SpriteX));
    await x.fill('52');
    await x.press('Enter');
    await editor.waitForFunction(() => window.vm.editingTarget.x === 52);
    const parent = (await control('windows')).find(window => window.kind === 'editor');
    await control('focus', parent.id);
    await until(() => editor.evaluate(() => document.hasFocus()), 'native editor focus');
    await click(control, 'editor', floating.getByRole('button', {name: /^(Close and dock|閉じる（ドックに戻す）)$/}));
    await floating.waitFor({state: 'hidden'});
    assert.equal(await x.inputValue(), '52');
    assert.ok(await x.evaluate(node => node === window.stage5SpriteX));
    report.checks.push('The licensed sprite properties form uses the same live VM in the dock and in-app on Desktop');
}

async function checkStagePanel ({editor, control}) {
    const canvas = editor.locator('[data-gui-stage] canvas').first();
    const frame = editor.getByRole('region', {name: /^(Stage|ステージ)$/});
    const action = editor.locator('[class*="stage-action-slot_"]').getByRole('button', {
        name: /^(Open in another window|別画面で開く)$/
    });
    await toggleUndockButtons(editor);
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

async function checkNativeCodeBackpack ({editor, context, control}, a, b, targets, originalId) {
    const parent = (await control('windows')).find(window => window.kind === 'editor');
    const inert = view => view.child.locator('#mount').evaluate(node => node.inert);
    await control('layout', a.id);
    await click(control, b.id, b.child.locator('#status'));
    await until(async () => await inert(a) && !(await inert(b)), 'B is the front code editor');
    await observeNative(a.child);
    await a.child.evaluate(() => {
        const mount = document.getElementById('mount');
        window.everEditable = false;
        new MutationObserver(records => {
            if (!mount.inert || records.some(record => record.oldValue === null)) window.everEditable = true;
        }).observe(mount, {attributes: true, attributeFilter: ['inert'], attributeOldValue: true});
    });

    await control('focus', parent.id);
    await click(control, parent.id, editor.locator('[class*="backpack_backpack-header"]'));
    await editor.getByText(itemName, {exact: true}).waitFor();
    await click(control, parent.id,
        editor.getByRole('button', {name: /^(Undock Backpack|バックパックを別画面で開く)$/}));
    const frame = editor.getByRole('region', {name: /^(Backpack|バックパック)$/});
    const [backpack] = await Promise.all([context.waitForEvent('page'),
        click(control, parent.id, frame.getByRole('button', {name: /^(Move to browser window|別ウィンドウへ移す)$/}))]);
    await backpack.waitForURL(/\/backpack-popout\.html#/);
    backpack.on('pageerror', error => report.errors.push(error.message));
    const source = (await control('windows')).find(window => window.url === backpack.url());
    await observeNative(backpack);
    const handle = backpack.getByTestId('backpack-script-drag');
    const zone = a.child.locator('#drop-zone');
    await handle.waitFor();
    await zone.waitFor();
    const points = [...await screenPoint(control, source.id, handle),
        ...await screenPoint(control, a.id, zone, 0.7)];
    report.drag = points;
    await launcher('python3', [mousePath, ...points.map(String)]);
    const read = () => editor.evaluate(({a, b}) => {
        const blocks = vm.runtime.getTargetById(a).blocks;
        const scripts = blocks.getScripts();
        const copy = scripts.map(id => blocks.getBlock(id))
            .find(block => block.opcode === 'looks_hide' && blocks.getBlock(block.next)?.opcode === 'looks_show');
        return {scripts, copy: copy && [copy.id, copy.next], selected: vm.editingTarget.id,
            other: vm.runtime.getTargetById(b).blocks.getScripts()};
    }, targets);
    const copied = await until(async () => {
        const state = await read();
        return state.copy && state;
    }, 'HID drop copies the Backpack stack to the back code view');
    const drag = (await backpack.evaluate(() => window.nativeEvidence)).find(event => event.type === 'dragstart');
    const drop = (await a.child.evaluate(() => window.nativeEvidence)).find(event => event.type === 'drop');
    assert.ok(drag?.trusted);
    assert.ok(drop?.trusted && drop.mime.includes(mime));
    assert.equal(copied.selected, targets.a);
    assert.deepEqual(copied.other, []);
    assert.deepEqual([...copied.scripts].sort(), [originalId, copied.copy[0]].sort());
    const block = (view, id) => view.child.locator(`[data-id=${JSON.stringify(id)}]`).first();
    for (const view of [a, b]) {
        for (const id of copied.copy) await block(view, id).waitFor();
    }
    assert.equal(await a.child.evaluate(() => window.everEditable), false);
    assert.equal(await inert(a), true);
    assert.equal(await a.child.evaluate(() => document.hasFocus()), false);
    report.checks.push('Trusted macOS HID dragstart and drop copy a whole stack to the back view without granting it editing');

    // The drag source takes focus. Raise B through the native window controller before clicking.
    await until(async () => {
        if (!(await inert(b))) return true;
        await control('focus', b.id);
        return false;
    }, 'B owns the edit lease for shared undo');
    await observeNative(b.child);
    const undo = b.child.getByRole('button', {name: 'Undo', exact: true});
    assert.equal(await undo.isEnabled(), true);
    await click(control, b.id, undo);
    for (const view of [a, b]) {
        for (const id of copied.copy) await block(view, id).waitFor({state: 'detached'});
        await block(view, originalId).waitFor();
    }
    assert.deepEqual(await read(), {scripts: [originalId], copy: undefined, selected: targets.a, other: []});
    const redo = b.child.getByRole('button', {name: 'Redo', exact: true});
    assert.equal(await redo.isEnabled(), true);
    await click(control, b.id, redo);
    for (const view of [a, b]) {
        for (const id of copied.copy) await block(view, id).waitFor();
    }
    assert.deepEqual(await read(), copied);
    assert.equal(await a.child.evaluate(() => window.everEditable), false);
    assert.deepEqual((await b.child.evaluate(() => window.nativeEvidence)).filter(event => event.type === 'click')
        .map(({label, trusted}) => ({label, trusted})), [{label: 'Undo', trusted: true}, {label: 'Redo', trusted: true}]);
    report.checks.push('One native click on Undo and one on Redo in the front view remove and restore the whole copy in both views');

    const dock = backpack.getByRole('button', {name: dockLabel});
    await dock.evaluate(button => button.addEventListener('click',
        event => localStorage.setItem('tw-stage6-native-dock', String(event.isTrusted)), {once: true}));
    await control('focus', source.id);
    const closed = backpack.waitForEvent('close');
    await click(control, source.id, dock);
    await closed;
    await editor.getByText(itemName, {exact: true}).waitFor();
    assert.equal(await editor.evaluate(() => localStorage.getItem('tw-stage6-native-dock')), 'true');
    assert.equal((await control('windows')).some(window => window.id === source.id), false);
    report.checks.push('Trusted macOS HID dock click closes the Backpack window and returns its item to the editor');
}

async function checkCodeTargetSync ({editor, a, b, focus, parent, sprites}) {
    const [first, second] = sprites;
    const combo = view => view.child.getByRole('combobox', {name: /^(Editing target|編集対象)$/});
    const block = (view, sprite) => view.child.locator(`[data-id="${sprite.blockId}"]`).first();
    const targetIs = (view, sprite) => until(async () => await combo(view).inputValue() === sprite.name &&
        await block(view, sprite).isVisible(), `code window shows ${sprite.name}`);
    const listName = sprite => editor.getByText(sprite.name, {exact: true})
        .and(editor.locator('[class*="sprite-selector-item_sprite-name_"]'));
    const listSelected = sprite => until(() => listName(sprite).evaluate(node =>
        Boolean(node.closest('[class*="sprite-selector-item_is-selected_"]'))), `sprite list selects ${sprite.name}`);
    const position = sprite => editor.evaluate(({id, blockId}) => {
        const {x, y} = vm.runtime.getTargetById(id).blocks.getBlock(blockId);
        return {x, y};
    }, sprite);
    const editable = async view => {
        await focus(view.child, view.id);
        await until(() => combo(view).isEnabled(), 'target selector owns the edit lease');
    };
    const move = async (view, sprite) => {
        const before = await position(sprite);
        const rect = await block(view, sprite).boundingBox();
        assert.ok(rect);
        await view.child.mouse.move(rect.x + 14, rect.y + 10);
        await view.child.mouse.down();
        await view.child.mouse.move(rect.x + 77, rect.y + 55, {steps: 8});
        await view.child.mouse.up();
        await until(async () => (await position(sprite)).x > before.x, 'moved block is reflected in the parent VM');
        return position(sprite);
    };
    const history = (view, name) => view.child.getByRole('button', {name, exact: true});

    await editable(b);
    assert.equal(await combo(a).isDisabled(), true);
    const firstOriginal = await position(first);
    const firstEdited = await move(b, first);
    await until(async () => await block(a, first).getAttribute('transform') ===
        await block(b, first).getAttribute('transform'), 'the back view shows the shared edit');
    const selectedThumbnail = b.child.locator('#target-picker img').first();
    await until(() => selectedThumbnail.evaluate(image => image.naturalWidth > 0), 'selected costume is visible');
    await b.child.getByRole('button', {name: /^(Editing target options|編集対象の候補)$/}).click();
    const option = b.child.getByRole('option', {name: second.name, exact: true});
    await until(() => option.locator('img').evaluate(image => image.naturalWidth > 0), 'option has a costume thumbnail');
    const secondThumbnail = await option.locator('img').getAttribute('src');
    assert.ok(secondThumbnail !== await selectedThumbnail.getAttribute('src'), 'the two costume images differ');
    await option.click();
    await targetIs(b, second);
    await listSelected(second);
    await targetIs(a, first);
    assert.equal(await selectedThumbnail.getAttribute('src'), secondThumbnail);
    assert.equal(await history(b, 'Undo').isDisabled(), true);
    const secondOriginal = await position(second);
    const secondEdited = await move(b, second);
    await history(b, 'Undo').click();
    await until(async () => (await position(second)).x === secondOriginal.x, 'second sprite undo');

    await focus(editor, parent.id);
    await listName(first).click();
    await targetIs(b, first);
    assert.equal(await combo(a).isDisabled(), true);
    assert.equal(await combo(b).isDisabled(), true);
    await listName(second).click();
    await targetIs(b, second);
    await targetIs(a, first);
    assert.equal(await block(a, second).count(), 0);
    assert.deepEqual(await position(first), firstEdited);
    await editable(b);
    await history(b, 'Redo').click();
    await until(async () => (await position(second)).x === secondEdited.x, 'second sprite redo survives two target switches');
    await combo(b).press('ArrowUp');
    const options = await b.child.getByRole('option').allTextContents();
    const distance = options.indexOf(first.name) - options.indexOf(second.name);
    assert.notEqual(distance, 0);
    for (let step = 0; step < Math.abs(distance); step++) {
        await combo(b).press(distance > 0 ? 'ArrowDown' : 'ArrowUp');
    }
    await combo(b).press('Enter');
    await targetIs(b, first);
    await listSelected(first);
    await history(b, 'Undo').click();
    await until(async () => (await position(first)).x === firstOriginal.x &&
        await block(a, first).getAttribute('transform') === await block(b, first).getAttribute('transform'),
    'first sprite undo reaches both views');
    await editable(a);
    await history(a, 'Redo').click();
    await until(async () => (await position(first)).x === firstEdited.x, 'another view restores the first sprite');
    assert.deepEqual(await position(second), secondEdited);
    await focus(editor, parent.id);
    await listName(second).click();
    await targetIs(a, second);
    await targetIs(b, first);
    report.checks.push('Thumbnail combobox and sprite list sync only the last active code window; each sprite keeps shared undo/redo');

    await editable(b);
    await combo(b).fill(second.name);
    await combo(b).press('Enter');
    await b.child.getByRole('alert').waitFor();
    assert.equal(await combo(b).inputValue(), first.name);
    const renamed = {...first, name: '改名したスプライト'};
    await combo(b).fill(renamed.name);
    await combo(b).press('Enter');
    await targetIs(b, renamed);
    await listSelected(renamed);
    await targetIs(a, second);
    assert.ok((await b.child.title()).includes(renamed.name));
    const referenceName = () => editor.evaluate(({id, blockId}) =>
        vm.runtime.getTargetById(id).blocks.getBlock(`${blockId}-menu`).fields.TO.value, second);
    assert.equal(await referenceName(), renamed.name);
    await editable(a);
    await history(a, 'Undo').click();
    await until(async () => (await position(second)).x === secondOriginal.x, 'another target can still undo its edit');
    assert.equal(await referenceName(), renamed.name);
    await history(a, 'Redo').click();
    await until(async () => (await position(second)).x === secondEdited.x, 'another target can still redo its edit');
    assert.equal(await referenceName(), renamed.name);
    await combo(a).press('ArrowDown');
    await a.child.getByRole('option', {name: renamed.name, exact: true}).click();
    await targetIs(a, renamed);
    await targetIs(b, renamed);
    assert.ok((await a.child.title()).includes(renamed.name));
    report.checks.push('Inline sprite rename updates the list and title, rejects duplicates, and keeps sprite references current across undo/redo');
}

async function checkStageCode ({editor, a, b, focus, parent, sprite}) {
    const stage = await editor.evaluate(() => {
        const target = vm.runtime.getTargetForStage();
        return {id: target.id, name: target.getName()};
    });
    const combo = view => view.child.getByRole('combobox', {name: /^(Editing target|編集対象)$/});
    const category = (view, name) => view.child.locator('.scratchCategoryMenuItemLabel').filter({hasText: name});
    const workspaceBlock = (page, id) => page.locator(`.blocklyBlockCanvas [data-id="${id}"]`).first();
    const select = async (view, target) => {
        await focus(view.child, view.id);
        await until(() => combo(view).isEnabled(), 'code window has the edit lease');
        await view.child.getByRole('button', {name: /^(Editing target options|編集対象の候補)$/}).click();
        await view.child.getByRole('option', {name: target.name, exact: true}).click();
        await until(async () => await combo(view).inputValue() === target.name &&
            await editor.evaluate(id => vm.editingTarget.id === id, target.id), 'code window and VM select the same target');
        await until(() => combo(view).isEnabled(), 'target switch restores the edit lease');
    };
    const stageBlock = () => editor.evaluate(() => {
        const {blocks} = vm.runtime.getTargetForStage();
        return blocks.getScripts().find(script => blocks.getBlock(script).opcode === 'looks_nextbackdrop');
    });

    await select(b, stage);
    await category(b, 'Looks').waitFor();
    assert.equal(await category(b, 'Motion').count(), 0);
    await category(a, 'Motion').waitFor();
    assert.equal(await combo(a).inputValue(), sprite.name);
    assert.equal(await combo(a).isDisabled(), true);
    const flyout = b.child.locator('.blocklyFlyout');
    const nextBackdrop = flyout.getByText(/^(next\s+backdrop|次の背景にする)$/);
    await nextBackdrop.waitFor();
    assert.equal(await flyout.getByText(/^(show|表示する)$/).count(), 0);
    const box = await nextBackdrop.boundingBox();
    assert.ok(box);
    await b.child.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await b.child.mouse.down();
    await b.child.mouse.move(410, 310, {steps: 12});
    await b.child.mouse.up();
    const id = await until(stageBlock, 'stage VM receives the backdrop block');
    assert.equal(await workspaceBlock(a.child, id).count(), 0);
    assert.equal(await editor.evaluate(({spriteId, blockId}) =>
        Boolean(vm.runtime.getTargetById(spriteId).blocks.getBlock(blockId)), {spriteId: sprite.id, blockId: id}), false);

    await select(a, stage);
    await workspaceBlock(a.child, id).waitFor();
    await a.child.getByRole('button', {name: 'Undo', exact: true}).click();
    await until(async () => !(await stageBlock()), 'shared undo removes the stage block');
    await workspaceBlock(b.child, id).waitFor({state: 'detached'});
    await focus(b.child, b.id);
    await b.child.getByRole('button', {name: 'Redo', exact: true}).click();
    await until(async () => (await stageBlock()) === id, 'the other view restores the stage block');
    await workspaceBlock(a.child, id).waitFor();

    await select(a, sprite);
    await category(a, 'Motion').waitFor();
    assert.equal(await workspaceBlock(a.child, id).count(), 0);
    await workspaceBlock(b.child, id).waitFor();
    await focus(a.child, a.id);
    await Promise.all([a.child.waitForEvent('close'), a.child.locator('#dock').click()]);
    await focus(b.child, b.id);
    await Promise.all([b.child.waitForEvent('close'), b.child.locator('#dock').click()]);
    await focus(editor, parent.id);
    await editor.evaluate(stageId => vm.setEditingTarget(stageId), stage.id);
    await workspaceBlock(editor, id).waitFor();
    await editor.evaluate(async () => vm.loadProject(await (await vm.saveProjectSb3()).arrayBuffer()));
    await until(stageBlock, 'saved project restores the stage block');
    report.checks.push('Stage-specific toolbox, isolated backdrop edits, two-view Undo/Redo, docking and SB3 round trip');
}

async function checkCodeComments ({editor, a, b, focus, parent, sprites}) {
    const [sprite, other] = sprites;
    const block = page => page.locator(`.blocklyBlockCanvas [data-id="${sprite.blockId}"]`).first();
    const textarea = page => page.locator('textarea.scratchCommentTextarea');
    const workspaceComment = page => page.locator('g:has(> .scratchWorkspaceCommentBorder) > foreignObject textarea');
    const menu = (page, name) => page.locator('.blocklyContextMenu').getByText(name);
    const read = id => editor.evaluate(targetId => Object.values<{x: number; y: number; blockId: string | null; text: string}>(vm.runtime.getTargetById(targetId).comments)
        .map(({blockId, text}) => ({blockId, text})), id);
    const attached = async () => (await read(sprite.id)).find(item => item.blockId === sprite.blockId);
    const editable = async view => {
        await focus(view.child, view.id);
        await until(() => view.child.locator('#mount').evaluate(node => !node.inert), 'comment editor has the edit lease');
    };
    const history = (view, name) => view.child.getByRole('button', {name, exact: true}).click();

    await editable(b);
    await block(b.child).click({button: 'right'});
    await menu(b.child, /^add comment$/i).click();
    await until(attached, 'VM receives the attached comment');
    await textarea(b.child).fill('attached <&>');
    await editable(a);
    await until(async () => (await attached())?.text === 'attached <&>', 'focus switch commits the comment draft');
    assert.equal(await textarea(a.child).inputValue(), 'attached <&>');
    assert.equal(await b.child.locator('#mount').evaluate(node => node.inert), true);
    await history(a, 'Undo');
    await until(async () => (await attached())?.text === '', 'the other view can undo the text edit');
    await editable(b);
    await history(b, 'Redo');
    await until(async () => (await attached())?.text === 'attached <&>', 'redo restores the attached text');
    await block(b.child).click({button: 'right'});
    await menu(b.child, /^remove comment$/i).click();
    await until(async () => !(await attached()), 'deletion reaches the VM');
    await history(b, 'Undo');
    await until(async () => (await attached())?.text === 'attached <&>', 'undo restores the attached comment');

    await b.child.locator('.blocklyMainBackground').click({button: 'right', position: {x: 360, y: 270}});
    await menu(b.child, /^add comment$/i).click();
    await workspaceComment(b.child).fill('workspace note');
    await workspaceComment(b.child).press('Tab');
    await until(async () => (await read(sprite.id)).some(item => item.blockId === null && item.text === 'workspace note'),
        'the workspace comment reaches the VM');
    await until(async () => await workspaceComment(a.child).inputValue() === 'workspace note', 'back view shows the workspace comment');
    const coordinates = () => editor.evaluate(targetId => {
        const {x, y} = Object.values<{x: number; y: number; blockId: string | null; text: string}>(vm.runtime.getTargetById(targetId).comments).find(item => item.blockId === null);
        return {x, y};
    }, sprite.id);
    const original = await coordinates();
    const handle = b.child.locator('g:has(> .scratchWorkspaceCommentBorder) > .scratchCommentTopBar');
    const box = await handle.boundingBox();
    assert.ok(box);
    await b.child.mouse.move(box.x + 60, box.y + box.height / 2);
    await b.child.mouse.down();
    await b.child.mouse.move(box.x + 120, box.y + 25, {steps: 8});
    await b.child.mouse.up();
    await until(async () => (await coordinates()).x > original.x, 'moving the workspace comment reaches the VM');
    assert.deepEqual(await read(other.id), []);
    const close = view => Promise.all([view.child.waitForEvent('close'), view.child.locator('#dock').click()]);
    await close(b);
    await editable(a);
    await close(a);
    await focus(editor, parent.id);
    await until(async () => await workspaceComment(editor).inputValue() === 'workspace note', 'docked view shows the workspace comment');
    const restored = await editor.evaluate(async ({name, otherName}) => {
        await vm.loadProject(await (await vm.saveProjectSb3()).arrayBuffer());
        const comments = targetName => Object.values<{blockId: string | null; text: string}>(vm.runtime.targets.find(target => target.getName() === targetName).comments)
            .map(comment => [Boolean(comment.blockId), comment.text]).sort();
        return [comments(name), comments(otherName)];
    }, {name: sprite.name, otherName: other.name});
    assert.deepEqual(restored, [[[false, 'workspace note'], [true, 'attached <&>']], []]);
    report.checks.push('Attached and workspace comments stay with their target through focus, shared Undo/Redo, docking and SB3');
}

async function activateCodeView(front, back, focus) {
    const inert = view => view.child.locator('#mount').evaluate(node => node.inert);
    await until(async () => {
        if (!await front.child.evaluate(() => document.hasFocus())) await focus(front.child, front.id);
        return !await inert(front) && await inert(back);
    }, 'only the front view can edit');
}

const variableScopeFixtures = {
    scalar: {name: 'shared counter', type: '', fieldName: 'VARIABLE', reporterOpcode: 'data_variable',
        statementOpcode: 'data_setvariableto', globalId: 'global-counter', localId: 'local-counter'},
    list: {name: 'shared items', type: 'list', fieldName: 'LIST', reporterOpcode: 'data_listcontents',
        statementOpcode: 'data_addtolist', globalId: 'global-list', localId: 'local-list'}
};

async function checkVariableScope ({editor, a, b, focus, open, parent, sprite, kind}) {
    const fixture = variableScopeFixtures[kind];
    const {name, fieldName, globalId, localId} = fixture;
    const reporterId = 'scope-reporter';
    const statementId = 'scope-statement';
    const block = (view, id) => view.child.locator(`.blocklyBlockCanvas [data-id="${id}"]`);
    const reporter = view => block(view, reporterId);
    const statement = view => block(view, statementId);
    const field = id => editor.evaluate(({targetId, id, fieldName}) =>
        vm.runtime.getTargetById(targetId).blocks.getBlock(id).fields[fieldName].id, {targetId: sprite.id, id, fieldName});
    const activate = (front, back) => activateCodeView(front, back, focus);
    const ja = (await a.child.title()).startsWith('コード');
    const scopeLabel = scope => ja ? (scope === 'Global' ? '全体' : 'このスプライト') : scope;
    const optionLabel = scope => `${scopeLabel(scope)}: ${name}`;
    const showsScope = async (locator, scope) =>
        (await locator.textContent()).replace(/\s/g, ' ').includes(`${scopeLabel(scope)}: shared`);
    const expectScope = (view, locator, scope, id) => until(async () =>
        await field(id) === (scope === 'Global' ? globalId : localId) && await showsScope(locator(view), scope),
    `${scope} ID and label in the other view`);
    const selectReporter = async (view, scope) => {
        await reporter(view).click({button: 'right'});
        await view.child.locator('.blocklyContextMenu').getByText(optionLabel(scope), {exact: true}).click();
    };
    const history = (view, name) => view.child.getByRole('button', {name, exact: true}).click();
    await activate(b, a);
    await expectScope(a, reporter, 'Global', reporterId);
    await selectReporter(b, 'Local');
    await expectScope(a, reporter, 'Local', reporterId);

    await activate(a, b);
    await selectReporter(a, 'Global');
    await expectScope(b, reporter, 'Global', reporterId);
    await activate(b, a);
    await history(b, 'Undo');
    await expectScope(a, reporter, 'Local', reporterId);
    await activate(a, b);
    await history(a, 'Redo');
    await expectScope(b, reporter, 'Global', reporterId);

    await activate(a, b);
    const dropdown = a.child.locator('.blocklyDropDownDiv .goog-menuitem');
    await statement(a).locator('.blocklyDropdownText').click();
    await dropdown.filter({hasText: optionLabel('Global')}).waitFor();
    await dropdown.filter({hasText: optionLabel('Local')}).click();
    await expectScope(b, statement, 'Local', statementId);

    const close = view => Promise.all([view.child.waitForEvent('close'), view.child.locator('#dock').click()]);
    await close(a);
    await focus(b.child, b.id);
    await close(b);
    await focus(editor, parent.id);
    const restored = await editor.evaluate(async ({spriteName, fixture}) => {
        await vm.loadProject(await (await vm.saveProjectSb3()).arrayBuffer());
        const target = vm.runtime.targets.find(item => item.getName() === spriteName);
        const stage = vm.runtime.getTargetForStage();
        const scripts = target.blocks.getScripts().map(id => target.blocks.getBlock(id));
        const reference = opcode => {
            const block = scripts.find(item => item.opcode === opcode);
            return {blockId: block.id, variableId: block.fields[fixture.fieldName].id};
        };
        vm.setEditingTarget(target.id);
        return {
            reporter: reference(fixture.reporterOpcode),
            statement: reference(fixture.statementOpcode),
            global: stage.variables[fixture.globalId]?.name,
            local: target.variables[fixture.localId]?.name,
            listContents: fixture.type === 'list' ?
                [stage.variables[fixture.globalId]?.value, target.variables[fixture.localId]?.value] : null
        };
    }, {spriteName: sprite.name, fixture});
    assert.deepEqual([restored.reporter.variableId, restored.statement.variableId, restored.global, restored.local],
        [globalId, localId, name, name]);
    if (kind === 'list') assert.deepEqual(restored.listContents, [['global item'], ['local item']]);
    const reopened = await open(restored.reporter.blockId);
    assert.equal(await showsScope(block(reopened, restored.reporter.blockId), 'Global'), true);
    assert.equal(await showsScope(block(reopened, restored.statement.blockId), 'Local'), true);
    await close(reopened);
    report.checks.push(`Same-name ${kind} reporter and dropdown retain scope through both-way switching, two views, shared Undo/Redo and SB3`);
}

const broadcastFixture = {
    messages: {'broadcast-alpha': 'signal alpha', 'broadcast-beta': 'signal beta'},
    receive: 'event_whenbroadcastreceived',
    send: 'event_broadcast',
    wait: 'event_broadcastandwait'
};

async function checkCodeBroadcast ({editor, a, b, focus, parent, sprite}) {
    const {messages, receive, send, wait} = broadcastFixture;
    const alpha = 'broadcast-alpha';
    const beta = 'broadcast-beta';
    const field = (view, opcode) => view.child.locator(`.blocklyBlockCanvas [data-id="${opcode}"] .blocklyDropdownText`);
    const shows = async (view, blockId, id) =>
        (await field(view, blockId).textContent()).replace(/\s/g, ' ').includes(messages[id]);
    const expectMessage = (view, opcode, id) => until(async () => {
        const reference = await editor.evaluate(({targetId, opcode, receive}) => {
            const {blocks} = vm.runtime.getTargetById(targetId);
            const block = blocks.getBlock(`broadcast-test-${opcode}`);
            const owner = opcode === receive ? block : blocks.getBlock(block.inputs.BROADCAST_INPUT.block);
            const {id, value} = owner.fields.BROADCAST_OPTION;
            return {id, value};
        }, {targetId: sprite.id, opcode, receive});
        return reference.id === id && reference.value === messages[id] && await shows(view, `broadcast-test-${opcode}`, id);
    }, `${opcode} reference reaches the VM and the other view`);
    const choose = async (view, opcode, id) => {
        await activateCodeView(view, view === a ? b : a, focus);
        const dropdown = field(view, `broadcast-test-${opcode}`);
        await dropdown.waitFor();
        await dropdown.click({force: true});
        const option = view.child.locator('.blocklyDropDownDiv .goog-menuitem').filter({hasText: messages[id]});
        await option.waitFor();
        await option.click({force: true});
        await option.waitFor({state: 'hidden'});
    };
    const step = (view, name) => view.child.getByRole('button', {name, exact: true}).click();

    await activateCodeView(a, b, focus);
    await choose(a, send, beta);
    await expectMessage(b, send, beta);
    await choose(a, receive, beta);
    await expectMessage(b, receive, beta);
    const pruned = await editor.evaluate(({id, targetId}) => {
        const stage = vm.runtime.getTargetForStage();
        vm.setEditingTarget(stage.id);
        const removed = !Object.hasOwn(stage.variables, id);
        vm.setEditingTarget(targetId);
        return removed;
    }, {id: alpha, targetId: sprite.id});
    assert.equal(pruned, true);

    await activateCodeView(b, a, focus);
    await editor.evaluate(() => vm.refreshWorkspace());
    await step(b, 'Undo');
    await expectMessage(a, receive, alpha);
    await activateCodeView(b, a, focus);
    await step(b, 'Undo');
    await expectMessage(a, send, alpha);

    await activateCodeView(a, b, focus);
    await step(a, 'Redo');
    await expectMessage(b, send, beta);
    await activateCodeView(a, b, focus);
    await step(a, 'Redo');
    await expectMessage(b, receive, beta);
    await activateCodeView(a, b, focus);
    await expectMessage(b, wait, beta);
    await choose(a, wait, alpha);
    await expectMessage(b, wait, alpha);
    await choose(a, wait, beta);
    await expectMessage(b, wait, beta);
    await choose(a, wait, alpha);
    await expectMessage(b, wait, alpha);

    const dock = async view => {
        await focus(view.child, view.id);
        await Promise.all([view.child.waitForEvent('close'), view.child.locator('#dock').click()]);
    };
    await dock(a);
    await dock(b);
    await focus(editor, parent.id);
    const restored = await editor.evaluate(async ({spriteName, messages, receive, send, wait}) => {
        await vm.loadProject(await (await vm.saveProjectSb3()).arrayBuffer());
        const target = vm.runtime.targets.find(item => item.getName() === spriteName);
        const stage = vm.runtime.getTargetForStage();
        const {blocks} = target;
        const roots = blocks.getScripts().map(id => blocks.getBlock(id));
        vm.setEditingTarget(target.id);
        return {
            messages: Object.keys(messages).map(id => stage.variables[id]?.name),
            references: [receive, send, wait].map(opcode => {
                const root = roots.find(block => block.opcode === opcode);
                const owner = opcode === receive ? root : blocks.getBlock(root.inputs.BROADCAST_INPUT.block);
                return {blockId: root.id, id: owner.fields.BROADCAST_OPTION.id};
            })
        };
    }, {spriteName: sprite.name, ...broadcastFixture});
    assert.deepEqual(restored.messages, Object.values(messages));
    const expected = [beta, beta, alpha];
    assert.deepEqual(restored.references.map(({id}) => id), expected);

    for (const [index, {blockId}] of restored.references.entries()) {
        await until(() => shows({child: editor}, blockId, expected[index]), 'reloaded editor shows the saved message');
    }
    report.checks.push('Broadcast send, send and wait, and receive references retain message IDs through two views, VM message pruning, shared Undo/Redo and SB3');
}

const procedureFixture = `
    <block id="procedure-test-definition" type="procedures_definition" x="140" y="155">
        <statement name="custom_block">
            <shadow id="procedure-test-prototype" type="procedures_prototype">
                <mutation proccode="drive %s" argumentids='["amount"]' argumentnames='["speed"]'
                    argumentdefaults='[""]' warp="false"></mutation>
                <value name="amount"><shadow id="procedure-test-shadow" type="argument_reporter_string_number">
                    <field name="VALUE">speed</field>
                </shadow></value>
            </shadow>
        </statement>
        <next><block id="procedure-test-move" type="motion_movesteps">
            <value name="STEPS"><block id="procedure-test-argument" type="argument_reporter_string_number">
                <field name="VALUE">speed</field>
            </block></value>
        </block></next>
    </block>
    <block id="procedure-test-call" type="procedures_call" x="140" y="320">
        <mutation proccode="drive %s" argumentids='["amount"]' warp="false"></mutation>
        <value name="amount"><shadow id="procedure-test-value" type="text"><field name="TEXT">35</field></shadow></value>
    </block>`;

async function checkCodeProcedures ({editor, a, b, focus, parent, sprite}) {
    const inspect = reload => editor.evaluate(async ({spriteName, reload}) => {
        if (reload) await vm.loadProject(await (await vm.saveProjectSb3()).arrayBuffer());
        const target = vm.runtime.targets.find(item => item.getName() === spriteName);
        if (reload) vm.setEditingTarget(target.id);
        const {blocks} = target;
        const roots = blocks.getScripts().map(id => blocks.getBlock(id));
        const definitions = roots.filter(block => block.opcode === 'procedures_definition');
        const getPrototype = definition => blocks.getBlock(definition.inputs.custom_block.block);
        const definition = definitions.find(block => getPrototype(block).mutation.proccode.startsWith('drive '));
        const call = roots.find(block => block.opcode === 'procedures_call');
        const prototype = getPrototype(definition);
        const move = blocks.getBlock(definition.next);
        const reporter = blocks.getBlock(move.inputs.STEPS.block);
        const args = JSON.parse(prototype.mutation.argumentids);
        const value = id => blocks.getBlock(call.inputs[id]?.block)?.fields.TEXT?.value;
        return {
            definition: prototype.mutation.proccode,
            definitionCodes: definitions.map(block => getPrototype(block).mutation.proccode).sort(),
            call: call.mutation.proccode,
            args,
            callArgs: JSON.parse(call.mutation.argumentids),
            names: JSON.parse(prototype.mutation.argumentnames),
            reporter: reporter.fields.VALUE.value,
            values: Object.keys(call.inputs).map(value),
            prototypeInputs: Object.keys(prototype.inputs),
            callInputs: Object.keys(call.inputs),
            shadowRoots: roots.filter(block => block.shadow).length,
            callId: call.id
        };
    }, {spriteName: sprite.name, reload});
    const renderedCall = (page, id = 'procedure-test-call') =>
        page.locator(`.blocklyBlockCanvas [data-id="${id}"]`);
    const shows = async (page, label, id?) =>
        (await renderedCall(page, id).textContent()).replace(/\s/g, ' ').includes(label);
    const check = async (view, edited) => {
        const title = edited ? 'drive edited' : 'drive';
        await until(async () => {
            const state = await inspect(false);
            return state.definition === (edited ? 'drive edited %s %s %b' : 'drive %s') &&
                state.call === state.definition && await shows(view.child, title);
        }, 'definition and caller agree in the VM and the other view');
        const state = await inspect(false);
        assert.deepEqual(state.args, state.callArgs);
        assert.equal(state.args[0], 'amount');
        assert.equal(state.args.length, edited ? 3 : 1);
        assert.deepEqual(state.names, edited ? ['velocity', 'note', 'ready'] : ['speed']);
        assert.equal(state.reporter, edited ? 'velocity' : 'speed');
        assert.deepEqual(state.values, edited ? ['35', ''] : ['35']);
        assert.equal(state.shadowRoots, 0);
    };
    await activateCodeView(a, b, focus);
    await renderedCall(a.child).click({button: 'right'});
    await a.child.locator('.blocklyContextMenu').getByText(/^Edit$/i).click();
    const dialog = a.child.getByRole('dialog');
    const draft = dialog.locator('[data-procedure-workspace]');
    const setText = async value => {
        const input = dialog.locator('.blocklyHtmlInput');
        await input.fill(value);
        await input.press('Enter');
    };
    await draft.getByText('drive', {exact: true}).click();
    await setText('drive edited');
    await draft.getByText('speed', {exact: true}).click();
    await setText('velocity');
    await dialog.getByRole('button', {name: /^(Add number or text input|引数を追加（数値または文字列）)$/}).click();
    await setText('note');
    await dialog.getByRole('button', {name: /^(Add boolean input|真偽値の引数を追加)$/}).click();
    await setText('ready');
    await dialog.getByRole('button', {name: 'OK', exact: true}).click();
    await check(b, true);

    await activateCodeView(b, a, focus);
    await b.child.getByRole('button', {name: 'Undo', exact: true}).click();
    await check(a, false);
    await activateCodeView(a, b, focus);
    await a.child.getByRole('button', {name: 'Redo', exact: true}).click();
    await check(b, true);

    const withNote = await inspect(false);
    await activateCodeView(a, b, focus);
    await renderedCall(a.child).click({button: 'right'});
    await a.child.locator('.blocklyContextMenu').getByText(/^Edit$/i).click();
    await draft.getByText('note', {exact: true}).click();
    await dialog.locator('.blocklyTextRemoveIcon').click();
    await dialog.getByRole('button', {name: 'OK', exact: true}).click();
    await until(async () => (await inspect(false)).call === 'drive edited %s %b', 'removed argument reaches the VM');
    const removed = await inspect(false);
    assert.equal(removed.call, removed.definition);
    assert.deepEqual(removed.names, ['velocity', 'ready']);
    assert.deepEqual(removed.args, [withNote.args[0], withNote.args[2]]);
    assert.deepEqual(removed.args, removed.callArgs);
    assert.deepEqual(removed.prototypeInputs, removed.args);
    assert.deepEqual(removed.callInputs, ['amount']);
    assert.deepEqual(removed.values, ['35']);
    assert.equal(removed.shadowRoots, 0);

    await activateCodeView(b, a, focus);
    await b.child.getByRole('button', {name: 'Undo', exact: true}).click();
    await check(a, true);
    await activateCodeView(a, b, focus);
    await a.child.getByRole('button', {name: 'Redo', exact: true}).click();
    await until(async () => (await inspect(false)).call === removed.call, 'one redo removes the argument again');
    assert.deepEqual(await inspect(false), removed);

    await activateCodeView(a, b, focus);
    await a.child.locator('.scratchCategoryMenuItemLabel').filter({hasText: /^My Blocks$/}).click();
    await a.child.getByText('Make a Block', {exact: true}).click();
    await draft.getByText('block name', {exact: true}).click();
    await setText('turn check');
    await dialog.getByRole('button', {name: 'OK', exact: true}).click();
    const createdId = await until(() => editor.evaluate(spriteId => {
        const {blocks} = vm.runtime.getTargetById(spriteId);
        const definitions = blocks.getScripts().map(id => blocks.getBlock(id)).filter(block =>
            block.opcode === 'procedures_definition' &&
            blocks.getBlock(block.inputs.custom_block.block).mutation.proccode === 'turn check');
        return definitions.length === 1 && definitions[0].id;
    }, sprite.id), 'one new definition reaches the VM');
    await b.child.locator(`.blocklyBlockCanvas [data-id="${createdId}"]`).getByText('turn check', {exact: true}).waitFor();

    for (const view of [a, b]) {
        await focus(view.child, view.id);
        await Promise.all([view.child.waitForEvent('close'), view.child.locator('#dock').click()]);
    }
    await focus(editor, parent.id);
    const {callId: _beforeId, ...before} = await inspect(false);
    const {callId, ...restored} = await inspect(true);
    assert.deepEqual(restored, before);
    await until(() => shows(editor, 'drive edited', callId), 'reloaded editor displays the edited call');
    report.checks.push('Procedure creation, definition changes, call inputs, argument reporters and call values stay together through two views, one-step Undo/Redo and SB3');
}

const extensionFixture = `
Scratch.extensions.register({
    getInfo() {
        return {id: 'windowfixture', name: 'Window fixture', blocks: [
            {opcode: 'setLevel', blockType: Scratch.BlockType.COMMAND, text: 'fixture level [LEVEL]',
                arguments: {LEVEL: {type: Scratch.ArgumentType.NUMBER, defaultValue: 12}}}
        ]};
    },
    setLevel() {}
});
`;

async function checkCodeExtensions ({editor, a, b, focus, parent, sprite}) {
    const block = (page, id) => page.locator(`.blocklyBlockCanvas [data-id="${id}"]`);
    const targetState = (reload = false) => editor.evaluate(async ({spriteName, reload}) => {
        if (reload) await vm.loadProject(await (await vm.saveProjectSb3()).arrayBuffer());
        const target = vm.runtime.targets.find(item => item.getName() === spriteName);
        if (reload) vm.setEditingTarget(target.id);
        const {blocks} = target;
        const roots = blocks.getScripts().map(id => blocks.getBlock(id));
        const pen = roots.find(block => block.opcode === 'pen_setPenColorParamTo');
        const custom = Object.keys(blocks._blocks).map(id => blocks.getBlock(id))
            .find(block => block.opcode === 'windowfixture_setLevel');
        return {
            penId: pen.id,
            color: blocks.getBlock(pen.inputs.COLOR_PARAM.block).fields.colorParam.value,
            penValue: String(blocks.getBlock(pen.inputs.VALUE.block).fields.NUM.value),
            custom: custom && {id: custom.id, value: String(blocks.getBlock(custom.inputs.LEVEL.block).fields.NUM.value)}
        };
    }, {spriteName: sprite.name, reload});
    const field = (view, id, selector) => block(view.child, id).locator(selector);
    const activate = (front, back) => activateCodeView(front, back, focus);
    const number = async (view, id, value) => {
        const input = field(view, id, '.blocklyEditableText');
        await input.click({force: true});
        const editor = view.child.locator('.blocklyHtmlInput');
        await editor.fill(value);
        await editor.press('Enter');
    };
    const penId = 'extension-test-pen';
    const valueId = 'extension-test-value';
    const saturation = await editor.evaluate(() => vm.runtime._blockInfo.find(category => category.id === 'pen')
        .menus.find(menu => menu.json.type === 'pen_menu_colorParam').json.args0[0].options
        .find(([, value]) => value === 'saturation')[0]);
    const expectPen = (view, color, value) => until(async () => {
        const state = await targetState();
        const rendered = (await block(view.child, penId).textContent()).replace(/\s/g, ' ');
        return state.color === color && state.penValue === value && rendered.includes(value) &&
            (color !== 'saturation' || rendered.includes(saturation));
    }, 'extension field changes reach the VM and the other view');
    await activate(a, b);
    await field(a, penId, '.blocklyDropdownText').click({force: true});
    const option = a.child.locator('.blocklyDropDownDiv .goog-menuitem').filter({hasText: saturation});
    await option.click({force: true});
    await option.waitFor({state: 'hidden'});
    await expectPen(b, 'saturation', '50');
    await activate(a, b);
    await number(a, valueId, '73');
    await expectPen(b, 'saturation', '73');

    await activate(b, a);
    await b.child.getByRole('button', {name: 'Undo', exact: true}).click();
    await expectPen(a, 'saturation', '50');
    await activate(a, b);
    await a.child.getByRole('button', {name: 'Redo', exact: true}).click();
    await expectPen(b, 'saturation', '73');

    const url = `data:text/javascript,${encodeURIComponent(extensionFixture)}`;
    await editor.evaluate(url => vm.extensionManager.loadExtensionURL(url), url);
    assert.equal(await editor.evaluate(() => vm.extensionManager.isExtensionLoaded('windowfixture')), true);
    const category = view => view.child.locator('.scratchCategoryMenuItemLabel').filter({hasText: /^Window fixture$/});
    await category(b).waitFor();
    await activate(a, b);
    await category(a).click();
    const entry = a.child.locator('.blocklyFlyout [data-id]').filter({hasText: /fixture\s+level/}).first();
    const origin = await until(async () => entry.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        const x = bounds.left + 18;
        const y = bounds.top + 15;
        return element.contains(document.elementFromPoint(x, y)) && {x, y};
    }), 'the extension palette block is visible and hittable');
    const mouse = a.child.mouse;
    await mouse.move(origin.x, origin.y);
    await mouse.down();
    await mouse.move(origin.x + 42, origin.y, {steps: 4});
    await mouse.move(630, 410, {steps: 18});
    await mouse.up();
    const created = await until(async () => (await targetState()).custom, 'custom extension block can be added from the child palette');
    await block(b.child, created.id).waitFor();
    assert.equal(created.value, '12');
    const expectCustom = (view, value) => until(async () =>
        (await targetState()).custom?.value === value && (await block(view.child, created.id).textContent()).includes(value),
    'custom extension input reaches the VM and the other view');
    await activate(a, b);
    await number(a, created.id, '27');
    await expectCustom(b, '27');
    await activate(b, a);
    await b.child.getByRole('button', {name: 'Undo', exact: true}).click();
    await expectCustom(a, '12');
    await activate(a, b);
    await a.child.getByRole('button', {name: 'Redo', exact: true}).click();
    await expectCustom(b, '27');

    for (const view of [a, b]) {
        await focus(view.child, view.id);
        await Promise.all([view.child.waitForEvent('close'), view.child.locator('#dock').click()]);
    }
    await focus(editor, parent.id);
    const restored = await targetState(true);
    assert.deepEqual([restored.color, restored.penValue, restored.custom?.value], ['saturation', '73', '27']);
    await until(async () => (await block(editor, restored.penId).textContent()).includes('73'),
        'reloaded editor renders the saved extension block');
    report.checks.push('Parent VM extension blocks and menus work in two views, shared Undo/Redo and SB3; a late custom extension appears in both palettes');
}

const dynamicExtensionFixture = `
Scratch.extensions.register({
    getInfo() {
        return {id: 'windowdynamic', name: 'Window dynamic', blocks: [{
            opcode: 'shape', isDynamic: true, blockType: Scratch.BlockType.COMMAND,
            text: 'dynamic default [VALUE]', arguments: {VALUE: {type: Scratch.ArgumentType.NUMBER, defaultValue: 9}}
        }]};
    },
    shape() {return 0;}
});
`;
const dynamicShapeMutation = (blockType, label, input) =>
    `<mutation blockInfo='${JSON.stringify({
        opcode: 'shape', isDynamic: true, blockType, text: `${label} [${input}]`,
        arguments: {[input]: {type: 'number'}}
    })}'></mutation>`;

async function checkCodeDynamic ({editor, a, b, focus, open, parent, sprite}) {
    const escapeId = id => id.replace(/[\\"]/g, '\\$&');
    const block = (page, id) => page.locator(`.blocklyBlockCanvas [data-id="${escapeId(id)}"]`);
    const state = (reload = false) => editor.evaluate(async ({name, reload}) => {
        if (reload) await vm.loadProject(await (await vm.saveProjectSb3()).arrayBuffer());
        const target = vm.runtime.targets.find(item => item.getName() === name);
        if (reload) vm.setEditingTarget(target.id);
        const {blocks} = target;
        const roots = blocks.getScripts().map(id => blocks.getBlock(id));
        const info = block => block?.mutation?.blockInfo;
        const command = roots.find(block => block.opcode === 'windowdynamic_shape' && info(block)?.blockType === 'command');
        const branch = roots.find(block => block.opcode === 'control_if');
        const amount = blocks.getBlock(command.inputs.AMOUNT.block);
        const reporter = info(amount) ? amount : roots.find(block => block.opcode === 'windowdynamic_shape' && info(block)?.blockType === 'reporter');
        const predicate = blocks.getBlock(branch.inputs.CONDITION.block);
        return {
            ids: {command: command.id, reporter: reporter.id, predicate: predicate.id, branch: branch.id, tail: command.next},
            mutations: [info(command), info(reporter), info(predicate)],
            attached: amount === reporter,
            numbers: [reporter.inputs.VALUE, predicate.inputs.FLAG].map(input => String(blocks.getBlock(input.block).fields.NUM.value)),
            shadow: String(blocks.getBlock(command.inputs.AMOUNT.shadow).fields.NUM.value),
            tail: blocks.getBlock(command.next).opcode
        };
    }, {name: sprite.name, reload});
    const original = await state();
    assert.deepEqual(original.mutations.map(info => info.blockType), ['command', 'reporter', 'Boolean']);
    assert.deepEqual([original.attached, original.numbers, original.shadow, original.tail], [true, ['3', '4'], '9', 'looks_show']);
    const checkView = async (page, attached, current) => {
        const {ids} = current;
        for (const [id, label, shape] of [
            [ids.command, 'command', 'stack'], [ids.reporter, 'reporter', 'round'], [ids.predicate, 'predicate', 'boolean']
        ]) {
            await block(page, id).getByText(`dynamic ${label}`, {exact: true}).waitFor();
            assert.ok((await block(page, id).getAttribute('data-shapes')).split(' ').includes(shape));
        }
        await until(async () => {
            const contains = (root, child) => block(page, root).locator(`[data-id="${escapeId(child)}"]`).count();
            return !!await contains(ids.command, ids.reporter) === attached &&
                !!await contains(ids.branch, ids.predicate) && !!await contains(ids.command, ids.tail);
        }, 'the displayed dynamic reporter, predicate, and command stack match the VM');
    };
    const expectConnection = async (view, attached) => {
        const current = await until(async () => {
            const result = await state();
            return result.attached === attached && result;
        }, 'the VM stores the changed dynamic reporter connection');
        assert.deepEqual(current.mutations, original.mutations);
        assert.deepEqual([current.numbers, current.shadow, current.tail], [original.numbers, original.shadow, original.tail]);
        await checkView(view.child, attached, current);
    };
    await checkView(a.child, true, original);
    await checkView(b.child, true, original);

    await activateCodeView(a, b, focus);
    await a.child.locator('.scratchCategoryMenuItemLabel').filter({hasText: /^Window dynamic$/}).click();
    await a.child.locator('.blocklyFlyout').getByText('dynamic default', {exact: true}).waitFor();
    const label = block(a.child, original.ids.reporter).getByText('dynamic reporter', {exact: true});
    const origin = await label.boundingBox();
    assert.ok(origin);
    const mouse = a.child.mouse;
    const x = origin.x + origin.width / 2;
    const y = origin.y + origin.height / 2;
    assert.equal(await label.evaluate((element, {x, y}) =>
        document.elementFromPoint(x, y)?.closest('[data-id]') === element.closest('[data-id]'), {x, y}), true);
    await mouse.move(x, y);
    await mouse.down();
    await mouse.move(x + 45, y + 25, {steps: 6});
    await mouse.move(650, 420, {steps: 18});
    await mouse.up();
    await expectConnection(b, false);

    await activateCodeView(b, a, focus);
    await b.child.getByRole('button', {name: 'Undo', exact: true}).click();
    await expectConnection(a, true);
    await activateCodeView(a, b, focus);
    await a.child.getByRole('button', {name: 'Redo', exact: true}).click();
    await expectConnection(b, false);
    await activateCodeView(b, a, focus);
    await b.child.getByRole('button', {name: 'Undo', exact: true}).click();
    await expectConnection(a, true);

    for (const view of [a, b]) {
        await focus(view.child, view.id);
        await Promise.all([view.child.waitForEvent('close'), view.child.locator('#dock').click()]);
    }
    await focus(editor, parent.id);
    const restored = await state(true);
    assert.deepEqual({...restored, ids: original.ids}, original);
    await checkView(editor, true, restored);
    const reopened = await open(restored.ids.command);
    await checkView(reopened.child, true, restored);
    await focus(reopened.child, reopened.id);
    await Promise.all([reopened.child.waitForEvent('close'), reopened.child.locator('#dock').click()]);
    report.checks.push('A parent-loaded dynamic opcode renders command, reporter, and Boolean shapes in two code windows. Reporter detachment, shared Undo/Redo, and SB3 reload preserve mutations and connections.');
}

const dynamicBranchFixture = {
    url: `data:text/javascript,${encodeURIComponent(dynamicExtensionFixture.replace('Scratch.BlockType.COMMAND', 'Scratch.BlockType.LOOP'))}`,
    stacks: [
        {id: 'dynamic-loop', xml: `
            <block type="windowdynamic_shape" id="dynamic-loop" x="260" y="125">
                <mutation blockInfo='{"opcode":"shape","isDynamic":true,"blockType":"loop","text":"dynamic loop"}'></mutation>
                <statement name="SUBSTACK"><block type="motion_ifonedgebounce" id="dynamic-loop-body"></block></statement>
                <next><block type="looks_nextcostume" id="dynamic-loop-next"></block></next>
            </block>`},
        {id: 'dynamic-conditional', xml: `
            <block type="windowdynamic_shape" id="dynamic-conditional" x="95" y="215">
                <mutation blockInfo='{"opcode":"shape","isDynamic":true,"blockType":"conditional","branchCount":2,"text":["dynamic if","dynamic else"]}'></mutation>
                <statement name="SUBSTACK"><block type="looks_nextbackdrop" id="dynamic-then"></block></statement>
                <statement name="SUBSTACK2"><block type="looks_show" id="dynamic-else">
                    <next><block type="looks_hide" id="dynamic-else-next"></block></next>
                </block></statement>
            </block>`}
    ]
};

async function checkCodeDynamicBranches ({editor, a, b, focus, open, parent, sprite}) {
    const selector = id => `[data-id="${id.replace(/[\\"]/g, '\\$&')}"]`;
    const block = (page, id) => page.locator(`.blocklyBlockCanvas ${selector(id)}`);
    const state = (reload = false) => editor.evaluate(async ({name, reload}) => {
        if (reload) await vm.loadProject(await (await vm.saveProjectSb3()).arrayBuffer());
        const target = vm.runtime.targets.find(item => item.getName() === name);
        if (reload) vm.setEditingTarget(target.id);
        const {blocks} = target;
        const roots = blocks.getScripts().map(id => blocks.getBlock(id));
        const shape = type => roots.find(block => block.opcode === 'windowdynamic_shape' && block.mutation.blockInfo.blockType === type);
        const loop = shape('loop');
        const conditional = shape('conditional');
        const input = (block, name) => blocks.getBlock(block.inputs[name]?.block);
        const body = input(loop, 'SUBSTACK');
        const thenBlock = input(conditional, 'SUBSTACK');
        const elseBlock = input(conditional, 'SUBSTACK2') ?? roots.find(block => block.opcode === 'looks_show');
        const next = blocks.getBlock(elseBlock.next);
        return {
            ids: {loop: loop.id, conditional: conditional.id, body: body.id, loopNext: loop.next, then: thenBlock.id,
                else: elseBlock.id, elseNext: next.id},
            attached: elseBlock.parent === conditional.id && input(conditional, 'SUBSTACK2') === elseBlock,
            body: [body, blocks.getBlock(loop.next), thenBlock, elseBlock, next].map(block => block.opcode),
            mutations: [loop, conditional].map(block => block.mutation.blockInfo)
        };
    }, {name: sprite.name, reload});
    const original = await state();
    assert.equal(original.attached, true);
    assert.deepEqual(original.body, ['motion_ifonedgebounce', 'looks_nextcostume', 'looks_nextbackdrop', 'looks_show', 'looks_hide']);

    const checkView = async (page, {ids, attached}) => {
        for (const [root, expected] of [[ids.loop, 'c-1'], [ids.conditional, 'c-2']]) {
            await block(page, root).waitFor();
            assert.ok((await block(page, root).getAttribute('data-shapes')).split(' ').includes(expected));
        }
        await block(page, ids.conditional).getByText('dynamic else', {exact: true}).waitFor();
        await until(async () => {
            const contains = (root, child) => block(page, root).locator(selector(child)).count();
            return await contains(ids.loop, ids.body) && await contains(ids.loop, ids.loopNext) &&
                await contains(ids.conditional, ids.then) && await contains(ids.else, ids.elseNext) &&
                Boolean(await contains(ids.conditional, ids.else)) === attached;
        }, 'the displayed branch stacks match the VM');
    };
    const checkEdit = async (page, attached) => {
        const current = await until(async () => {
            const result = await state();
            return result.attached === attached && result;
        }, 'the VM records the changed second branch');
        assert.deepEqual(current, {...original, attached});
        await checkView(page, current);
    };
    await checkView(editor, original);
    await checkView(a.child, original);
    await checkView(b.child, original);

    await activateCodeView(a, b, focus);
    await a.child.locator('.scratchCategoryMenuItemLabel').filter({hasText: /^Window dynamic$/}).click();
    await a.child.locator('.blocklyFlyout [data-shapes~="c-1"]').getByText('dynamic default', {exact: true}).waitFor();
    await activateCodeView(a, b, focus);
    const origin = await block(a.child, original.ids.else).evaluate(element => {
        const text = [...element.querySelectorAll('.blocklyText')].find(label => label.closest('[data-id]') === element);
        const bounds = text.getBoundingClientRect();
        const x = bounds.left + bounds.width / 2;
        const y = bounds.top + bounds.height / 2;
        const hit = document.elementFromPoint(x, y);
        if (hit?.closest('[data-id]') !== element) {
            throw new Error(`Branch block is obscured at ${x}, ${y} by ${hit?.closest('[data-id]')?.getAttribute('data-id') ?? hit?.tagName}`);
        }
        return {x, y};
    });
    const mouse = a.child.mouse;
    await mouse.move(origin.x, origin.y);
    await mouse.down();
    await mouse.move(origin.x + 48, origin.y + 22, {steps: 6});
    await mouse.move(730, 475, {steps: 18});
    await mouse.up();
    await checkEdit(b.child, false);

    for (const [front, back, action, attached] of [[b, a, 'Undo', true], [a, b, 'Redo', false], [b, a, 'Undo', true]] as const) {
        await activateCodeView(front, back, focus);
        await front.child.getByRole('button', {name: action, exact: true}).click();
        await checkEdit(back.child, attached);
    }
    const dock = async view => {
        await focus(view.child, view.id);
        await Promise.all([view.child.waitForEvent('close'), view.child.locator('#dock').click()]);
    };
    await dock(a);
    await dock(b);
    await focus(editor, parent.id);
    await checkView(editor, original);
    await editor.evaluate(() => window.ScratchBlocks.getMainWorkspace().undo(true));
    await checkEdit(editor, false);
    await editor.evaluate(() => window.ScratchBlocks.getMainWorkspace().undo(false));
    await checkEdit(editor, true);

    const restored = await state(true);
    assert.deepEqual({...restored, ids: original.ids}, original);
    await checkView(editor, restored);
    const reopened = await open(restored.ids.loop);
    await checkView(reopened.child, restored);
    await dock(reopened);
    report.checks.push('Dynamic C/E stacks retain their branch inputs and connected blocks in two windows, shared Undo/Redo, after docking, and after SB3 reload.');
}

const customFieldsFixture = `
Scratch.extensions.register({
    getInfo() {
        return {
            id: 'windowfields', name: 'Window fields',
            customFieldTypes: {
                caption: {output: 'String', outputShape: 2, implementation: {type: 'field_input'}},
                setting: {output: 'String', outputShape: 2, implementation: {
                    type: 'field_dropdown', options: [['First label', 'first-id'], ['Second label', 'second-id']]
                }}
            },
            blocks: [{opcode: 'display', blockType: Scratch.BlockType.REPORTER, text: 'fixture [NOTE] [MODE]',
                arguments: {NOTE: {type: 'caption', defaultValue: 'original'}, MODE: {type: 'setting', defaultValue: 'first-id'}}}]
        };
    },
    display(args) {return args.NOTE + ':' + args.MODE;}
});
`;

async function checkCodeCustomFields ({editor, a, b, focus, open, parent, sprite}) {
    const editedText = '改訂 <&> note';
    const state = (reload = false) => editor.evaluate(async ({name, reload}) => {
        if (reload) await vm.loadProject(await (await vm.saveProjectSb3()).arrayBuffer());
        const target = vm.runtime.targets.find(item => item.getName() === name);
        if (reload) vm.setEditingTarget(target.id);
        const {blocks} = target;
        const root = blocks.getScripts().map(id => blocks.getBlock(id)).find(block => block.opcode === 'windowfields_display');
        const shadows = ['NOTE', 'MODE'].map(name => {
            const input = root.inputs[name];
            if (input.block !== input.shadow) throw new Error('Custom field shadow is disconnected');
            return blocks.getBlock(input.shadow);
        });
        return {root: root.id, ids: shadows.map(block => block.id),
            types: shadows.map(block => block.opcode),
            values: shadows.map(block => {
                const field = block.fields[`field_${block.opcode}`];
                if (!field) throw new Error(`Missing field for ${block.opcode}: ${JSON.stringify(block.fields)}`);
                return field.value;
            })};
    }, {name: sprite.name, reload});
    const field = (page, id) => page.locator(`.blocklyBlockCanvas [data-id="${id.replace(/[\\"]/g, '\\$&')}"]`);
    const checkView = async (page, {ids, values}) => {
        await until(async () => {
            const text = await field(page, ids[0]).textContent();
            const dropdown = await field(page, ids[1]).textContent();
            const label = values[1] === 'first-id' ? 'First label' : 'Second label';
            return text.replace(/\s/g, ' ').includes(values[0]) && dropdown.replace(/\s/g, ' ').includes(label);
        }, 'the text and dropdown show the saved extension values');
    };
    const expectValues = async (page, values) => {
        const current = await until(async () => {
            const current = await state();
            return current.values.every((value, index) => value === values[index]) && current;
        }, 'the VM stores both custom field values');
        assert.deepEqual(current.types, ['windowfields_caption', 'windowfields_setting']);
        await checkView(page, current);
    };
    const original = await state();
    assert.deepEqual(original.values, ['original', 'first-id']);
    for (const page of [editor, a.child, b.child]) await checkView(page, original);
    await activateCodeView(a, b, focus);
    await field(a.child, original.ids[0]).locator('.blocklyEditableText').click({force: true});
    const input = a.child.locator('.blocklyHtmlInput');
    await input.fill(editedText);
    await input.press('Enter');
    await expectValues(b.child, [editedText, 'first-id']);

    await activateCodeView(b, a, focus);
    await field(b.child, original.ids[1]).locator('.blocklyDropdownText').click({force: true});
    await b.child.locator('.blocklyDropDownDiv .goog-menuitem').filter({hasText: 'Second label'}).click();
    await expectValues(a.child, [editedText, 'second-id']);

    for (const [front, back, action, values] of [
        [a, b, 'Undo', [editedText, 'first-id']], [b, a, 'Undo', original.values],
        [a, b, 'Redo', [editedText, 'first-id']], [b, a, 'Redo', [editedText, 'second-id']]
    ] as const) {
        await activateCodeView(front, back, focus);
        await front.child.getByRole('button', {name: action, exact: true}).click();
        await expectValues(back.child, values);
    }
    const dock = async view => {
        await focus(view.child, view.id);
        await Promise.all([view.child.waitForEvent('close'), view.child.locator('#dock').click()]);
    };
    await dock(a);
    await dock(b);
    await focus(editor, parent.id);
    await expectValues(editor, [editedText, 'second-id']);
    const restored = await state(true);
    assert.deepEqual(restored.values, [editedText, 'second-id']);
    assert.deepEqual(restored.types, original.types);
    await checkView(editor, restored);
    const result = await editor.evaluate(blockId => new Promise((resolve, reject) => {
        const onReport = ({id, value}) => {
            if (id !== blockId) return;
            clearTimeout(timeout);
            vm.removeListener('VISUAL_REPORT', onReport);
            resolve(value);
        };
        const timeout = setTimeout(() => {
            vm.removeListener('VISUAL_REPORT', onReport);
            reject(new Error('Parent VM did not report the custom field values'));
        }, 4000);
        vm.on('VISUAL_REPORT', onReport);
        vm.blockListener({element: 'stackclick', blockId});
    }), restored.root);
    assert.equal(result, `${editedText}:second-id`);
    const reopened = await open(restored.root);
    await checkView(reopened.child, restored);
    await dock(reopened);
    report.checks.push('Custom text and dropdown values round-trip through two code windows, shared Undo/Redo, docking, and SB3 reload, then reach the extension in the parent VM.');
}

async function checkCodePopouts ({editor, context, control}, {
    withBackpack = false, native = false, targetSync = false, stageCode = false, comments = false, variableScope = null, broadcast = false, procedures = false, extensions = false, dynamic = false, dynamicBranches = false, customFields = false
} = {}) {
    const id = 'stage-six-shared-block';
    const parent = (await control('windows')).find(window => window.kind === 'editor');
    await control('layout', parent.id);
    const focus = async (page, windowId) => {
        await until(async () => {
            await control('focus', windowId);
            return page.evaluate(() => document.hasFocus());
        }, 'native window focus');
    };
    const backpackTargets = withBackpack ? await seedBackpack(editor) : null;
    const sprites = await editor.evaluate(async ({blockId, targetSync, comments, scopeFixture, broadcastFixture, procedureFixture, extensions, dynamicFixture, customFieldsURL}) => {
        const first = vm.editingTarget;
        const seeded = [{id: first.id, name: first.getName(), blockId}];
        if (targetSync || comments) {
            await vm.duplicateSprite(first.id);
            const second = vm.editingTarget;
            if (targetSync) {
                second.getCostumes().push({...vm.runtime.getTargetForStage().getCostumes()[0]});
                second.setCostume(second.getCostumes().length - 1);
            }
            const secondBlock = `${blockId}-second`;
            second.blocks.createBlock({id: secondBlock, opcode: 'looks_show', next: null, parent: null,
                topLevel: true, shadow: false, inputs: {}, fields: {}, x: 100, y: 110});
            const gotoId = `${secondBlock}-goto`;
            const menuId = `${secondBlock}-menu`;
            second.blocks.createBlock({id: gotoId, opcode: 'motion_goto', next: null, parent: null,
                topLevel: true, shadow: false, inputs: {TO: {name: 'TO', block: menuId, shadow: menuId}},
                fields: {}, x: 240, y: 280});
            second.blocks.createBlock({id: menuId, opcode: 'motion_goto_menu', next: null, parent: gotoId,
                topLevel: false, shadow: true, inputs: {}, fields: {TO: {name: 'TO', value: first.getName()}}});
            seeded.push({id: second.id, name: second.getName(), blockId: secondBlock});
            vm.setEditingTarget(first.id);
        }
        vm.editingTarget.blocks.createBlock({
            id: blockId, opcode: 'looks_hide', next: null, parent: null, topLevel: true, shadow: false,
            inputs: {}, fields: {}, x: 90, y: 100
        });
        if (scopeFixture) {
            const {name, type, fieldName, reporterOpcode, statementOpcode, globalId, localId} = scopeFixture;
            const stage = vm.runtime.getTargetForStage();
            stage.createVariable(globalId, name, type, false);
            first.createVariable(localId, name, type, false);
            if (type === 'list') {
                stage.variables[globalId].value = ['global item'];
                first.variables[localId].value = ['local item'];
            }
            for (const [id, opcode, x] of [
                ['scope-reporter', reporterOpcode, 160], ['scope-statement', statementOpcode, 340]
            ]) {
                first.blocks.createBlock({id, opcode, x, y: 160, next: null, parent: null, topLevel: true,
                    shadow: false, inputs: {},
                    fields: {[fieldName]: {name: fieldName, id: globalId, value: name, variableType: type}}});
            }
        }
        if (broadcastFixture) {
            const {messages, receive, send, wait} = broadcastFixture;
            const stage = vm.runtime.getTargetForStage();
            for (const [id, name] of Object.entries(messages)) stage.createVariable(id, name, 'broadcast_msg', false);
            const [alpha, beta] = Object.keys(messages);
            for (const [index, opcode] of [receive, send, wait].entries()) {
                const id = opcode === wait ? beta : alpha;
                const fields = {BROADCAST_OPTION: {name: 'BROADCAST_OPTION', id, value: messages[id], variableType: 'broadcast_msg'}};
                const blockId = `broadcast-test-${opcode}`;
                const menu = `${blockId}-menu`;
                const isReceiver = opcode === receive;
                first.blocks.createBlock({id: blockId, opcode, x: 135, y: 160 + index * 80,
                    next: null, parent: null, topLevel: true, shadow: false, fields: isReceiver ? fields : {},
                    inputs: isReceiver ? {} : {BROADCAST_INPUT: {name: 'BROADCAST_INPUT', block: menu, shadow: menu}}});
                if (!isReceiver) first.blocks.createBlock({id: menu, opcode: 'event_broadcast_menu', next: null,
                    parent: blockId, topLevel: false, shadow: true, inputs: {}, fields: structuredClone(fields)});
            }
        }
        if (procedureFixture) first.blocks.blocklyListen({type: 'create', blockId: 'procedure-test-definition',
            xml: {outerHTML: procedureFixture.trim().replace(/>\s+</g, '><')}});
        if (extensions) {
            vm.extensionManager.loadExtensionIdSync('pen');
            const {xml} = vm.runtime.getBlocksXML(first).find(category => category.id === 'pen');
            const source = new DOMParser().parseFromString(xml, 'text/xml').querySelector('block[type="pen_setPenColorParamTo"]');
            source.setAttribute('id', 'extension-test-pen');
            source.setAttribute('x', '140');
            source.setAttribute('y', '190');
            source.querySelector('value[name="VALUE"] shadow').setAttribute('id', 'extension-test-value');
            first.blocks.blocklyListen({type: 'create', blockId: 'extension-test-pen', xml: {outerHTML: source.outerHTML}});
        }
        if (dynamicFixture) {
            await vm.extensionManager.loadExtensionURL(dynamicFixture.url);
            for (const {id, xml} of dynamicFixture.stacks) {
                first.blocks.blocklyListen({type: 'create', blockId: id, xml: {outerHTML: xml.trim().replace(/>\s+</g, '><')}});
            }
        }
        if (customFieldsURL) {
            await vm.extensionManager.loadExtensionURL(customFieldsURL);
            const {xml} = vm.runtime.getBlocksXML(first).find(category => category.id === 'windowfields');
            const block = new DOMParser().parseFromString(xml, 'text/xml').querySelector('block[type="windowfields_display"]');
            block.setAttribute('id', 'custom-fields-test');
            block.setAttribute('x', '100');
            block.setAttribute('y', '185');
            for (const input of ['NOTE', 'MODE']) {
                block.querySelector(`value[name="${input}"] shadow`).setAttribute('id', `custom-fields-${input}`);
            }
            first.blocks.blocklyListen({type: 'create', blockId: 'custom-fields-test', xml: {outerHTML: block.outerHTML}});
        }
        vm.refreshWorkspace();
        return seeded;
    }, {blockId: id, targetSync, comments, scopeFixture: variableScopeFixtures[variableScope],
        broadcastFixture: broadcast ? broadcastFixture : null, procedureFixture: procedures ? procedureFixture : null, extensions,
        customFieldsURL: customFields ? `data:text/javascript,${encodeURIComponent(customFieldsFixture)}` : null,
        dynamicFixture: dynamicBranches ? dynamicBranchFixture : dynamic ? {
            url: `data:text/javascript,${encodeURIComponent(dynamicExtensionFixture)}`,
            stacks: [{
                id: 'dynamic-test-command',
                xml: `<block type="windowdynamic_shape" id="dynamic-test-command" x="80" y="155">
                    ${dynamicShapeMutation('command', 'dynamic command', 'AMOUNT')}
                    <value name="AMOUNT">
                        <shadow type="math_number" id="dynamic-test-fallback"><field name="NUM">9</field></shadow>
                        <block type="windowdynamic_shape" id="dynamic-test-reporter">
                            ${dynamicShapeMutation('reporter', 'dynamic reporter', 'VALUE')}
                            <value name="VALUE"><shadow type="math_number" id="dynamic-test-number"><field name="NUM">3</field></shadow></value>
                        </block>
                    </value>
                    <next><block type="looks_show" id="dynamic-test-tail"></block></next>
                </block>`
            }, {
                id: 'dynamic-test-if',
                xml: `<block type="control_if" id="dynamic-test-if" x="80" y="260">
                    <value name="CONDITION"><block type="windowdynamic_shape" id="dynamic-test-predicate">
                        ${dynamicShapeMutation('Boolean', 'dynamic predicate', 'FLAG')}
                        <value name="FLAG"><shadow type="math_number" id="dynamic-test-flag"><field name="NUM">4</field></shadow></value>
                    </block></value>
                </block>`
            }]
        } : null});
    const targetId = sprites[0].id;
    const coordinates = () => editor.evaluate(({targetId, id}) => {
        const {x, y} = vm.runtime.getTargetById(targetId).blocks.getBlock(id);
        return {x, y};
    }, {targetId, id});
    const block = (page, blockId = id) => page.locator(`[data-id="${blockId}"]`).first();
    const original = await coordinates();
    await block(editor).waitFor();
    await focus(editor, parent.id);
    const editorClick = locator => native ? click(control, parent.id, locator) : locator.click();
    await toggleUndockButtons(editor, editorClick);
    if (native && !await readUndockButtonsChecked(editor)) {
        await focus(editor, parent.id);
        await toggleUndockButtons(editor, editorClick);
    }
    const action = editor.locator('[class*="_tab-action_"]').getByRole('button', {
        name: /^(Open in another window|別画面で開く)$/
    });

    async function open(expectedBlockId = id) {
        await focus(editor, parent.id);
        await action.focus();
        const [child] = await Promise.all([context.waitForEvent('page'), editorClick(action)]);
        await child.waitForURL(/\/code-popout\.html#/);
        child.on('pageerror', error => report.errors.push(error.message));
        const native = await until(async () => (await control('windows')).find(window => window.url === child.url()),
            'native code window');
        assert.deepEqual(native.preferences, {sandbox: true, contextIsolation: true, nodeIntegration: false, preload: false});
        await block(child, expectedBlockId).waitFor();
        assert.equal(await child.evaluate(() => !window.opener && !window.vm && typeof EditorPreload === 'undefined'), true);
        return {child, id: native.id};
    }

    const a = await open();
    const b = await open();
    assert.equal((await control('windows')).filter(window => window.kind === 'code').length, 2);
    if (native) {
        await checkNativeCodeBackpack({editor, context, control}, a, b, backpackTargets, id);
        return;
    }
    if (targetSync) {
        await checkCodeTargetSync({editor, a, b, focus, parent, sprites});
        return;
    }
    if (stageCode) {
        await checkStageCode({editor, a, b, focus, parent, sprite: sprites[0]});
        return;
    }
    if (customFields) {
        await checkCodeCustomFields({editor, a, b, focus, open, parent, sprite: sprites[0]});
        return;
    }
    if (dynamicBranches) {
        await checkCodeDynamicBranches({editor, a, b, focus, open, parent, sprite: sprites[0]});
        return;
    }
    if (dynamic) {
        await checkCodeDynamic({editor, a, b, focus, open, parent, sprite: sprites[0]});
        return;
    }
    if (extensions) {
        await checkCodeExtensions({editor, a, b, focus, parent, sprite: sprites[0]});
        return;
    }
    if (procedures) {
        await checkCodeProcedures({editor, a, b, focus, parent, sprite: sprites[0]});
        return;
    }
    if (broadcast) {
        await checkCodeBroadcast({editor, a, b, focus, parent, sprite: sprites[0]});
        return;
    }
    if (variableScope) {
        await checkVariableScope({editor, a, b, focus, open, parent, sprite: sprites[0], kind: variableScope});
        return;
    }
    if (comments) {
        await checkCodeComments({editor, a, b, focus, parent, sprites});
        return;
    }
    assert.equal(await editor.evaluate(() =>
        window.open('about:blank', `tw-plus-code-${crypto.randomUUID()}`) === null), true);
    const inert = view => view.child.locator('#mount').evaluate(element => element.inert);
    const editorInert = () => editor.evaluate(() => window.ScratchBlocks.getMainWorkspace().getParentSvg().parentElement.inert);
    const history = async (view, name) => {
        await focus(view.child, view.id);
        await until(async () => !(await inert(view)), `code window is editable for ${name}`);
        await view.child.getByRole('button', {name, exact: true}).click();
    };
    await focus(a.child, a.id);
    await until(async () => !(await inert(a)) && await inert(b) && await editorInert(), 'A holds the only edit lease');
    const position = await block(a.child).boundingBox();
    assert.ok(position);
    await a.child.mouse.move(position.x + 12, position.y + 11);
    await a.child.mouse.down();
    await a.child.mouse.move(position.x + 82, position.y + 53, {steps: 8});
    await a.child.mouse.up();
    await until(async () => (await coordinates()).x > original.x, 'moving the block edits the parent VM');
    const edited = await coordinates();
    const rendered = page => block(page).getAttribute('transform');
    await until(async () => await rendered(a.child) === await rendered(b.child), 'B renders the same edited position');
    assert.equal(await b.child.getByRole('button', {name: 'Undo', exact: true}).isDisabled(), true);

    await focus(b.child, b.id);
    await until(async () => await inert(a) && !(await inert(b)) && await editorInert(), 'B takes the edit lease');
    await history(b, 'Undo');
    await until(async () => (await coordinates()).x === original.x &&
        await rendered(a.child) === await rendered(b.child), 'one undo updates the VM and both views');
    assert.deepEqual(await coordinates(), original);
    await history(b, 'Redo');
    await until(async () => (await coordinates()).x === edited.x &&
        await rendered(a.child) === await rendered(b.child), 'one redo updates the VM and both views');
    assert.deepEqual(await coordinates(), edited);
    report.checks.push('One parent VM, two native ScratchBlocks views, exclusive foreground editing and shared undo/redo');

    await focus(editor, parent.id);
    await until(async () => await inert(a) && await inert(b) && !(await editorInert()), 'the native editor regains editing');
    await editor.evaluate(() => window.ScratchBlocks.getMainWorkspace().undo(false));
    await until(async () => (await coordinates()).x === original.x &&
        await rendered(a.child) === await rendered(b.child), 'the docked workspace uses the same history');
    await editor.evaluate(blockId => window.ScratchBlocks.getMainWorkspace().getBlockById(blockId).moveBy(36, 28), id);
    await until(async () => (await coordinates()).x > original.x &&
        await rendered(a.child) === await rendered(editor) && await rendered(b.child) === await rendered(editor),
    'an edit in the docked workspace reaches both child views');
    const parentEdit = await coordinates();
    await focus(b.child, b.id);
    await until(async () => !(await inert(b)), 'B takes editing after the docked workspace');
    assert.equal(await b.child.getByRole('button', {name: 'Redo', exact: true}).isDisabled(), true);
    await history(b, 'Undo');
    await until(async () => (await coordinates()).x === original.x, 'B undoes the parent edit');
    await history(b, 'Redo');
    await until(async () => (await coordinates()).x === parentEdit.x, 'redo persists in the parent VM');
    const showBlock = b.child.locator('.blocklyFlyout').getByText('show', {exact: true});
    if (!await showBlock.isVisible()) {
        await b.child.locator('.scratchCategoryMenuItemLabel').filter({hasText: /^Looks$/}).click();
    }
    const sample = await showBlock.boundingBox();
    assert.ok(sample);
    await b.child.mouse.move(sample.x + sample.width / 2, sample.y + sample.height / 2);
    await b.child.mouse.down();
    await b.child.mouse.move(410, 310, {steps: 12});
    await b.child.mouse.up();
    const addedId = await until(() => editor.evaluate(() => vm.editingTarget.blocks.getScripts()
        .find(scriptId => vm.editingTarget.blocks.getBlock(scriptId).opcode === 'looks_show')), 'the toolbox adds code to the parent VM');
    const added = page => page.locator(`[data-id="${addedId}"]`).first();
    await added(a.child).waitFor();
    await history(b, 'Undo');
    await added(a.child).waitFor({state: 'detached'});
    await history(b, 'Redo');
    await added(a.child).waitFor();
    if (backpackTargets) {
        await focus(editor, parent.id);
        await editor.locator('[class*="backpack_backpack-header"]').click();
        await editor.getByText(itemName, {exact: true}).waitFor();
        await editor.getByRole('button', {name: /^(Undock Backpack|バックパックを別画面で開く)$/}).click();
        const frame = editor.getByRole('region', {name: /^(Backpack|バックパック)$/});
        const opened = context.waitForEvent('page');
        await frame.getByRole('button', {name: /^(Move to browser window|別ウィンドウへ移す)$/}).click();
        const backpack = await opened;
        await backpack.waitForURL(/\/backpack-popout\.html#/);
        backpack.on('pageerror', error => report.errors.push(error.message));
        const source = (await control('windows')).find(window => window.kind === 'backpack');
        await focus(backpack, source.id);
        const handle = backpack.getByTestId('backpack-script-drag');
        await handle.waitFor();
        const sourceCDP = await context.newCDPSession(backpack);
        await sourceCDP.send('Input.setInterceptDrags', {enabled: true});
        const grip = await handle.boundingBox();
        assert.ok(grip);
        const drag = once(sourceCDP, 'Input.dragIntercepted', {signal: AbortSignal.timeout(10000)});
        const x = grip.x + grip.width / 2;
        const y = grip.y + grip.height / 2;
        await sourceCDP.send('Input.dispatchMouseEvent', {type: 'mouseMoved', x, y});
        await sourceCDP.send('Input.dispatchMouseEvent', {type: 'mousePressed', x, y,
            button: 'left', buttons: 1, clickCount: 1});
        await sourceCDP.send('Input.dispatchMouseEvent', {type: 'mouseMoved', x: x + 24, y,
            button: 'left', buttons: 1});
        const [{data}] = await drag;
        assert.ok(data.items.some(item => item.mimeType === mime));
        await sourceCDP.send('Input.dispatchDragEvent', {type: 'dragCancel', x, y, data});
        await sourceCDP.send('Input.dispatchMouseEvent', {type: 'mouseReleased', x: x + 24, y,
            button: 'left', clickCount: 1});
        await sourceCDP.detach();

        await control('layout', a.id);
        await focus(b.child, b.id);
        await until(async () => await inert(a) && !(await inert(b)), 'only B edits before the drop');
        const dropCDP = await context.newCDPSession(a.child);
        const drop = async () => {
            const zone = a.child.locator('#drop-zone');
            await zone.waitFor();
            const box = await zone.boundingBox();
            assert.ok(box);
            for (const type of ['dragEnter', 'dragOver', 'drop']) {
                await dropCDP.send('Input.dispatchDragEvent', {type, x: box.x + box.width * 0.8, y: box.y + 160, data});
            }
        };
        const imported = () => editor.evaluate(targets => {
            const getBlocks = id => vm.runtime.getTargetById(id).blocks;
            const blocks = getBlocks(targets.a);
            const first = blocks.getScripts().map(id => blocks.getBlock(id))
                .find(block => block.opcode === 'looks_hide' && blocks.getBlock(block.next)?.opcode === 'looks_show');
            return {id: first?.id, next: first?.next, scripts: blocks.getScripts().length,
                other: getBlocks(targets.b).getScripts().length, selected: vm.editingTarget.id};
        }, backpackTargets);
        assert.deepEqual(await imported(), {id: undefined, next: undefined, scripts: 2, other: 0, selected: targetId});
        await drop();
        const copy = await until(async () => {
            const state = await imported();
            return state.id && state;
        }, 'Backpack stack reaches the back code window');
        assert.equal(copy.scripts, 3);
        assert.equal(copy.other, 0);
        assert.equal(copy.selected, targetId);
        const showCopy = (page, blockId) => page.locator(`[data-id="${blockId}"]`).first();
        for (const {child} of [a, b]) {
            await showCopy(child, copy.id).waitFor();
            await showCopy(child, copy.next).waitFor();
        }
        assert.equal(await inert(a), true);
        assert.equal(await a.child.evaluate(() => document.hasFocus()), false);
        assert.equal(await b.child.evaluate(() => document.hasFocus()), true);
        await until(async () => !(await inert(b)), 'B keeps editing after the back window drop');
        const undoCopy = b.child.getByRole('button', {name: 'Undo', exact: true});
        assert.equal(await undoCopy.isEnabled(), true, 'the drop publishes undo history');
        await drop();
        assert.equal(await undoCopy.isEnabled(), true, 'a replay keeps the existing undo history');
        await dropCDP.detach();
        await history(b, 'Undo');
        await until(async () => (await imported()).scripts === 2, 'one shared undo removes the entire copied stack');
        assert.deepEqual(await imported(), {id: undefined, next: undefined, scripts: 2, other: 0, selected: targetId});
        assert.deepEqual(await coordinates(), parentEdit);
        await added(a.child).waitFor();
        await added(b.child).waitFor();
        await showCopy(a.child, copy.id).waitFor({state: 'detached'});
        await showCopy(b.child, copy.id).waitFor({state: 'detached'});
        await history(b, 'Redo');
        await showCopy(a.child, copy.next).waitFor();
        await showCopy(b.child, copy.next).waitFor();
        assert.deepEqual(await imported(), copy);
        await history(b, 'Undo');
        await showCopy(a.child, copy.id).waitFor({state: 'detached'});
        await focus(backpack, source.id);
        await Promise.all([backpack.waitForEvent('close'), backpack.getByRole('button', {name: dockLabel}).press('Enter')]);
        await editor.getByText(itemName, {exact: true}).waitFor();
        report.checks.push('Real Backpack to background code window via CDP drag: both views update, no lease or target change, one undo removes both imported blocks, redo restores them, replay is rejected and Backpack docks');
    }
    await Promise.all([b.child.waitForEvent('close'), b.child.getByRole('button', {name: 'Return to editor'}).click()]);
    await Promise.all([a.child.waitForEvent('close'), control('close', a.id)]);
    await focus(editor, parent.id);
    await until(async () => !(await editorInert()), 'closing all windows releases the docked workspace');
    assert.deepEqual(await coordinates(), parentEdit);
    await added(editor).waitFor();
    const restored = await editor.evaluate(async () => {
        const targetName = vm.editingTarget.getName();
        const sb3 = await vm.saveProjectSb3();
        await vm.loadProject(await sb3.arrayBuffer());
        const target = vm.runtime.targets.find(candidate => candidate.isOriginal && candidate.getName() === targetName);
        const scripts = target.blocks.getScripts().map(blockId => target.blocks.getBlock(blockId));
        const block = scripts.find(script => script.opcode === 'looks_hide');
        return {x: block?.x, y: block?.y, added: scripts.find(script => script.opcode === 'looks_show')?.opcode};
    });
    assert.deepEqual(restored, {...parentEdit, added: 'looks_show'});
    report.checks.push('The docked workspace shares edits and undo; button and native close preserve edits and release editing');
    report.checks.push('SB3 save and reload retains the moved and newly created blocks');
}

async function checkExternalTargetPanels ({editor, context, control}) {
    const parent = (await control('windows')).find(window => window.kind === 'editor');
    await control('layout', parent.id);
    const select = {
        'sprite-properties': /^(Sprite|スプライト)$/,
        'sprite-list': /^(Sprite list|スプライト一覧)$/
    };
    const heading = kind => editor.getByRole('heading', {name: select[kind]});
    const dock = kind => heading(kind).locator('../..').getByRole('button', {name: /^(Return here|ここに戻す)$/});
    const settings = page => page.getByRole('region', {name: spritePropertiesLabel});
    const grid = page => page.locator('[data-backdrop-placement]');
    const readTarget = () => editor.evaluate(() => {
        const {id, x, y, visible, direction, size, rotationStyle} = vm.editingTarget;
        return {id, x, y, visible, direction, size, rotationStyle, name: vm.editingTarget.getName()};
    });
    const [first, second] = await editor.evaluate(async () => {
        const original = vm.editingTarget.id;
        await vm.duplicateSprite(original);
        const other = vm.runtime.targets.find(target => !target.isStage && target.isOriginal && target.id !== original);
        vm.renameSprite(other.id, 'Native target two');
        vm.renameSprite(original, 'Native target one');
        vm.setEditingTarget(original);
        return [original, other.id];
    });
    const initial = await readTarget();
    assert.equal(initial.id, first);
    await toggleUndockButtons(editor);

    const focus = async id => {
        await until(async () => {
            const state = await control('focus', id);
            return state.focused && state.contentFocused;
        }, 'native window focus');
    };
    async function open(kind) {
        await focus(parent.id);
        const action = heading(kind).locator('..').getByRole('button', {name: /^(Open in another window|別画面で開く)$/});
        await action.focus();
        await click(control, 'editor', action);
        const child = await until(() => context.pages().find(page =>
            page.url().startsWith(`tw-editor://./gui/${kind}-popout.html#`)), kind);
        child.on('pageerror', error => report.errors.push(error.message));
        const native = (await control('windows')).find(window => window.kind === kind);
        assert.deepEqual(native.preferences, {sandbox: true, contextIsolation: true, nodeIntegration: false, preload: false});
        await control('layout', native.id);
        const panel = kind === 'sprite-properties' ? settings(child) : grid(child);
        await panel.waitFor();
        assert.equal(await child.evaluate(() => !window.opener && !window.vm && typeof EditorPreload === 'undefined'), true);
        return {child, id: native.id};
    }

    const props = await open('sprite-properties');
    const list = await open('sprite-list');
    assert.equal((await control('windows')).length, 3);
    assert.equal(await editor.evaluate(() =>
        window.open('about:blank', `tw-plus-sprite-list-${crypto.randomUUID()}`) === null), true);
    assert.equal(await settings(editor).count(), 0);
    assert.equal(await grid(editor).count(), 0);

    const secondTile = grid(list.child).getByText('Native target two', {exact: true});
    await focus(list.id);
    await click(control, 'sprite-list', secondTile);
    await until(async () => (await readTarget()).id === second, 'list selects the second sprite in the parent VM');
    const form = settings(props.child);
    const name = form.locator('input[type="text"]');
    await until(async () => await name.inputValue() === 'Native target two', 'properties follow the shared selection');
    await focus(props.id);
    for (const [label, value] of [
        [/^x$/i, '52'], [/^y$/i, '-32'], [/^(Size|大きさ)$/i, '75'], [/^(Direction|向き)$/i, '45']
    ]) {
        const input = form.getByRole('spinbutton', {name: label});
        await input.fill(value);
        await input.press('Enter');
    }
    await name.fill('Renamed in its own window');
    await name.press('Enter');
    const selects = form.getByRole('combobox');
    await selects.nth(0).selectOption('false');
    await selects.nth(1).selectOption('left-right');
    await until(async () => {
        const selected = await readTarget();
        return selected.name === 'Renamed in its own window' && selected.x === 52 && selected.y === -32 &&
            selected.size === 75 && selected.direction === 45 && !selected.visible && selected.rotationStyle === 'left-right';
    }, 'edits from the child reach the shared VM');
    await grid(list.child).getByText('Renamed in its own window', {exact: true}).waitFor();

    const backdrop = grid(list.child).getByRole('button', {name: /^(Backdrops|背景)$/});
    await backdrop.locator('img').waitFor();
    await list.child.locator('[data-backdrop-placement="top-right"]').waitFor();
    await focus(list.id);
    await backdrop.focus();
    await control('layout-tall', list.id);
    await list.child.locator('[data-backdrop-placement="bottom-right"]').waitFor();
    assert.ok(await backdrop.evaluate(node => node.ownerDocument.activeElement === node));
    await click(control, 'sprite-list', backdrop);
    await until(() => editor.evaluate(() => vm.editingTarget.isStage), 'backdrop tile selects the stage');
    assert.ok(await name.isDisabled());
    const firstTile = grid(list.child).getByText('Native target one', {exact: true});
    await click(control, 'sprite-list', firstTile);
    await until(async () => (await readTarget()).id === first, 'first sprite is selected again');
    assert.deepEqual(await readTarget(), initial);

    await focus(parent.id);
    await Promise.all([list.child.waitForEvent('close'), click(control, 'editor', dock('sprite-list'))]);
    await grid(editor).getByText('Renamed in its own window', {exact: true}).waitFor();
    await Promise.all([props.child.waitForEvent('close'), control('close', props.id)]);
    await settings(editor).waitFor();
    assert.deepEqual(await readTarget(), initial);
    report.checks.push('Separate native sprite properties and sprite list share one VM and selection; edited values stay on their sprite');

    const reopenedProps = await open('sprite-properties');
    const reopenedList = await open('sprite-list');
    await focus(parent.id);
    await Promise.all([reopenedProps.child.waitForEvent('close'), click(control, 'editor', dock('sprite-properties'))]);
    await Promise.all([reopenedList.child.waitForEvent('close'), control('close', reopenedList.id)]);
    await settings(editor).waitFor();
    await grid(editor).waitFor();
    assert.equal((await control('windows')).length, 1);
    report.checks.push('Both panels dock through the parent button and native close; the backdrop tile reflows and preserves focus');
}

async function checkStageDisplayMenu ({editor, context, control}) {
    const parent = (await control('windows')).find(window => window.kind === 'editor');
    await control('layout', parent.id);
    const canvas = editor.locator('[data-gui-stage] canvas').first();
    await canvas.evaluate(node => { window.originalStageCanvas = node; });
    const displayLabel = /^(Stage display|ステージの表示)$/;
    const display = editor.getByRole('button', {name: displayLabel});
    const menu = editor.getByRole('menu', {name: displayLabel});
    const undock = menu.getByRole('menuitem', {name: /^(Open in a separate window|別ウィンドウで開く)$/});
    const open = async () => {
        await control('focus', parent.id);
        await display.click();
        const [child] = await Promise.all([
            context.waitForEvent('page'), undock.click()
        ]);
        await child.waitForURL(/\/stage-popout\.html#/);
        child.on('pageerror', error => report.errors.push(error.message));
        await child.locator('[data-gui-stage] canvas').first().waitFor();
        return child;
    };

    const child = await open();
    const native = (await control('windows')).find(window => window.kind === 'stage');
    await control('focus', native.id);
    await child.locator('[class*="green-flag_green-flag_"]').first().waitFor();
    await child.getByRole('button', {name: displayLabel}).click();
    await Promise.all([child.waitForEvent('close'),
        child.getByRole('menuitem', {name: /^(Dock stage|ドックに戻す)$/}).click()]);
    assert.ok(await canvas.evaluate(node => node === window.originalStageCanvas));

    const reopened = await open();
    const childWindow = (await control('windows')).find(window => window.kind === 'stage');
    assert.ok(childWindow);
    await Promise.all([reopened.waitForEvent('close'), control('close', childWindow.id)]);
    assert.ok(await canvas.evaluate(node => node === window.originalStageCanvas));
    await control('focus', parent.id);
    await display.click();
    assert.equal(await undock.getAttribute('aria-disabled'), 'false');
    report.checks.push('Stage display menu opens and docks a native window and resets after OS close, preserving the canvas');
}

async function checkStagePopout ({editor, context, control}) {
    const parent = (await control('windows')).find(window => window.kind === 'editor');
    await control('layout', parent.id);
    await control('focus', parent.id);
    const canvas = editor.locator('[data-gui-stage] canvas').first();
    const stageAction = editor.locator('[class*="stage-action-slot_"]').getByRole('button', {
        name: /^(Open in another window|別画面で開く)$/
    });
    const focus = async (page, id) => {
        await until(async () => {
            if (await page.evaluate(() => document.hasFocus())) return true;
            await control('focus', id);
            return false;
        }, 'native window focus');
    };
    const monitorId = 'stage-popout-monitor';
    await editor.evaluate(async id => {
        const project = JSON.parse(vm.toJSON());
        const stage = project.targets.find(target => target.isStage);
        stage.variables[id] = ['Stage monitor', 42];
        stage.blocks['stage-popout-flag'] = {opcode: 'event_whenflagclicked', next: 'stage-popout-ask',
            parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 40, y: 40};
        stage.blocks['stage-popout-ask'] = {opcode: 'sensing_askandwait', next: null, parent: 'stage-popout-flag',
            inputs: {QUESTION: [1, [10, 'Stage popout question']]}, fields: {}, shadow: false, topLevel: false};
        project.monitors.push({id, mode: 'default', opcode: 'data_variable', params: {VARIABLE: 'Stage monitor'},
            spriteName: null, value: 42, width: 0, height: 0, x: 24, y: 24, visible: true});
        await vm.loadProject(project);
    }, monitorId);
    const monitor = page => page.locator(`[data-id="${monitorId}"][data-opcode="data_variable"]`);
    await monitor(editor).waitFor();
    await canvas.evaluate(node => {
        window.stage155 = {vm, loop: vm.runtime.frameLoop, renderer: vm.renderer, canvas: node as HTMLCanvasElement, lost: 0, input: [], frames: 0};
        node.addEventListener('webglcontextlost', () => window.stage155.lost++);
        const post = vm.postIOData.bind(vm);
        vm.postIOData = (device, data) => {
            if (device === 'keyboard' || device === 'mouse') window.stage155.input.push({device, data});
            return post(device, data);
        };
        const draw = vm.renderer.draw.bind(vm.renderer);
        vm.renderer.draw = (...args) => {
            window.stage155.frames++;
            return draw(...args);
        };
        vm.editingTarget.setXY(-110, 30);
    });
    await toggleUndockButtons(editor);

    async function open() {
        await control('focus', parent.id);
        await stageAction.focus();
        await editor.keyboard.press('Enter');
        const child = await until(() => context.pages().find(page =>
            page.url().startsWith('tw-editor://./gui/stage-popout.html#')), 'Stage BrowserWindow');
        child.on('pageerror', error => report.errors.push(error.message));
        const screenCanvas = child.locator('[data-gui-stage] canvas').first();
        await screenCanvas.waitFor();
        await editor.waitForFunction(() => stage155.canvas.ownerDocument !== document &&
            stage155.canvas === vm.renderer.canvas && stage155.canvas.isConnected);
        assert.equal(await canvas.count(), 0);
        assert.equal(await child.evaluate(() => !window.opener && !window.vm &&
            typeof require === 'undefined' && typeof window.EditorPreload === 'undefined'), true);
        return {child, screenCanvas};
    }

    const {child, screenCanvas} = await open();
    const native = (await control('windows')).find(window => window.kind === 'stage');
    assert.deepEqual(native.preferences, {sandbox: true, contextIsolation: true, nodeIntegration: false, preload: false});
    assert.equal(await child.evaluate(() => window.open('about:blank') === null), true);
    assert.equal(await editor.evaluate(() => window.open('about:blank', 'tw-plus-stage-invalid') === null), true);
    assert.equal(await editor.evaluate(() =>
        window.open('stage-popout.html', `tw-plus-stage-${crypto.randomUUID()}`) === null), true);
    await control('layout', native.id);
    await click(control, 'stage', screenCanvas);
    await focus(child, native.id);
    const first = await screenCanvas.screenshot();
    const before = await editor.evaluate(() => stage155.frames);
    await editor.evaluate(() => vm.editingTarget.setXY(110, -30));
    await editor.waitForFunction(frame => stage155.frames > frame, before);
    const second = await screenCanvas.screenshot();
    assert.notDeepEqual(second, first);
    assert.equal(await editor.evaluate(() => stage155.vm === vm && stage155.loop === vm.runtime.frameLoop && stage155.loop.running &&
        stage155.renderer === vm.renderer && !stage155.lost), true);

    const [width, height] = await editor.evaluate(() => vm.renderer.getNativeSize());
    async function mouseAt(relativeX, relativeY) {
        await focus(child, native.id);
        const bounds = (await control('windows')).find(window => window.kind === 'stage');
        const box = await screenCanvas.boundingBox();
        await launcher('python3', [mousePath, '--click', String(bounds.content.x + (box.x + box.width * relativeX) * bounds.zoom),
            String(bounds.content.y + (box.y + box.height * relativeY) * bounds.zoom)]);
        const expected = {x: (relativeX - 0.5) * width, y: (0.5 - relativeY) * height};
        await until(() => editor.evaluate(({x, y}) => {
            const mouse = vm.runtime.ioDevices.mouse;
            return Math.abs(mouse.getScratchX() - x) <= 3 && Math.abs(mouse.getScratchY() - y) <= 3;
        }, expected), 'native pointer reaches the expected stage coordinate');
    }
    await mouseAt(0.75, 0.25);
    const box = await screenCanvas.boundingBox();
    await control('layout-tall', native.id);
    await until(async () => Math.abs((await screenCanvas.boundingBox()).width - box.width) > 8, 'Stage resizes');
    const tall = await screenCanvas.boundingBox();
    assert.ok(Math.abs(tall.width / tall.height - width / height) < 0.015);
    await mouseAt(0.25, 0.75);
    const resized = await screenCanvas.screenshot();
    await editor.evaluate(() => vm.editingTarget.setXY(-110, 30));
    await until(async () => !(await screenCanvas.screenshot()).equals(resized), 'resized stage pixels update');

    const key = direction => launcher('python3', [mousePath, '--key-' + direction, '0']);
    await key('down');
    try {
        await editor.waitForFunction(() => vm.runtime.ioDevices.keyboard.getKeyIsDown('a'));
    } finally {
        await key('up');
    }
    await editor.waitForFunction(() => !vm.runtime.ioDevices.keyboard.getKeyIsDown('a'));
    report.checks.push('One VM, renderer and WebGL canvas; live pixels changed in the child, native mouse and keyboard reached the VM after resize');

    const monitorPosition = () => editor.evaluate(id => {
        const {x, y} = vm.runtime.getMonitorState().get(id);
        return {x, y};
    }, monitorId);
    const checkMonitorDisplay = (page, position) => monitor(page).evaluate((element, expected) => {
        const overlay = element.closest('.monitor-overlay');
        const rect = overlay.getBoundingClientRect();
        const monitorRect = element.getBoundingClientRect();
        const x = (monitorRect.left - rect.left) * overlay.clientWidth / rect.width;
        const y = (monitorRect.top - rect.top) * overlay.clientHeight / rect.height;
        if (Math.abs(x - expected.x) > 1 || Math.abs(y - expected.y) > 1) {
            throw new Error(`Monitor displayed at ${x}, ${y}; VM expected ${expected.x}, ${expected.y}`);
        }
    }, position);
    const initialPosition = await monitorPosition();
    await focus(child, native.id);
    await editor.evaluate(() => {
        const owner = stage155.canvas.ownerDocument;
        stage155.monitorEvents = [];
        for (const name of ['pointerdown', 'pointerup']) {
            owner.addEventListener(name, event => stage155.monitorEvents.push({
                name, trusted: event.isTrusted, target: (event.target as Element).closest?.<HTMLElement>('[data-opcode]')?.dataset.id,
                belongsToChildRealm: event.target instanceof owner.defaultView.Node
            }), {capture: true, once: true});
        }
    });
    const [monitorX, monitorY] = await screenPoint(control, 'stage', monitor(child));
    await launcher('python3', [mousePath, monitorX, monitorY, monitorX + 48, monitorY + 35].map(String));
    report.monitorEvents = await editor.evaluate(() => stage155.monitorEvents);
    assert.ok(report.monitorEvents.some(event => event.name === 'pointerdown' && event.trusted &&
        event.target === monitorId));
    await until(async () => {
        const moved = await monitorPosition();
        return moved.x > initialPosition.x && moved.y > initialPosition.y;
    }, 'Stage monitor moves in the parent VM');
    const movedMonitor = await monitorPosition();
    await checkMonitorDisplay(child, movedMonitor);

    report.checks.push('Native monitor drag moved the variable monitor in the parent VM');

    const greenFlag = child.locator('[class*="green-flag_green-flag_"]').first();
    const stop = child.locator('[class*="stop-all_stop-all_"]').first();
    const question = child.getByRole('textbox');
    await focus(child, native.id);
    await click(control, 'stage', greenFlag);
    await question.waitFor();
    await focus(child, native.id);
    await click(control, 'stage', question);
    await until(() => question.evaluate(input => input.ownerDocument.activeElement === input), 'question input focus');
    await launcher('python3', [mousePath, '--key-down', '18']);
    await launcher('python3', [mousePath, '--key-up', '18']);
    const answer = await until(() => question.inputValue(), 'native answer is entered');
    const submit = child.locator('[class*="question_question-submit-button_"]');
    await click(control, 'stage', submit);
    await question.waitFor({state: 'hidden'});
    await until(() => editor.evaluate(value => vm.runtime.getOpcodeFunction('sensing_answer')() === value, answer),
        'answer reaches the parent VM');
    await focus(child, native.id);
    await click(control, 'stage', greenFlag);
    await question.waitFor();
    await click(control, 'stage', stop);
    await question.waitFor({state: 'hidden'});
    report.checks.push('Green flag, stop and question submission in the child control the parent VM');

    await toggleUndockButtons(editor);
    assert.equal(await readUndockButtonsChecked(editor), false);
    assert.equal(await stageAction.count(), 0);
    assert.ok(!child.isClosed());
    await screenCanvas.waitFor();
    const returnButton = editor.getByRole('button', {name: /^(Return here|ここに戻す)$/});
    await Promise.all([child.waitForEvent('close'), returnButton.click()]);
    await canvas.waitFor();
    assert.ok(await canvas.evaluate(node => node === stage155.canvas && !stage155.lost));
    assert.equal(await stageAction.count(), 0);
    await monitor(editor).waitFor();
    assert.deepEqual(await monitorPosition(), movedMonitor);
    await checkMonitorDisplay(editor, movedMonitor);

    await toggleUndockButtons(editor);
    const secondOpen = await open();
    const secondNative = (await control('windows')).find(window => window.kind === 'stage');
    await control('focus', secondNative.id);
    await secondOpen.child.waitForFunction(() => document.hasFocus());
    await key('down');
    try {
        await editor.waitForFunction(() => vm.runtime.ioDevices.keyboard.getKeyIsDown('a'));
        await Promise.all([secondOpen.child.waitForEvent('close'), control('close', secondNative.id)]);
        await editor.waitForFunction(() => !vm.runtime.ioDevices.keyboard.getKeyIsDown('a'));
    } finally {
        await key('up');
    }
    await canvas.waitFor();
    assert.ok(await canvas.evaluate(node => node === stage155.canvas && stage155.vm === vm &&
        stage155.renderer === vm.renderer && !stage155.lost));
    assert.equal((await control('windows')).length, 1);
    await control('focus', parent.id);
    await editor.waitForFunction(() => document.hasFocus());
    await canvas.scrollIntoViewIfNeeded();
    const lastInput = await editor.evaluate(() => stage155.input.length);
    await click(control, 'editor', canvas, 0.45);
    try {
        await editor.waitForFunction(({lastInput, width}) => {
            const mouse = vm.runtime.ioDevices.mouse;
            return stage155.input.slice(lastInput).some(({device, data}) => device === 'mouse' && data.isDown) &&
                Math.abs(mouse.getScratchX() + width * 0.05) <= 3 && Math.abs(mouse.getScratchY()) <= 3;
        }, {lastInput, width});
    } catch (error) {
        report.dockInput = await canvas.evaluate((node, from) => {
            const rect = node.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.x + rect.width * 0.45, rect.y + rect.height / 2);
            const mouse = vm.runtime.ioDevices.mouse;
            return {box: rect.toJSON(), hit: hit?.outerHTML.slice(0, 250),
                mouse: [mouse.getScratchX(), mouse.getScratchY()], events: stage155.input.slice(from)};
        }, lastInput);
        throw error;
    }
    await until(() => canvas.evaluate(node => node.width > 0 && node.height > 0), 'redocked drawing buffer is sized');
    const redocked = await canvas.screenshot();
    const frame = await editor.evaluate(() => stage155.frames);
    await editor.evaluate(() => vm.editingTarget.setXY(0, 0));
    try {
        await editor.waitForFunction(previous => stage155.frames > previous, frame);
        await until(async () => !(await canvas.screenshot()).equals(redocked), 'redocked stage pixels update');
    } catch (error) {
        await writeFile('/private/tmp/tw155-stage-docked-before.png', redocked);
        await canvas.screenshot({path: '/private/tmp/tw155-stage-docked-after.png'});
        report.redock = await editor.evaluate(() => ({
            frames: stage155.frames, xy: [vm.editingTarget.x, vm.editingTarget.y],
            width: stage155.canvas.width, height: stage155.canvas.height, visibility: document.visibilityState,
            glLost: vm.renderer._gl.isContextLost()
        }));
        throw error;
    }
    report.checks.push('Hiding undock buttons preserved the child; dock and native close restored the same live canvas and released held input');
}

async function checkPlusLayout({editor, context, control}) {
    const parent = (await control('windows')).find(window => window.kind === 'editor');
    await control('layout', parent.id);
    const trigger = editor.getByRole('button', {name: /^(Reveal sprite list|スプライト一覧を展開)$/, exact: true});
    const openSpritePopup = async () => {
        await trigger.hover();
        await editor.getByRole('button', {name: /^(Undock sprite list|アンドック)$/, exact: true}).click();
        const internal = editor.getByRole('region', {name: /^(Sprite list|スプライト一覧)$/, exact: true});
        await internal.getByRole('button', {name: /^(Window layout|レイアウト変更)$/, exact: true}).click();
        const popup = context.waitForEvent('page');
        await internal.getByRole('button', {name: /^(Open in a separate window \(undock\)|別窓で開く（アンドック）)$/, exact: true}).click();
        const child = await popup;
        await child.waitForURL(/sprite-list-popout/);
        await child.locator('[data-backdrop-placement]').waitFor();
        return child;
    };
    const child = await openSpritePopup();
    const menu = child.getByRole('button', {name: /^(Window layout|レイアウト変更)$/, exact: true});
    await menu.press('ArrowDown');
    assert.equal(await child.getByRole('menu', {name: /^(Window layout|レイアウト変更)$/}).getByRole('menuitem').count(), 6);
    assert.equal(await child.getByRole('menuitem', {name: /^(Open in a separate window \(undock\)|別窓で開く（アンドック）)$/}).isDisabled(), true);
    const restore = child.getByRole('menuitem', {name: /^(Restore normal window|通常のウィンドウに戻す)$/});
    assert.equal(await restore.isDisabled(), true);
    assert.equal(await restore.getAttribute('aria-current'), 'true');
    await child.keyboard.press('Escape');
    assert.equal(await menu.evaluate(node => node === document.activeElement), true);
    await menu.click();
    await child.getByRole('menuitem', {name: /^(Maximize this window|この画面を最大化する)$/}).click();
    await child.waitForFunction(async () => await TwPlusWindowControls.mode() === 'maximized');
    await menu.click();
    assert.equal(await child.getByRole('menuitem', {name: /^(Maximize this window|この画面を最大化する)$/}).isDisabled(), true);
    await child.keyboard.press('End');
    assert.equal(await restore.evaluate(node => node === document.activeElement), true);
    await child.keyboard.press('Enter');
    await child.waitForFunction(async () => await TwPlusWindowControls.mode() === 'normal');
    await menu.click();
    const closed = child.waitForEvent('close');
    await child.getByRole('menuitem', {name: /^(Return to the editor \(dock\)|元の画面に戻す（ドックする）)$/}).click();
    await closed;
    await trigger.hover();
    await editor.locator('[data-backdrop-placement]').waitFor();
    const windows = await control('windows');
    assert.equal(windows.length, 1);
    const minimized = await openSpritePopup();
    const nativeWindow = (await control('windows')).find(window => window.url === minimized.url());
    assert.ok(nativeWindow);
    await minimized.getByRole('button', {name: /^(Window layout|レイアウト変更)$/}).click();
    await minimized.getByRole('menuitem', {name: /^(Minimize this window|この画面を最小化する)$/}).click();
    await minimized.waitForFunction(async () => await TwPlusWindowControls.mode() === 'minimized', undefined, {polling: 100});
    await Promise.all([minimized.waitForEvent('close'), control('close', nativeWindow.id)]);
    await trigger.hover();
    await editor.locator('[data-backdrop-placement]').waitFor();
    report.checks.push('Default Plus layout: native sprite drawer supports menu maximize, restore, dock and minimize');

    await editor.mouse.move(500, 400);
    await editor.getByRole('tab', {name: /^(Code|コード)$/}).focus();
    const opened = context.waitForEvent('page');
    await editor.getByRole('button', {name: /^(Open in another window|別画面で開く)$/}).click();
    const first = await opened;
    await first.waitForURL(/code-popout/);
    const layout = page => page.getByRole('button', {name: /^(Window layout|レイアウト変更)$/});
    const duplicate = page => page.getByRole('menuitem', {name: /^(Open another view of this editor|この編集画面をもう一枚開く（別のビューを開く）)$/});
    const dock = page => page.getByRole('menuitem', {name: /^(Return to the editor \(dock\)|元の画面に戻す（ドックする）)$/});
    await layout(first).click();
    const copied = context.waitForEvent('page');
    await duplicate(first).click();
    const second = await copied;
    await second.waitForURL(/code-popout/);
    await second.locator('[data-plus-horizontal-zoom]').waitFor({state: 'attached'});
    assert.equal(await first.locator('#code-target').inputValue(), await second.locator('#code-target').inputValue());
    await layout(second).click();
    assert.equal(await duplicate(second).isDisabled(), true);
    const secondClosed = second.waitForEvent('close');
    await dock(second).click();
    await secondClosed;
    await layout(first).click();
    assert.equal(await duplicate(first).isEnabled(), true);
    const firstClosed = first.waitForEvent('close');
    await dock(first).click();
    await firstClosed;
    report.checks.push('The native Code menu duplicates the same target, disables duplication at the two-view limit, and docks both views');
}

try {
    if (testMode === '--plus-layout') await run(false, checkPlusLayout);
    else await run(false, async ({editor, control}) => {
        const parent = (await control('windows')).find(window => window.kind === 'editor');
        await control('layout', parent.id);
        await editor.getByRole('separator', {name: /^(Editor and stage column width|編集領域とステージ列の幅)$/}).waitFor();
        await editor.getByRole('separator', {name: /^(Stage and target pane height|ステージと対象領域の高さ)$/}).waitFor();
        assert.equal(await layoutMenu(editor).count(), 0);
        assert.equal(await editor.getByRole('button', {name: undockLabel}).count(), 0);
        assert.equal(await editor.getByRole('region', {name: spritePropertiesLabel}).count(), 0);
        assert.equal(await editor.evaluate(() =>
            window.open('about:blank', `tw-plus-backpack-${crypto.randomUUID()}`) === null), true);
        assert.equal(await editor.evaluate(() => window.open('about:blank', `tw-plus-stage-${crypto.randomUUID()}`) === null), true);
        assert.equal(await editor.evaluate(() => ['sprite-properties', 'sprite-list'].every(kind =>
            window.open('about:blank', `tw-plus-${kind}-${crypto.randomUUID()}`) === null)), true);
        assert.equal(await editor.evaluate(() => window.open('about:blank', `tw-plus-code-${crypto.randomUUID()}`) === null), true);
        assert.equal((await control('windows')).length, 1);
        report.checks.push('Desktop enables both splitters by default and keeps undocking off');
    });

    if (testMode === '--plus-layout') { /* The default Plus scenario has already run. */ }
    else if (testMode === '--sprite-properties') await run('sprite', checkSpriteProperties);
    else if (testMode === '--code-backpack-native') await run('code-backpack', env => checkCodePopouts(env, {withBackpack: true, native: true}));
    else if (testMode === '--code-backpack') await run('code-backpack', env => checkCodePopouts(env, {withBackpack: true}));
    else if (testMode === '--code-target-sync') await run('code-popout', env => checkCodePopouts(env, {targetSync: true}));
    else if (testMode === '--code-stage') await run('code-popout', env => checkCodePopouts(env, {stageCode: true}));
    else if (testMode === '--code-comments') await run('code-popout', env => checkCodePopouts(env, {comments: true}));
    else if (testMode === '--code-scalar-scope' || testMode === '--code-list-scope') {
        await run('code-popout', env => checkCodePopouts(env, {
            variableScope: testMode === '--code-list-scope' ? 'list' : 'scalar'
        }));
    }
    else if (testMode === '--code-custom-fields') await run('code-popout', env => checkCodePopouts(env, {customFields: true}));
    else if (testMode === '--code-dynamic-branches') await run('code-popout', env => checkCodePopouts(env, {dynamicBranches: true}));
    else if (testMode === '--code-dynamic') await run('code-popout', env => checkCodePopouts(env, {dynamic: true}));
    else if (testMode === '--code-extensions') await run('code-popout', env => checkCodePopouts(env, {extensions: true}));
    else if (testMode === '--code-procedures') await run('code-popout', env => checkCodePopouts(env, {procedures: true}));
    else if (testMode === '--code-broadcast') await run('code-popout', env => checkCodePopouts(env, {broadcast: true}));
    else if (testMode === '--code-popout') await run('code-popout', checkCodePopouts);
    else if (testMode === '--target-panels-popout') await run('target-panels', checkExternalTargetPanels);
    else if (testMode === '--stage-display-menu') await run('stage-display-menu', checkStageDisplayMenu);
    else if (testMode === '--stage-popout') await run('stage-popout', checkStagePopout);
    else if (testMode === '--stage-panel') await run('stage', checkStagePanel);
    else if (testMode === '--internal') await run('internal', checkInternal);
    else await run(true, async ({editor, context, control}) => {
        const parent = (await control('windows')).find(window => window.kind === 'editor');
        await control('layout', parent.id);
        await control('focus', parent.id);
        await until(() => editor.evaluate(() => document.hasFocus()), 'native editor focus');
        const undock = editor.getByRole('button', {name: undockLabel});
        const header = editor.locator('[class*="backpack_backpack-header"]');
        assert.equal(await undock.count(), 0);
        const ids = await seedBackpack(editor);
        await observeNative(editor);
        await toggleUndockButtons(editor, button => click(control, 'editor', button));
        if (!await readUndockButtonsChecked(editor)) {
            await control('focus', parent.id);
            await toggleUndockButtons(editor, button => click(control, 'editor', button));
        }
        await undock.waitFor();
        assert.equal(await readUndockButtonsChecked(editor), true);
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
                    await new Promise<void>(resolve => {window.nativeBackpackRead = resolve;});
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
        await editor.waitForFunction(() => window.window.ScratchBlocks.getMainWorkspace().getTopBlocks()
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
