import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {build} from 'esbuild';
import type {EditorHost, verifyEditorHost} from '@kubohiroya/turbowarp-plus-editor-host';
import {verifyWebEditor} from '../scripts/site/editor-revision.ts';

type TestWindow = Window & {
    __twPlusCaptureEditorHost?(host: EditorHost): void;
    editorHost?: EditorHost;
    editorHostVerification?: {verifyEditorHost: typeof verifyEditorHost};
};

test('the Editor keeps to the shared editor host contract', {timeout: 60000}, async t => {
    const directory = process.env.E2E_PROJECT_FOLDER_BUILD;
    assert.ok(directory && path.isAbsolute(directory), 'Set E2E_PROJECT_FOLDER_BUILD to the built Editor directory');
    const root = path.resolve(directory);
    await verifyWebEditor(root);

    const verification = await build({
        entryPoints: [fileURLToPath(import.meta.resolve('@kubohiroya/turbowarp-plus-editor-host'))],
        bundle: true, write: false, format: 'iife', globalName: 'editorHostVerification',
        // Playwright runs init scripts inside a function, so expose the bundle explicitly.
        footer: {js: 'globalThis.editorHostVerification = editorHostVerification;'}
    });
    const args = ['--enable-unsafe-swiftshader'];
    if (process.platform === 'darwin') args.push('--single-process', '--no-zygote', '--disable-crash-reporter');
    const browser = await chromium.launch({headless: true, args});
    t.after(() => browser.close());
    const page = await browser.newPage();
    const origin = 'http://localhost:41015';
    const prefix = '/turbowarp-plus-editor/';
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin || !url.pathname.startsWith(prefix)) return route.abort();
        const filename = path.resolve(root, decodeURIComponent(url.pathname.slice(prefix.length)));
        if (!filename.startsWith(root + path.sep)) return route.abort();
        try {
            await route.fulfill({path: filename});
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            await route.fulfill({status: 404});
        }
    });
    await page.addInitScript({content: verification.outputFiles[0].text});
    await page.addInitScript(() => {
        const state = window as TestWindow;
        state.__twPlusCaptureEditorHost = host => {state.editorHost = host;};
    });
    await page.goto(`${origin}${prefix}editor.html?lang=en`);
    await page.waitForFunction(() => window.vm?.editingTarget && window.vm.runtime.targets.length > 1 &&
        Boolean(window.ScratchBlocks?.getMainWorkspace()), null, {timeout: 45000});

    const failures = await page.evaluate(async () => {
        const state = window as TestWindow;
        const host = state.editorHost;
        if (!host) throw new Error('The Editor did not supply a host. Build with TW_PLUS_TEST_EDITOR_HOST=1.');
        if (host.vm !== window.vm) throw new Error('The host belongs to a different VM');
        // Exercise the dirty-to-saved transition and its notification on the disposable starter project.
        window.vm.runtime.emitProjectChanged();
        if (!host.isProjectDirty()) throw new Error('The starter project did not become dirty');
        return state.editorHostVerification.verifyEditorHost(host);
    });
    assert.deepEqual(failures, [], 'The Editor host violated the shared contract');
});
