import {verifyWebEditor} from '../../scripts/site/editor-revision.ts';
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {build, transform} from 'esbuild';
import {chromium, type Locator, type Page} from 'playwright';

const directory = resolve(process.argv[2]);
await verifyWebEditor(directory);
const layout = process.argv.includes('--layout');
const resources = process.argv[3] === '--resources';
const asyncField = process.argv[3] === '--async-commit';
const dockedField = process.argv[3] === '--docked-set-value';
const attachedField = dockedField || process.argv[3] === '--attached-set-value';
const delayedField = attachedField || process.argv[3] === '--delayed-set-value';
const programmaticPromise = process.argv[3] === '--programmatic-promise';
const programmatic = programmaticPromise || process.argv[3] === '--programmatic-sync';
const collectBeforeSave = process.argv[3] === '--collect-before-save';
const fontFile = resources ? await readFile(process.argv[4]) : undefined;
const origin = 'http://localhost:15107';
const assetOrigin = 'https://field-assets.test';
const prefix = '/turbowarp-plus-editor/';
const [driver, extension] = await Promise.all([
    build({
        stdin: {resolveDir: import.meta.dirname, contents: `
            import {createCodeSession} from '../../packages/editor-views/index.ts';
            import {createSurface, flushPendingSurfaceEdits, pendingSurfaceEdits} from '../../packages/editor-surfaces/index.ts';
            import {createBrowserHost} from '../../site/editor-backpack/browser-host.ts';
            const {vm, ScratchBlocks} = window;
            const host = createBrowserHost(window, url => window.open(url.href, '_blank', 'popup'), 'code-popout.html', true);
            const session = createCodeSession({
                vm, ScratchBlocks, workspace: ScratchBlocks.getMainWorkspace(), document, locale: 'en',
                canUse: () => true, onError: error => {
                    if (error.message === 'Fixture applyAction rejection') {
                        (window.testProgrammaticErrors ??= []).push(error.message);
                    } else throw error;
                }, receiveBackpackDrop: undefined
            });
            // Registered the same way as the Desktop code window, so saving collects these views first.
            pendingSurfaceEdits.register(() => session.flush());
            window.collectTestEdits = () => flushPendingSurfaceEdits();
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
    transform(await readFile(new URL(programmatic ? 'fixtures/programmatic-extension.ts' :
        'fixtures/native-extension.ts', import.meta.url), 'utf8'), {
        loader: 'ts', format: 'iife', define: {
            TW_TEST_NATIVE_SVG: 'false', TW_TEST_PARENT_DOCUMENT: 'true', TW_TEST_NATIVE_CSS: 'true',
            TW_TEST_PSEUDO_CSS: 'false', TW_TEST_ANIMATION_CSS: String(!layout && !resources && !asyncField && !delayedField),
            TW_TEST_LAYOUT_CSS: String(layout), TW_TEST_EXTERNAL_FIELDS: String(resources), TW_TEST_ASYNC_FIELD: String(asyncField),
            TW_TEST_PROGRAMMATIC_PROMISE: String(programmaticPromise),
            TW_TEST_DELAYED_FIELD: String(delayedField && !attachedField), TW_TEST_ATTACHED_FIELD: String(attachedField),
            TW_TEST_DOCKED_FIELD: String(dockedField)
        }
    })
]);
const browser = await chromium.launch({headless: true, args: ['--enable-unsafe-swiftshader']});

try {
    const context = await browser.newContext({viewport: {width: 1280, height: 900}});
    context.setDefaultTimeout(12000);
    const errors: string[] = [];
    const requests: {path: string; page: string; cookie?: string; referer?: string}[] = [];
    let png: Buffer;
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (resources && url.hostname === 'field-assets.test') {
            const request = route.request();
            const {cookie, referer} = await request.allHeaders();
            requests.push({path: url.pathname, page: request.frame().url(), cookie, referer});
            const headers = {'access-control-allow-origin': origin};
            if (url.pathname === '/picture.png') {
                return route.fulfill({headers, contentType: 'image/png', body: png});
            }
            if (url.pathname === '/vector.svg') {
                return route.fulfill({headers, contentType: 'image/svg+xml', body: `
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="8">
                      <rect width="12" height="8" fill="#1255cc"/>
                      <image href="${assetOrigin}/nested.png" width="12" height="8"/>
                      <script>fetch('${assetOrigin}/executed')</script>
                    </svg>`});
            }
            if (url.pathname === '/caption.woff2') {
                return route.fulfill({headers, contentType: 'font/woff2', body: fontFile});
            }
            if (url.pathname === '/redirect.png') {
                return route.fulfill({status: 302, headers: {...headers, location: assetOrigin + '/followed.png'}});
            }
            if (url.pathname === '/wrong-type.png') {
                return route.fulfill({headers, contentType: 'text/plain', body: png});
            }
            return route.abort();
        }
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
        Object.defineProperty(Document.prototype, 'hasFocus', {value: () => focused});
        window['setTestCodeFocus'] = (next: boolean) => {
            if (next === focused) return;
            focused = next;
            window.dispatchEvent(new Event(next ? 'focus' : 'blur'));
        };
    });
    const editor = await context.newPage();
    await editor.goto(origin + prefix + 'editor.html?lang=en&twPlusStandardLayout=0');
    await editor.waitForFunction(() => window.vm?.editingTarget?.isOriginal && window.ScratchBlocks?.getMainWorkspace());
    if (resources) {
        await context.addCookies([{name: 'test-session', value: 'fixture', url: assetOrigin, sameSite: 'None', secure: true}]);
        png = Buffer.from(await editor.evaluate(() => {
            const canvas = document.createElement('canvas');
            canvas.width = 12;
            canvas.height = 8;
            const context = canvas.getContext('2d');
            context.fillStyle = '#218348';
            context.fillRect(0, 0, 12, 8);
            return canvas.toDataURL().split(',')[1];
        }), 'base64');
        await editor.evaluate(assetOrigin => {
            const security = window.vm.securityManager;
            const canFetch = security.canFetch.bind(security);
            window['fieldResourceDecisions'] = [];
            security.canFetch = url => {
                if (!url.startsWith(assetOrigin + '/')) return canFetch(url);
                window['fieldResourceDecisions'].push(url);
                return !url.endsWith('/denied.png');
            };
        }, assetOrigin);
    }
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
        await editor.waitForFunction(({sprite, id, value}) => {
            const target = window.vm.runtime.targets.find(target => target.getName() === sprite);
            return target?.blocks.getBlock(id)?.fields.field_windowfields_caption.value === value;
        }, {sprite, id, value});
    };
    const openWidget = async (page: Page) => {
        if (page === editor) {
            await editor.waitForFunction(() => !window.ScratchBlocks.getMainWorkspace().getParentSvg().parentElement.inert);
        }
        await field(page, (await readValue()).id).click({force: page !== editor});
        const widget = page.locator(page === editor ? '[data-tw-parent-document-caption]' : '[data-plus-native-field]');
        await widget.waitFor();
        return widget;
    };
    const openAction = async (page: Page, value: string) => {
        await field(page, (await readValue()).id).click({force: true});
        const dialog = page.getByRole('dialog', {name: `Caption: ${value}`, exact: true});
        await dialog.waitFor();
        return dialog;
    };
    const programmaticJobs = (count: number) => editor.waitForFunction(count =>
        window['testProgrammaticJobs']?.length === count, count);
    const resolveAction = (index: number, value: string) => editor.evaluate(({index, value}) => {
        window['testProgrammaticJobs'][index].resolve(value);
    }, {index, value});
    const undoDisabled = (page: Page) => page.locator('#undo').evaluate((node: HTMLButtonElement) => node.disabled);
    const jobCount = (count: number) => editor.waitForFunction(count =>
        window['testAsyncFieldJobs']?.length === count, count);
    const finish = async (index: number) => {
        await editor.evaluate(index => window['testAsyncFieldJobs'][index].finish(), index);
        await editor.waitForFunction(index => window['testAsyncFieldJobs'][index].delivered, index);
    };
    const dock = async (page: Page) => {
        await focus(page);
        await Promise.all([page.waitForEvent('close'), page.locator('#dock').click()]);
    };

    // Text typed into a comment stays in the window until the textarea fires `change`.
    // Saving must collect it without taking the lease or the caret from the typing window.
    const checkCollectBeforeSave = async (a: Page, b: Page) => {
        const typed = 'collected before saving';
        const comments = () => editor.evaluate(name => Object.values(
            window.vm.runtime.targets.find(target => target.getName() === name).comments
        ).map((comment: {text: string}) => comment.text), sprite);
        await focus(a);
        const {width, height} = await a.evaluate(() => ({width: innerWidth, height: innerHeight}));
        await a.locator('.blocklyMainBackground').click({button: 'right', position: {x: width - 260, y: height - 240}});
        await a.locator('.blocklyContextMenu').getByText('Add Comment', {exact: true}).click();
        const textarea = a.locator('.scratchCommentTextarea').last();
        await textarea.waitFor();
        await editor.waitForFunction(name => Object.keys(
            window.vm.runtime.targets.find(target => target.getName() === name).comments).length === 1, sprite);
        await textarea.fill(typed);
        assert.notDeepEqual(await comments(), [typed]);
        const project = await editor.evaluate(async () => {
            await window['collectTestEdits']();
            const blob = await window.vm.saveProjectSb3();
            return [...new Uint8Array(await blob.arrayBuffer())];
        });
        assert.deepEqual(await comments(), [typed]);
        assert.equal(await a.locator('#mount').evaluate((node: HTMLElement) => node.inert), false);
        assert.equal(await textarea.evaluate(node => node === node.ownerDocument.activeElement), true);
        await b.waitForFunction(typed => [...document.querySelectorAll<HTMLTextAreaElement>('.scratchCommentTextarea')]
            .some(node => node.value === typed), typed);
        const reloaded = await context.newPage();
        try {
            await reloaded.goto(origin + prefix + 'editor.html?lang=en&twPlusStandardLayout=0');
            await reloaded.waitForFunction(() => window.vm?.editingTarget?.isOriginal);
            await reloaded.evaluate(project => {window['testProject'] = project;}, project);
            const restored = reloaded.evaluate(async sprite => {
                await window.vm.loadProject(new Uint8Array(window['testProject']).buffer);
                const target = window.vm.runtime.targets.find(item => item.getName() === sprite);
                return Object.values(target.comments).map((comment: {text: string}) => comment.text);
            }, sprite);
            // The project carries the fixture extension, so the editor asks how it may run, as it would
            // for anyone opening the file. Allow it the way the editor page loaded it.
            const prompt = reloaded.getByRole('dialog').filter({hasText: 'This project wants to run extensions'});
            await prompt.locator('input[name="execution-all"][value="unsandboxed"]').check();
            await prompt.getByRole('button', {name: 'OK', exact: true}).click();
            assert.deepEqual(await restored, [typed]);
        } finally {
            await reloaded.close();
        }
        await textarea.blur();
    };

    const a = await open();
    const b = await open();
    if (collectBeforeSave) await checkCollectBeforeSave(a, b);
    await focus(dockedField ? editor : a);
    let widget = programmatic ? await openAction(a, 'original') : await openWidget(dockedField ? editor : a);
    assert.equal(await a.locator('#tw-test-native-field-css').count(), 0);
    const group = widget.locator('fieldset');
    const animation = layout || resources || asyncField || delayedField || programmatic ? undefined : await checkAnimation(group);
    const family = resources ? await checkResources(widget) : undefined;
    if (layout) {
        await checkLayout(editor.locator('[data-tw-parent-document-caption] [aria-label="Caption layout"]'), false);
        await checkLayout(widget.locator('[aria-label="Caption layout"]'), true);
        const originalFallback = editor.locator('[data-tw-parent-document-caption] [aria-label="Unsupported grid"]');
        assert.equal(await originalFallback.evaluate(node => getComputedStyle(node).display), 'grid');
        const fallback = widget.locator('[aria-label="Unsupported grid"]');
        assert.equal(await fallback.textContent(), 'Plain text remains visible');
        assert.equal(await fallback.evaluate(node => getComputedStyle(node).display), 'block');
    }

    const edited = programmatic ? '改訂 <&> note' : '改訂<&>';
    const submit = async (value: string) => {
        await widget.getByRole('textbox', {name: 'Caption'}).fill(value);
        await widget.getByRole('button', {name: 'Apply caption'}).click();
    };
    if (programmatic) {
        const revise = (dialog: Locator) => dialog.getByRole('button', {name: 'Revise caption'}).click();
        await revise(widget);
        if (programmaticPromise) {
            await programmaticJobs(1);
            await checkValue('original', [a, b]);
            assert.equal(await undoDisabled(a), true);
            await focus(b);
            await focus(a);
            await revise(await openAction(a, 'original'));
            await programmaticJobs(2);
            await resolveAction(0, 'stale result');
            await checkValue('original', [a, b]);
            assert.equal(await undoDisabled(a), true);
            await editor.evaluate(() => window['testProgrammaticJobs'][1].reject(new Error('Fixture applyAction rejection')));
            await editor.waitForFunction(() => window['testProgrammaticErrors']?.length === 1);
            await checkValue('original', [a, b]);
            assert.equal(await undoDisabled(a), true);
            await revise(await openAction(a, 'original'));
            await programmaticJobs(3);
            await resolveAction(2, edited);
        }
    } else if (asyncField || delayedField) {
        await submit('stale value');
        await jobCount(1);
        await checkValue('original', [a, b]);
        assert.equal(await undoDisabled(a), true);
        await focus(b);
        await widget.waitFor({state: 'detached'});
        if (asyncField) assert.equal(await editor.evaluate(() => window['testAsyncFieldJobs'][0].signal.aborted), true);
        assert.equal(await undoDisabled(b), true);
        if (attachedField) {
            widget = await openWidget(b);
            await submit('stale after reacquiring');
            await jobCount(2);
            await finish(0);
            assert.equal((await readValue()).value, 'original', 'revoked field changed the VM while B owned editing');
            await checkValue('original', [editor, a, b]);
            assert.equal(await undoDisabled(b), true);
        }

        await focus(dockedField ? editor : a);
        widget = await openWidget(dockedField ? editor : a);
        await submit(edited);
        const currentJob = attachedField ? 2 : 1;
        await jobCount(currentJob + 1);
        await finish(currentJob - 1);
        if (attachedField) {
            assert.equal((await readValue()).value, 'original', 'revoked field changed the VM after A reopened the editor');
        }
        await checkValue('original', [a, b]);
        assert.equal(await undoDisabled(a), true);
        assert.equal(await widget.getByRole('textbox', {name: 'Caption'}).inputValue(), edited);
        if (attachedField) {
            assert.deepEqual(await editor.evaluate(() => {
                const jobs = window['testAsyncFieldJobs'];
                return {attached: jobs.every(job => job.attached), instances: new Set(jobs.map(job => job.field)).size};
            }), {attached: true, instances: 3});
        } else if (delayedField) {
            assert.deepEqual(await editor.evaluate(() => window['testAsyncFieldJobs'].map(job => job.detached)), [true, true]);
            assert.equal(await editor.evaluate(() => window['testAsyncFieldJobs'][0].result), 'original');
        } else {
            assert.equal(await editor.evaluate(() => window['testAsyncFieldJobs'][1].signal.aborted), false);
        }
        await finish(currentJob);
    } else {
        await submit(edited);
    }
    await widget.waitFor({state: 'detached'});
    if (animation) assert.equal(await animation.evaluate(effect => effect.playState), 'idle');
    if (family) assert.equal(await a.evaluate(family => [...document.fonts].some(face => face.family === family), family), false);
    await checkValue(edited, [a, b]);
    await focus(b);
    await b.locator('#undo').click();
    await checkValue('original', [a, b]);
    if (asyncField || delayedField || programmaticPromise) assert.equal(await undoDisabled(b), true);
    await focus(a);
    await a.locator('#redo').click();
    await checkValue(edited, [a, b]);
    await dock(a);
    await dock(b);
    await focus(editor);
    if (programmatic) {
        const dialog = await openAction(editor, edited);
        await dialog.getByRole('button', {name: 'Restore caption'}).click();
        if (programmaticPromise) {
            await programmaticJobs(4);
            await checkValue(edited, [editor]);
            await resolveAction(3, 'original');
        }
        await checkValue('original', [editor]);
        await editor.evaluate(() => window.ScratchBlocks.getMainWorkspace().undo(false));
        await checkValue(edited, [editor]);
    } else if (delayedField) {
        await field(editor, (await readValue()).id).click({force: true});
        const dockedWidget = editor.locator('[data-tw-parent-document-caption]');
        await dockedWidget.getByRole('textbox', {name: 'Caption'}).fill('edited after dock');
        await dockedWidget.getByRole('button', {name: 'Apply caption'}).click();
        if (dockedField) {
            await jobCount(4);
            await finish(3);
        }
        await checkValue('edited after dock', [editor]);
        if (dockedField) {
            await editor.evaluate(() => {
                const {ScratchBlocks} = window;
                const workspace = ScratchBlocks.getMainWorkspace();
                ScratchBlocks.Workspace.prototype.undo.call(workspace, false);
            });
        } else {
            await editor.evaluate(() => window.ScratchBlocks.getMainWorkspace().undo(false));
        }
        await checkValue(edited, [editor]);
    }
    if (dockedField) {
        widget = await openWidget(editor);
        await submit('stale after switching targets');
        await jobCount(5);
        const originalTargetId = await editor.evaluate(async () => {
            const {vm} = window;
            const id = vm.editingTarget.id;
            await vm.duplicateSprite(id);
            return id;
        });
        await widget.waitFor({state: 'detached'});
        await finish(4);
        assert.equal((await readValue()).value, edited);
        assert.deepEqual(await editor.evaluate(() => Object.values(window.vm.editingTarget.blocks._blocks)
            .filter((block: any) => block.opcode === 'windowfields_caption')
            .map((block: any) => block.fields.field_windowfields_caption.value)), [edited]);
        await editor.evaluate(id => window.vm.setEditingTarget(id), originalTargetId);

        widget = await openWidget(editor);
        await submit('stale after reloading the project');
        await jobCount(6);
    }
    await editor.evaluate(async name => {
        await window.vm.loadProject(await (await window.vm.saveProjectSb3()).arrayBuffer());
        const target = window.vm.runtime.targets.find(item => item.getName() === name);
        window.vm.setEditingTarget(target.id);
    }, sprite);
    if (dockedField) await finish(5);
    await checkValue(edited, [editor]);
    const reopened = await open();
    await focus(reopened);
    const restored = programmatic ? await openAction(reopened, edited) : await openWidget(reopened);
    if (programmatic) {
        await restored.getByRole('button', {name: 'Cancel'}).click();
    } else {
        assert.equal(await restored.getByRole('textbox', {name: 'Caption'}).inputValue(), edited);
    }
    if (resources) {
        await checkResources(restored);
        const decisions = await editor.evaluate(() => window['fieldResourceDecisions'] as string[]);
        assert.ok(decisions.includes(assetOrigin + '/denied.png'));
        assert.deepEqual([...new Set(requests.map(request => request.path))].sort(),
            ['/caption.woff2', '/picture.png', '/redirect.png', '/vector.svg', '/wrong-type.png']);
        assert.ok(requests.every(request => request.page.startsWith(origin + prefix + 'editor.html') &&
            !request.cookie && !request.referer));
    } else if (layout) {
        await checkLayout(restored.locator('[aria-label="Caption layout"]'), true);
    } else if (!asyncField && !delayedField && !programmatic) {
        assert.equal(await restored.locator('fieldset').evaluate(node => node.getAnimations().length), 1);
        await reopened.emulateMedia({reducedMotion: 'reduce'});
        await reopened.waitForFunction(() => document.querySelector('[data-plus-native-field] fieldset').getAnimations().length === 0);
        await reopened.keyboard.press('Escape');
        await restored.waitFor({state: 'detached'});
        await openWidget(reopened);
        assert.equal(await restored.locator('fieldset').evaluate(node => node.getAnimations().length), 0);
    }
    if (dockedField) {
        await restored.getByRole('textbox', {name: 'Caption'}).fill('stale after closing the window');
        await restored.getByRole('button', {name: 'Apply caption'}).click();
        await jobCount(7);
        await reopened.close();
        await focus(editor);
        await editor.waitForFunction(() => !window.ScratchBlocks.getMainWorkspace().getParentSvg().parentElement.inert);
        await finish(6);
        await checkValue(edited, [editor]);
        const connectedAgain = await open();
        await focus(connectedAgain);
        assert.equal(await undoDisabled(connectedAgain), true);
        await dock(connectedAgain);
    } else {
        await dock(reopened);
    }
    assert.deepEqual(errors, []);
    const displayCheck = collectBeforeSave ? 'collecting typed comment text before saving with the lease and caret kept, SB3 reload, ' +
        'popup keyframes, resource filtering, reduced motion' :
        dockedField ? 'docked native editor sessions, stale writes across focus and target changes, project reload and window close, native Undo' :
        programmaticPromise ? 'applyAction Promise, stale result filtering and rejection recovery' :
        programmatic ? 'synchronous applyAction' :
        attachedField ? 'direct delayed setValue on actual docked fields, stale writes after revocation and reacquisition' :
        delayedField ? 'direct delayed setValue, detached field instances and stale writes after reacquiring edit access' :
        asyncField ? 'async commit, stale completion after reacquiring edit access and duplicate callback filtering' :
        resources ? 'parent-only PNG, SVG and WOFF2 loading and resource filtering' :
        layout ? 'Grid tracks and spans, Flexbox alignment and gaps, popup reflow' :
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

async function checkResources(widget: Locator) {
    for (const [label, expected] of [['Remote PNG', [33, 131, 72, 255]], ['Remote SVG', [18, 85, 204, 255]]] as const) {
        const image = widget.locator(`img[alt="${label}"][src^="data:image/png"]`);
        const pixels = await image.evaluate(async (node: HTMLImageElement) => {
            await node.decode();
            const canvas = node.ownerDocument.createElement('canvas');
            canvas.width = canvas.height = 1;
            const context = canvas.getContext('2d');
            context.drawImage(node, 0, 0, 1, 1);
            return [...context.getImageData(0, 0, 1, 1).data];
        });
        assert.deepEqual(pixels, expected);
    }
    const input = widget.locator('textarea[style*="tw-field-font-"]');
    const family = await input.evaluate(node => {
        const family = getComputedStyle(node).fontFamily;
        const face = [...node.ownerDocument.fonts].find(face => face.family === family);
        return face?.status === 'loaded' ? family : null;
    });
    assert.match(family, /^tw-field-font-/);
    assert.equal(await widget.locator('img[alt="Insecure image"], img[alt="Unmarked image"]').count(), 0);
    for (const label of ['Denied image', 'Redirected image', 'Wrong MIME']) {
        assert.equal(await widget.getByAltText(label).getAttribute('src'), null);
    }
    return family;
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
