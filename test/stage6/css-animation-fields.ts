import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {build, transform} from 'esbuild';
import {chromium, type Locator, type Page} from 'playwright';

const directory = resolve(process.argv[2]);
const layout = process.argv.includes('--layout');
const origin = 'http://localhost:15107';
const prefix = '/turbowarp-plus-editor/';
const [driver, extension] = await Promise.all([
    build({
        stdin: {resolveDir: import.meta.dirname, contents: `
            import {createCodeSession} from '../../packages/editor-views/index.ts';
            import {createSurface} from '../../packages/editor-surfaces/index.ts';
            import {createBrowserHost} from '../../site/editor-backpack/browser-host.ts';
            const {vm, ScratchBlocks} = window;
            const host = createBrowserHost(window, url => window.open(url.href, '_blank', 'popup'), 'code-popout.html', true);
            const session = createCodeSession({
                vm, ScratchBlocks, workspace: ScratchBlocks.getMainWorkspace(), document, locale: 'en',
                canUse: () => true, onError: error => { throw error; }, receiveBackpackDrop: undefined
            });
            window.openTestCode = () => {
                const target = vm.editingTarget;
                let detach;
                const surface = createSurface(host, state => {
                    if (state.kind === 'external') {
                        detach = session.attach({...state.target, target, close: () => surface.dock()});
                    } else if (state.kind === 'docked') detach?.();
                });
                surface.undock({timeoutMs: 15000});
            };
        `},
        bundle: true, write: false, platform: 'browser'
    }),
    transform(await readFile(new URL('fixtures/native-extension.ts', import.meta.url), 'utf8'), {
        loader: 'ts', format: 'iife', define: {
            TW_TEST_NATIVE_SVG: 'false', TW_TEST_PARENT_DOCUMENT: 'true', TW_TEST_NATIVE_CSS: 'true',
            TW_TEST_PSEUDO_CSS: 'false', TW_TEST_ANIMATION_CSS: String(!layout), TW_TEST_LAYOUT_CSS: String(layout)
        }
    })
]);
const browser = await chromium.launch({headless: true, args: ['--enable-unsafe-swiftshader']});

try {
    const context = await browser.newContext({viewport: {width: 1280, height: 900}});
    context.setDefaultTimeout(12000);
    const errors: string[] = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin || !url.pathname.startsWith(prefix)) return route.abort();
        const path = resolve(directory, decodeURIComponent(url.pathname.slice(prefix.length)));
        if (!path.startsWith(directory + sep)) return route.abort();
        if (!(await stat(path).catch(() => null))?.isFile()) return route.fulfill({status: 404});
        return route.fulfill({path});
    });
    // Headless Chromium reports every popup as focused. Supply the foreground signal
    // while keeping the production focus handlers, edit lease and MessagePort protocol.
    await context.addInitScript(() => {
        let focused = !window.opener;
        Object.defineProperty(document, 'hasFocus', {value: () => focused});
        window['setTestCodeFocus'] = (next: boolean) => {
            if (next === focused) return;
            focused = next;
            window.dispatchEvent(new Event(next ? 'focus' : 'blur'));
        };
    });
    const editor = await context.newPage();
    await editor.goto(origin + prefix + 'editor.html?lang=en&twPlusStandardLayout=0');
    await editor.waitForFunction(() => window.vm?.editingTarget?.isOriginal && window.ScratchBlocks?.getMainWorkspace());
    const sprite = await editor.evaluate(async url => {
        const {vm} = window;
        const target = vm.editingTarget;
        const security = vm.extensionManager.securityManager;
        const getSandboxMode = security.getSandboxMode.bind(security);
        security.getSandboxMode = value => value === url ? 'unsandboxed' : getSandboxMode(value);
        await vm.extensionManager.loadExtensionURL(url);
        const {xml} = vm.runtime.getBlocksXML(target).find(category => category.id === 'windowfields');
        const block = new DOMParser().parseFromString(xml, 'text/xml').querySelector('block[type="windowfields_display"]');
        block.setAttribute('id', 'animated-field');
        block.setAttribute('x', '100');
        block.setAttribute('y', '185');
        block.querySelector('value[name="NOTE"] shadow').setAttribute('id', 'animated-caption');
        target.blocks.blocklyListen({type: 'create', blockId: 'animated-field', xml: {outerHTML: block.outerHTML}});
        vm.refreshWorkspace();
        return target.getName();
    }, `data:text/javascript,${encodeURIComponent(extension.code)}`);
    await editor.addScriptTag({content: driver.outputFiles[0].text});

    const field = (page: Page, id: string) => page.locator(`.blocklyBlockCanvas [data-id="${id}"] .blocklyEditableText`);
    const readValue = () => editor.evaluate(name => {
        const {blocks} = window.vm.runtime.targets.find(target => target.getName() === name);
        const root = blocks.getScripts().map(id => blocks.getBlock(id)).find(block => block.opcode === 'windowfields_display');
        const {shadow} = root.inputs.NOTE;
        return {id: shadow, value: blocks.getBlock(shadow).fields.field_windowfields_caption.value};
    }, sprite);
    const open = async () => {
        const [popup] = await Promise.all([
            context.waitForEvent('page'),
            editor.evaluate(() => window['openTestCode']())
        ]);
        await popup.waitForURL(/\/code-popout\.html#/);
        const {id} = await readValue();
        await field(popup, id).waitFor();
        assert.equal(await popup.evaluate(() => Boolean(window.vm || window.opener)), false);
        return popup;
    };
    const focus = async (front: Page) => {
        for (const page of context.pages()) {
            if (page !== front) await page.evaluate(() => window['setTestCodeFocus'](false));
        }
        await front.evaluate(() => window['setTestCodeFocus'](true));
        if (front !== editor) {
            await front.waitForFunction(() => !document.querySelector<HTMLElement>('#mount').inert);
            for (const page of context.pages()) {
                if (page !== editor && page !== front) {
                    assert.equal(await page.locator('#mount').evaluate((node: HTMLElement) => node.inert), true);
                }
            }
        }
    };
    const checkValue = async (value: string, pages: Page[]) => {
        const {id} = await readValue();
        for (const page of pages) await field(page, id).filter({hasText: value}).waitFor();
        assert.equal((await readValue()).value, value);
    };
    const openWidget = async (page: Page) => {
        await field(page, (await readValue()).id).click({force: true});
        const widget = page.locator('[data-plus-native-field]');
        await widget.waitFor();
        return widget;
    };
    const dock = async (page: Page) => {
        await focus(page);
        await Promise.all([page.waitForEvent('close'), page.locator('#dock').click()]);
    };

    const a = await open();
    const b = await open();
    await focus(a);
    const widget = await openWidget(a);
    assert.equal(await a.locator('#tw-test-native-field-css').count(), 0);
    const group = widget.locator('fieldset');
    const animation = layout ? undefined : await checkAnimation(group);
    if (layout) {
        await checkLayout(editor.locator('[data-tw-parent-document-caption] [aria-label="Caption layout"]'), false);
        await checkLayout(widget.locator('[aria-label="Caption layout"]'), true);
        const originalFallback = editor.locator('[data-tw-parent-document-caption] [aria-label="Unsupported grid"]');
        assert.equal(await originalFallback.evaluate(node => getComputedStyle(node).display), 'grid');
        const fallback = widget.locator('[aria-label="Unsupported grid"]');
        assert.equal(await fallback.textContent(), 'Plain text remains visible');
        assert.equal(await fallback.evaluate(node => getComputedStyle(node).display), 'block');
    }

    const edited = '改訂<&>';
    await widget.getByRole('textbox', {name: 'Caption'}).fill(edited);
    await widget.getByRole('button', {name: 'Apply caption'}).click();
    await widget.waitFor({state: 'detached'});
    if (animation) assert.equal(await animation.evaluate(effect => effect.playState), 'idle');
    await checkValue(edited, [a, b]);
    await focus(b);
    await b.locator('#undo').click();
    await checkValue('original', [a, b]);
    await focus(a);
    await a.locator('#redo').click();
    await checkValue(edited, [a, b]);
    await dock(a);
    await dock(b);
    await focus(editor);
    await editor.evaluate(async name => {
        await window.vm.loadProject(await (await window.vm.saveProjectSb3()).arrayBuffer());
        const target = window.vm.runtime.targets.find(item => item.getName() === name);
        window.vm.setEditingTarget(target.id);
    }, sprite);
    await checkValue(edited, [editor]);
    const reopened = await open();
    await focus(reopened);
    const restored = await openWidget(reopened);
    assert.equal(await restored.getByRole('textbox', {name: 'Caption'}).inputValue(), edited);
    if (layout) {
        await checkLayout(restored.locator('[aria-label="Caption layout"]'), true);
    } else {
        assert.equal(await restored.locator('fieldset').evaluate(node => node.getAnimations().length), 1);
        await reopened.emulateMedia({reducedMotion: 'reduce'});
        await reopened.waitForFunction(() => document.querySelector('[data-plus-native-field] fieldset').getAnimations().length === 0);
        await reopened.keyboard.press('Escape');
        await restored.waitFor({state: 'detached'});
        await openWidget(reopened);
        assert.equal(await restored.locator('fieldset').evaluate(node => node.getAnimations().length), 0);
    }
    await dock(reopened);
    assert.deepEqual(errors, []);
    const displayCheck = layout ? 'Grid tracks and spans, Flexbox alignment and gaps, popup reflow' :
        'popup keyframes, resource filtering, reduced motion';
    console.log(`Chromium ${browser.version()}: ${displayCheck}, shared edit/Undo/Redo, docking and SB3 reload passed.`);
} finally {
    await browser.close();
}

async function checkAnimation(group: Locator) {
    const animation = await group.evaluateHandle(node => node.getAnimations()[0]);
    const samples = await group.evaluate(async node => {
        const [effect] = node.getAnimations();
        await effect.ready;
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const progressed = Number(effect.currentTime) > 0;
        effect.pause();
        await effect.ready;
        const values = [0, 2000, 3000].map(time => {
            effect.currentTime = time;
            const {backgroundColor, opacity, transform, backgroundImage} = getComputedStyle(node);
            return {backgroundColor, opacity, transform, backgroundImage};
        });
        return {progressed, values, direction: effect.effect.getTiming().direction};
    });
    assert.equal(samples.progressed, true);
    assert.equal(samples.direction, 'alternate');
    assert.deepEqual(samples.values.slice(0, 2).map(({backgroundColor, opacity}) => [backgroundColor, opacity]), [
        ['rgb(18, 52, 86)', '0.4'], ['rgb(171, 205, 239)', '0.9']
    ]);
    assert.equal(samples.values[2].opacity, '0.65');
    assert.ok(samples.values.every(value => value.transform === 'none' && value.backgroundImage === 'none'));
    return animation;
}

async function checkLayout(grid: Locator, mirrored: boolean) {
    const geometry = await grid.evaluate((node: HTMLElement, mirrored) => {
        const [label, input, footer] = node.children;
        const [hint, apply] = footer.children;
        const bounds = (element: Element) => element.getBoundingClientRect();
        const gridStyle = getComputedStyle(node);
        const footerStyle = getComputedStyle(footer);
        const result = {
            display: gridStyle.display, columns: gridStyle.gridTemplateColumns, width: bounds(node).width,
            labelStart: bounds(label).left - bounds(node).left,
            inputStart: bounds(input).left - bounds(node).left,
            rowGap: bounds(footer).top - bounds(input).bottom,
            footerWidth: bounds(footer).width,
            footerDisplay: footerStyle.display, wrap: footerStyle.flexWrap, align: footerStyle.alignItems,
            footerGap: bounds(apply).left - bounds(hint).right,
            buttonInset: bounds(footer).right - bounds(apply).right,
            backgroundImage: getComputedStyle(input).backgroundImage,
            declaredColumns: node.style.gridTemplateColumns,
            resizedColumns: ''
        };
        if (mirrored) {
            const width = node.style.width;
            node.style.width = '300px';
            result.resizedColumns = getComputedStyle(node).gridTemplateColumns;
            node.style.width = width;
        }
        return result;
    }, mirrored);
    assert.equal(geometry.display, 'grid');
    assert.equal(geometry.columns, '114px 228px');
    assert.equal(geometry.width, 360);
    assert.equal(geometry.labelStart, 0);
    assert.equal(geometry.inputStart, 132);
    assert.equal(geometry.rowGap, 12);
    assert.equal(geometry.footerWidth, 360);
    assert.deepEqual([geometry.footerDisplay, geometry.wrap, geometry.align], ['flex', 'wrap', 'center']);
    assert.equal(geometry.footerGap, 12);
    assert.equal(geometry.buttonInset, 0);
    if (mirrored) {
        assert.equal(geometry.declaredColumns, '1fr 2fr');
        assert.equal(geometry.resizedColumns, '94px 188px');
        assert.equal(geometry.backgroundImage, 'none');
    } else {
        assert.match(geometry.backgroundImage, /data:image\/svg\+xml/);
    }
}
