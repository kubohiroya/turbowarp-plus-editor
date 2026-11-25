import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {chromium, expect} from '@playwright/test';
import {build} from 'esbuild';
import {verifyWebEditor} from '../scripts/site/editor-revision.ts';

const require = createRequire(import.meta.url);
const {project} = require('./e2e/extension-loader/project.cts');
const {readPinsSync} = require('../scripts/site/locked-pins.cts');
const clampSource = fileURLToPath(new URL('./e2e/extension-loader/fixtures/typed-clamp.ts', import.meta.url));
const origin = 'http://localhost:41015';
const prefix = '/turbowarp-plus-editor/';

const extensionId = 'typedclamp';
const observedId = 'clamp-observed';
const pendingValue = 'pending';
const stageVariables = {[observedId]: ['observed', pendingValue]};
const stageBlocks = {
    start: {
        opcode: 'event_whenflagclicked', next: 'store', parent: null, inputs: {}, fields: {},
        shadow: false, topLevel: true, x: 40, y: 40
    },
    store: {
        opcode: 'data_setvariableto', next: null, parent: 'start', inputs: {VALUE: [2, 'clamp']},
        fields: {VARIABLE: ['observed', observedId]}, shadow: false, topLevel: false
    },
    clamp: {
        opcode: 'typedclamp_clamp', next: null, parent: 'store',
        inputs: {VALUE: [1, [4, '15']], LOWER: [1, [4, '0']], UPPER: [1, [4, '10']]},
        fields: {}, shadow: false, topLevel: false
    }
};

async function buildProject(includeUpperBound: boolean) {
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
    return {
        sha256,
        sb3: await project({id: extensionId, execution: 'sandboxed', code, sha256,
            stageVariables, stageBlocks, embeddedPath: 'extensions/typedclamp.js'})
    };
}

test('the same Scratch script sees the failing and corrected builds of a sandboxed TypeScript extension',
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

        const faulty = await buildProject(false);
        const corrected = await buildProject(true);
        assert.notEqual(faulty.sha256, corrected.sha256);

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
        const page = await context.newPage();

        await page.goto(`${origin}${prefix}editor.html?lang=en`);
        await page.waitForFunction(() => Boolean(window.vm?.runtime.getTargetForStage()));

        for (const [candidate, expectedValue] of [[faulty, 15], [corrected, 10]] as const) {
            const loading = page.evaluate(async archive => {
                await window.vm.loadProject(new Uint8Array(archive));
            }, [...candidate.sb3]);
            const review = page.getByRole('dialog').filter({has: page.locator('.twextsec-review')});
            await expect(review.getByTestId('twextsec-enable-all')).toBeVisible();
            await review.getByTestId('twextsec-enable-all').click();
            await loading;

            const readObserved = () => page.evaluate(id => window.vm.runtime.getTargetForStage().variables[id].value,
                observedId);
            expect(await readObserved()).toBe(pendingValue);
            // Run the fixture script through the VM. The project test runner is tracked separately in #774.
            await page.evaluate(() => {
                const {runtime} = window.vm;
                runtime.startHats('event_whenflagclicked', undefined, runtime.getTargetForStage());
            });
            await expect.poll(readObserved).toBe(expectedValue);
        }
    });
