import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {chromium, expect} from '@playwright/test';
import type {TestResult} from '@kubohiroya/turbowarp-plus-editor-test/test-runner';
import JSZip from '@turbowarp/jszip';
import {build} from 'esbuild';
import {verifyEditorRevision, verifyWebEditor} from '../scripts/site/editor-revision.ts';

const require = createRequire(import.meta.url);
const {project} = require('./e2e/extension-loader/project.cts');
const {readPinsSync} = require('../scripts/site/locked-pins.cts');
const {catalogURL} = require('./e2e/extension-loader/catalog.cts');
const clampSource = fileURLToPath(new URL('./e2e/extension-loader/fixtures/typed-clamp.ts', import.meta.url));
const localOrigin = 'http://localhost:41015';
const publishedOrigin = 'https://kubohiroya.github.io';
const prefix = '/turbowarp-plus-editor/';

const extensionId = 'typedclamp';
const testExtension = {id: 'kubohiroyatest', url: 'https://kubohiroya.github.io/turbowarp-test/dist/turbowarp-test.js',
    sha256: '7f6541ce906594cde7d02498c65e8a800f0c194a924d288f9de4d702e738d868'};
const testName = 'clamp respects the upper bound';
const assertId = 'check-clamp-result';
const stageBlocks = {
    'clamp-test': {
        opcode: 'kubohiroyatest_whentest', next: assertId, parent: null, inputs: {NAME: [1, [10, testName]]}, fields: {},
        shadow: false, topLevel: true, x: 40, y: 40
    },
    [assertId]: {
        opcode: 'kubohiroyatest_assert_strict_equals', next: null, parent: 'clamp-test',
        inputs: {ACTUAL: [2, 'clamp'], EXPECTED: [1, [4, 10]]}, fields: {}, shadow: false, topLevel: false
    },
    clamp: {
        opcode: 'typedclamp_clamp', next: null, parent: assertId,
        inputs: {VALUE: [1, [4, '15']], LOWER: [1, [4, '0']], UPPER: [1, [4, '10']]},
        fields: {}, shadow: false, topLevel: false
    }
};

async function buildProject(includeUpperBound: boolean, testCode: Buffer) {
    const {outputFiles} = await build({
        entryPoints: [clampSource],
        bundle: true,
        format: 'iife',
        platform: 'browser',
        write: false,
        define: {INCLUDE_UPPER_BOUND: String(includeUpperBound)}
    });
    const code = Buffer.from(outputFiles[0].contents);
    const sha256 = createHash('sha256').update(code).digest('hex');
    const zip = await JSZip.loadAsync(await project({id: extensionId, execution: 'sandboxed', code, sha256,
        stageBlocks, embeddedPath: 'extensions/typedclamp.js'}));
    const json = JSON.parse(await zip.file('project.json').async('string'));
    const testPath = 'extensions/turbowarp-test.js';
    json.extensions.push(testExtension.id);
    json.turboWarpPlus.extensions.push({id: testExtension.id, execution: 'unsandboxed', sha256: testExtension.sha256,
        source: {type: 'embedded-file', path: testPath}});
    zip.file(testPath, testCode);
    zip.file('project.json', JSON.stringify(json));
    return {sha256, targets: json.targets, sb3: await zip.generateAsync({type: 'nodebuffer'})};
}

test('the Editor test VM runs the same Scratch test before and after a TypeScript fix',
    {timeout: 120_000}, async t => {
        const buildDirectory = process.env.E2E_EXTENSION_TEST_BUILD;
        const published = process.env.E2E_EXTENSION_TEST_USE_PUBLISHED === '1';
        assert.ok(published ? !buildDirectory : buildDirectory && path.isAbsolute(buildDirectory),
            'Set either E2E_EXTENSION_TEST_BUILD to the built Editor directory or E2E_EXTENSION_TEST_USE_PUBLISHED=1.');
        const origin = published ? publishedOrigin : localOrigin;
        const metadataURL = `${origin}${prefix}build-info.json`;
        const readPublishedInfo = async () => {
            const response = await fetch(metadataURL, {redirect: 'error', cache: 'no-store'});
            assert.equal(response.status, 200);
            return response.text();
        };
        const readInfo = published ? readPublishedInfo : () => readFile(path.join(buildDirectory, 'build-info.json'), 'utf8');
        if (published) await verifyEditorRevision(metadataURL, 'siteRevision', readInfo);
        else await verifyWebEditor(buildDirectory);
        const metadata = await readInfo();
        const info = JSON.parse(metadata);
        assert.equal(info.siteRevision, process.env.E2E_EXPECT_SITE_REVISION);
        const pins = readPinsSync();
        assert.equal(info.revision, pins.guiRevision);
        assert.equal(info.securityVersion, pins.securityVersion);
        assert.equal(info.extensionIntegration?.loaderVersion, pins.loaderVersion);
        assert.equal(info.extensionIntegration?.vmRevision, pins.vmRevision);

        const testExtensionPath = process.env.E2E_TEST_EXTENSION_JS;
        assert.ok(testExtensionPath && path.isAbsolute(testExtensionPath),
            'Set E2E_TEST_EXTENSION_JS to the built turbowarp-test.js fixture.');
        const testCode = await readFile(testExtensionPath);
        assert.equal(createHash('sha256').update(testCode).digest('hex'), testExtension.sha256);
        const faulty = await buildProject(false, testCode);
        const corrected = await buildProject(true, testCode);
        assert.notEqual(faulty.sha256, corrected.sha256);
        assert.deepEqual(faulty.targets, corrected.targets);

        const args = ['--enable-unsafe-swiftshader'];
        // Keep renderer isolation: this test closes one context and opens another.
        const browser = await chromium.launch({headless: true, args, executablePath: process.env.E2E_EXTENSION_TEST_CHROMIUM});
        t.after(() => browser.close());
        const publishedAssets = new Map<string, Promise<{status: number; contentType?: string; body: Buffer}>>();
        function publishedAsset(url: URL) {
            let asset = publishedAssets.get(url.href);
            if (!asset) {
                // Use Node's proxy/CA transport for real Pages bytes. Repeat requests use
                // the same bytes across the separated browser contexts.
                asset = fetch(url, {redirect: 'error'}).then(async response => ({
                    status: response.status,
                    contentType: response.headers.get('content-type') ?? undefined,
                    body: Buffer.from(await response.arrayBuffer())
                }));
                publishedAssets.set(url.href, asset);
            }
            return asset;
        }

        async function openEditor() {
            const context = await browser.newContext({serviceWorkers: 'block'});
            await context.route('**/*', async route => {
                const url = new URL(route.request().url());
                if (url.origin !== origin || !url.pathname.startsWith(prefix)) return route.abort();
                if (published) return route.fulfill(await publishedAsset(url));
                const root = path.resolve(buildDirectory);
                const filename = path.resolve(root, decodeURIComponent(url.pathname.slice(prefix.length)));
                if (!filename.startsWith(root + path.sep)) return route.abort();
                try {
                    return await route.fulfill({path: filename});
                } catch (error) {
                    if (error.code !== 'ENOENT') throw error;
                    return route.fulfill({status: 404});
                }
            });
            await context.route(catalogURL, route => route.fulfill({json: {schemaVersion: 1, extensions: [
                {...testExtension, name: 'Test', version: '0.1.0', unsandboxed: 'required', dependencies: [],
                    description: 'Scratch test hats and assertions', license: 'MPL-2.0'}
            ]}, headers: {'access-control-allow-origin': '*'}}));
            const page = await context.newPage();
            const reported: TestResult[] = [];
            await page.exposeFunction('recordScratchTestResult', (result: TestResult) => { reported.push(result); });
            await page.addInitScript(() => {
                window.addEventListener('message', event => {
                    if (event.origin !== location.origin || event.data?.type !== 'twpe-test:end') return;
                    // The view may be a tab of this page or a window of its own; either way its frame reports here.
                    let frame: Element | null = null;
                    try {
                        frame = (event.source as Window | null)?.frameElement ?? null;
                    } catch {
                        // A window of another origin is not the test frame.
                    }
                    if (frame?.getAttribute('title') === 'Test stage' && 'recordScratchTestResult' in window &&
                        typeof window.recordScratchTestResult === 'function') {
                        window.recordScratchTestResult(event.data.result);
                    }
                });
            });

            await page.goto(`${origin}${prefix}editor.html?lang=en`);
            await page.waitForFunction(() => Boolean(window.vm?.runtime.getTargetForStage()));

            // The view opens as a workspace tab, or in a window of its own when the layout takes no tabs.
            let viewPage = page;
            let runView = page.locator('.twpe-test-run');
            let result = runView.locator('.twpe-test-run__test').filter({hasText: testName});
            const marked = page.locator('.blocklyWorkspace g.twpe-test-failure');
            async function runProject(sb3: Buffer, status: 'failed' | 'passed', actual: number, expectedBuild: string, assertionId = assertId) {
                const loading = page.evaluate(async archive => {
                    await window.vm.loadProject(new Uint8Array(archive));
                }, [...sb3]);
                const review = page.getByRole('dialog').filter({has: page.locator('.twextsec-review')});
                await expect(review.getByTestId('twextsec-enable-all')).toBeVisible();
                await review.getByTestId('twextsec-enable-all').click();
                await loading;
                if (!await runView.isVisible()) {
                    // The stage launcher's menu in the workbench layout, or the stage display menu otherwise.
                    await page.getByRole('button', {name: /^Run view (opening options|display)$/u}).click();
                    const popup = page.context().waitForEvent('page', {timeout: 5_000}).catch(() => null);
                    await page.getByText('Open the test run view', {exact: true}).click();
                    if (!await runView.isVisible()) {
                        const opened = await popup;
                        assert.ok(opened, 'The test run view opened neither as a tab nor as a window');
                        viewPage = opened;
                        runView = viewPage.locator('.twpe-test-run');
                        result = runView.locator('.twpe-test-run__test').filter({hasText: testName});
                    }
                }
                await expect(result).toBeVisible();
                const before = reported.length;
                await result.getByRole('button', {name: `Run: ${testName}`, exact: true}).click();
                await expect(runView.getByRole('status')).toHaveText(status === 'failed' ?
                    '1 tests: 0 passed, 1 failed, 0 timed out, 0 errors' : '1 tests: 1 passed, 0 failed, 0 timed out, 0 errors',
                    {timeout: published ? 20_000 : 5_000});
                await expect(result).toHaveAttribute('data-status', status);
                await expect.poll(() => reported.length).toBe(before + 1);
                await expect.poll(() => reported.at(-1)).toMatchObject({name: testName, status,
                    builds: [{extensionId, sha256: expectedBuild}], assertions: [
                    {kind: 'strict-equals', blockId: assertionId, passed: status === 'passed', expected: 10, actual}
                ]});
                await expect(result.getByRole('list', {name: 'Tested builds'})).toContainText(expectedBuild);
                if (status === 'failed') {
                    await expect(result.locator('code').filter({hasText: /^(10|15)$/u})).toHaveText(['10', '15']);
                    await expect(result.getByRole('button', {name: 'Show block'})).toHaveAttribute('data-block-id', assertionId);
                    // The failed check is marked on its block in the code area, with why it failed.
                    await result.getByRole('button', {name: 'Show block'}).click();
                    await expect(marked).toHaveCount(1);
                    await expect(marked).toHaveAttribute('data-id', assertionId);
                    await expect(marked.locator(':scope > .twpe-test-failure__badge > title'))
                        .toHaveText(`Not equal by === / Expected: 10 / Actual: ${actual}`);
                } else {
                    // A new run starts over the marks of the last one.
                    await expect(marked).toHaveCount(0);
                }
                t.diagnostic(`${status}: ${assertionId}, expected 10, actual ${actual}`);
            }

            return {context, page, viewPage: () => viewPage, runProject};
        }

        const editor = await openEditor();
        await editor.runProject(faulty.sb3, 'failed', 15, faulty.sha256);
        await editor.runProject(corrected.sb3, 'passed', 10, corrected.sha256);

        const saved = Buffer.from(await editor.page.evaluate(async () =>
            [...await window.vm.saveProjectSb3('uint8array')]));
        const archive = await JSZip.loadAsync(saved);
        const savedProject = JSON.parse(await archive.file('project.json').async('string'));
        const stage = savedProject.targets.find(target => target.isStage);
        // Scratch VM compresses block IDs when it saves to SB3. Follow the saved links rather
        // than assuming the original workspace IDs survive regular serialization.
        const hats = Object.entries(stage.blocks).filter(([, block]) =>
            (block as typeof stageBlocks['clamp-test']).opcode === 'kubohiroyatest_whentest');
        assert.equal(hats.length, 1);
        const [savedHatId, savedHat] = hats[0] as [string, typeof stageBlocks['clamp-test']];
        const savedAssertionId = savedHat.next;
        const savedAssertion = stage.blocks[savedAssertionId];
        assert.equal(savedAssertion.opcode, 'kubohiroyatest_assert_strict_equals');
        assert.equal(savedAssertion.parent, savedHatId);
        const savedReporter = stage.blocks[savedAssertion.inputs.ACTUAL[1]];
        assert.equal(savedReporter.opcode, 'typedclamp_clamp');
        assert.equal(savedReporter.parent, savedAssertionId);
        for (const [id, digest] of [[extensionId, corrected.sha256], [testExtension.id, testExtension.sha256]]) {
            const spec = savedProject.turboWarpPlus.extensions.find(entry => entry.id === id);
            assert.equal(spec?.source.type, 'embedded-file');
            assert.equal(spec.sha256, digest);
            assert.equal(createHash('sha256').update(await archive.file(spec.source.path).async('nodebuffer')).digest('hex'),
                digest);
        }
        await editor.context.close();
        const {page, viewPage, runProject} = await openEditor();
        await runProject(saved, 'passed', 10, corrected.sha256, savedAssertionId);

        // The reused VM cannot carry an approval over to another run whose own snapshot did not authorize that code.
        // The frame takes requests only from the Editor window and answers there, even when the view is a window.
        const rejected = await page.evaluate(([archive, inWindow]) => new Promise<string>((resolve, reject) => {
            const view = inWindow ? window.open('', 'tw-plus-test-run')?.document : document;
            const frame = view?.querySelector<HTMLIFrameElement>('iframe[title="Test stage"]');
            if (!frame?.contentWindow) throw new Error('No test frame');
            const id = 'missing-current-grant';
            const timer = setTimeout(() => { cleanup(); reject(new Error('No test-frame response')); }, 5_000);
            function cleanup() {
                clearTimeout(timer);
                window.removeEventListener('message', onMessage);
            }
            function onMessage(event: MessageEvent) {
                if (event.source !== frame.contentWindow || event.origin !== location.origin || event.data?.id !== id) return;
                if (event.data.type === 'twpe-test:done' || event.data.type === 'twpe-test:failed') {
                    cleanup();
                    resolve(event.data.type === 'twpe-test:failed' ? event.data.message : 'Unexpectedly completed');
                }
            }
            window.addEventListener('message', onMessage);
            frame.contentWindow.postMessage({type: 'twpe-test:run', id, project: new Uint8Array(archive as number[]).buffer}, location.origin);
        }), [[...corrected.sb3], viewPage() !== page] as const);
        assert.match(rejected, /did not approve this exact extension digest/i);
        if (published) assert.equal(await readPublishedInfo(), metadata, 'Published Editor changed during the test');
    });
