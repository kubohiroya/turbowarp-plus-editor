import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {chromium, expect} from '@playwright/test';
import JSZip from '@turbowarp/jszip';
import {build} from 'esbuild';
import {verifyWebEditor} from '../scripts/site/editor-revision.ts';

const require = createRequire(import.meta.url);
const {project} = require('./e2e/extension-loader/project.cts');
const {readPinsSync} = require('../scripts/site/locked-pins.cts');
const {catalogURL} = require('./e2e/extension-loader/catalog.cts');
const clampSource = fileURLToPath(new URL('./e2e/extension-loader/fixtures/typed-clamp.ts', import.meta.url));
const origin = 'http://localhost:41015';
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
    {timeout: 60_000}, async t => {
        const buildDirectory = process.env.E2E_EXTENSION_TEST_BUILD;
        assert.ok(buildDirectory && path.isAbsolute(buildDirectory),
            'Set E2E_EXTENSION_TEST_BUILD to the built Editor directory.');
        const root = path.resolve(buildDirectory);
        await verifyWebEditor(root);
        const info = JSON.parse(await readFile(path.join(root, 'build-info.json'), 'utf8'));
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
        if (process.platform === 'darwin') args.push('--single-process', '--no-zygote', '--disable-crash-reporter');
        const browser = await chromium.launch({headless: true, args});
        t.after(() => browser.close());
        const context = await browser.newContext({serviceWorkers: 'block'});
        await context.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (url.origin !== origin || !url.pathname.startsWith(prefix)) return route.abort();
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
            {...testExtension, name: 'Test', version: '0.1.0', unsandboxed: true, dependencies: [],
                description: 'Scratch test hats and assertions', license: 'MPL-2.0'}
        ]}, headers: {'access-control-allow-origin': '*'}}));
        const page = await context.newPage();

        await page.goto(`${origin}${prefix}editor.html?lang=en`);
        await page.waitForFunction(() => Boolean(window.vm?.runtime.getTargetForStage()));

        const runView = page.locator('.twpe-test-run');
        const result = runView.locator('.twpe-test-run__test').filter({hasText: testName});
        for (const [candidate, status] of [[faulty, 'failed'], [corrected, 'passed']] as const) {
            const loading = page.evaluate(async archive => {
                await window.vm.loadProject(new Uint8Array(archive));
            }, [...candidate.sb3]);
            const review = page.getByRole('dialog').filter({has: page.locator('.twextsec-review')});
            await expect(review.getByTestId('twextsec-enable-all')).toBeVisible();
            await review.getByTestId('twextsec-enable-all').click();
            await loading;
            if (!await runView.isVisible()) {
                await page.getByRole('button', {name: 'Run view opening options'}).click();
                await page.getByText('Open the test run view', {exact: true}).click();
            }
            await expect(result).toBeVisible();
            await runView.getByRole('button', {name: 'Run all'}).click();
            await expect(runView.getByRole('status')).toHaveText(status === 'failed' ?
                '1 tests: 0 passed, 1 failed, 0 timed out, 0 errors' : '1 tests: 1 passed, 0 failed, 0 timed out, 0 errors');
            await expect(result).toHaveAttribute('data-status', status);
            if (status === 'failed') {
                await expect(result.locator('code')).toHaveText(['10', '15']);
                await expect(result.getByRole('button', {name: 'Show block'})).toHaveAttribute('data-block-id', assertId);
            }
        }

        // The reused VM cannot carry an approval over to another run whose own snapshot did not authorize that code.
        const rejected = await page.evaluate(archive => new Promise<string>((resolve, reject) => {
            const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Test stage"]');
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
            frame.contentWindow.postMessage({type: 'twpe-test:run', id, project: new Uint8Array(archive).buffer}, location.origin);
        }), [...corrected.sb3]);
        assert.match(rejected, /did not approve this exact extension digest/i);
    });
