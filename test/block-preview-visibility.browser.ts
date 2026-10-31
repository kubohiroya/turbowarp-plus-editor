import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {cp, mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {startYamlEditorHost} from '../scripts/yaml-editor/host.ts';

test('native preview stays invisible until layout completes and cancelled renders stay hidden',
    {timeout: 120000}, async () => {
        const input = process.env.TWPE_YAML_SITE;
        assert(input && path.isAbsolute(input), 'Use an owned local Editor build.');
        const output = process.env.TWPE_YAML_EVIDENCE ||
            await mkdtemp(path.join(tmpdir(), 'twpe-preview-visibility-'));
        await mkdir(output, {recursive: true});
        const owned = await mkdtemp(path.join(tmpdir(), 'twpe-preview-visibility-site-'));
        const site = path.join(owned, 'site');
        await cp(input, site, {recursive: true});
        await build({
            entryPoints: [fileURLToPath(import.meta.resolve('@kubohiroya/turbowarp-document-editor/block-preview'))],
            outfile: path.join(site, 'static/preview-visibility.mjs'),
            bundle: true, platform: 'browser', format: 'esm', logLevel: 'silent'
        });
        const host = await startYamlEditorHost({
            siteDirectory: site, dataDirectory: path.join(owned, 'work'),
            launchEditor: async () => {throw new Error('This test must not launch VSCode.');}
        });
        const browser = await chromium.launch({
            headless: true,
            ...(process.env.TWPE_CHROME_EXECUTABLE ?
                {executablePath: process.env.TWPE_CHROME_EXECUTABLE} : {})
        });
        const page = await browser.newPage({viewport: {width: 1280, height: 900}});
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
            const base = host.apiOrigin + '/turbowarp-plus-editor/';
            await page.goto(base + 'editor.html?lang=ja');
            await page.waitForFunction(() =>
                window.vm?.runtime.targets.length && window.ScratchBlocks?.getMainWorkspace());
            const result = await page.evaluate(async base => {
                const {renderBlockPreview} = await import(base + 'static/preview-visibility.mjs');
                const B = window.ScratchBlocks, main = B.getMainWorkspace();
                const original = window.vm.toJSON();
                const container = document.createElement('div');
                container.style.cssText = 'position:fixed;inset:90px 20px 20px;z-index:99999;';
                document.body.append(container);
                const ids = Array.from({length: 96}, (_, index) => 'previewRow' + index);
                const model = {
                    source: 'A large native preview', rootIds: ids,
                    blocks: Object.fromEntries(ids.map(id => [id, {
                        opcode: 'text', fields: {TEXT: [id, null]}, inputs: {}, next: null
                    }]))
                };
                const visible = element => {
                    const css = getComputedStyle(element);
                    return css.visibility === 'visible' && css.display !== 'none' &&
                        element.getBoundingClientRect().width > 0;
                };
                async function render(cancel) {
                    const controller = new AbortController();
                    const frames = [];
                    let active = true, frame;
                    const inspect = () => {
                        const surface = container.querySelector<HTMLElement>('[data-twpe-block-preview]');
                        if (surface) {
                            frames.push({
                                visible: visible(surface),
                                svgBlocks: surface.querySelectorAll('.blocklyBlockCanvas > g').length
                            });
                            if (cancel) controller.abort();
                        }
                        if (active) frame = requestAnimationFrame(inspect);
                    };
                    frame = requestAnimationFrame(inspect);
                    try {
                        const handle = await renderBlockPreview({
                            container, model, getScratch: () => ({gui: {getBlockly: async () => B}}),
                            vm: window.vm, signal: controller.signal
                        });
                        const surface = container.querySelector<HTMLElement>('[data-twpe-block-preview]');
                        const workspace = B.Workspace.getById(surface.dataset.workspaceId);
                        const roots = workspace.getTopBlocks(false).map(block => {
                            const xy = block.getRelativeToSurfaceXY();
                            return {x: xy.x, y: xy.y, height: block.getHeightWidth().height};
                        }).sort((a, b) => a.y - b.y);
                        const ready = visible(surface);
                        handle.dispose();
                        return {frames, ready, roots};
                    } catch (error) {
                        if (!cancel || error.name !== 'AbortError') throw error;
                        return {frames, cancelled: true, remaining: container.childElementCount};
                    } finally {
                        active = false;
                        cancelAnimationFrame(frame);
                    }
                }
                try {
                    const complete = await render(false);
                    const cancelled = await render(true);
                    return {
                        complete, cancelled, mainUnchanged: B.getMainWorkspace() === main,
                        projectUnchanged: window.vm.toJSON() === original
                    };
                } finally {container.remove();}
            }, base);
            await writeFile(path.join(output, 'result.json'), JSON.stringify({result, errors}, null, 2));
            assert(result.complete.frames.length > 0, 'Exercise real browser frames during chunked rendering.');
            assert.deepEqual(result.complete.frames.filter(frame => frame.visible), [],
                'Unfinished blocks must never appear in a painted frame.');
            assert(result.complete.ready, 'Show the completed workspace.');
            assert.equal(result.complete.roots.length, 96);
            for (let index = 1; index < result.complete.roots.length; index++) {
                const previous = result.complete.roots[index - 1], current = result.complete.roots[index];
                assert(current.y >= previous.y + previous.height, 'Completed roots must not overlap.');
            }
            assert(result.cancelled.cancelled);
            assert(result.cancelled.frames.length > 0);
            assert.deepEqual(result.cancelled.frames.filter(frame => frame.visible), []);
            assert.equal(result.cancelled.remaining, 0);
            assert(result.mainUnchanged);
            assert(result.projectUnchanged);
            assert.deepEqual(errors, []);
        } finally {
            await browser.close();
            await host.close();
        }
    });
