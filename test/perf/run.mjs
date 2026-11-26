import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import {performance} from 'node:perf_hooks';
import {build as bundle} from 'esbuild';
import {buildSb3} from '@kubohiroya/sb3-toolchain';
import JSZip from '@turbowarp/jszip';
import {prepare, lock, sha256} from './prepare.mjs';
import {environment, shell, openFile, openFolder, expect} from './browser.mjs';

const {values} = parseArgs({options: {build: {type: 'string'}, directory: {type: 'string', default: '.host/perf'},
    iterations: {type: 'string', default: '5'}, only: {type: 'string'}, output: {type: 'string', default: '.host/perf/results.json'}}});
assert.ok(values.build && path.isAbsolute(values.build), 'Pass --build /absolute/path/to/pinned/gui/build');
const iterations = Number(values.iterations);
assert.ok(Number.isInteger(iterations) && iterations > 0);
const selected = new Set((values.only || '1,2,3,4,5,6,7,8,9,10,11,12,13,14').split(',').map(Number));
const fixture = await prepare(values.directory);
const info = JSON.parse(await readFile(path.join(values.build, 'build-info.json')));
const source = JSON.parse(await readFile(new URL('../../site/source.json', import.meta.url)));
for (const [actual, expected] of [[info.revision, source.guiRevision], [info.extensionIntegration.vmRevision, source.vmRevision],
    [info.extensionIntegration.packagerRevision, source.packagerRevision]]) assert.equal(actual, expected);
const lockfile = JSON.parse(await readFile(new URL('../../package-lock.json', import.meta.url)));
const packages = Object.fromEntries(Object.entries(lockfile.packages).filter(([key]) => key.startsWith('node_modules/@kubohiroya/'))
    .map(([key, value]) => [key.slice('node_modules/'.length), {version: value.version, integrity: value.integrity}]));
const thresholds = {1: 10000, 2: 10000, 3: 1000, 4: 1000, 5: 1000, 6: 100, 7: 1000, 8: 1000,
    9: 1000, 10: 1000, 11: 1000, 12: 10000, 13: 10000, 14: 1000};
const result = {schemaVersion: 1, startedAt: new Date().toISOString(), input: lock, editor: info, packages,
    environment: {platform: process.platform, os: os.release(), machine: process.platform === 'darwin' ? execFileSync('sysctl', ['-n', 'hw.model'], {encoding:'utf8'}).trim() : os.machine(), cpu: os.cpus()[0].model, logicalCpus: os.cpus().length,
        memoryBytes: os.totalmem(), node: process.version, viewport: {width: 1360, height: 900}, headless: true},
    cachePolicy: 'Fresh browser context for each cold cycle; warm cycle reuses the same context. HTTP caching disabled by routing; source/network bytes are fixed local mirrors. The browser process is restarted per cold/warm pair; OS filesystem cache is not flushed.',
    samples: [], errors: []};
const persist = async () => {await mkdir(path.dirname(values.output), {recursive: true});
    await writeFile(values.output, JSON.stringify(result, null, 2) + '\n');};
const record = async (id, phase, iteration, ms, evidence = {}) => {
    assert.ok(Number.isFinite(ms) && ms >= 0);
    result.samples.push({id, phase, iteration, ms, thresholdMs: thresholds[id], ...evidence});
    console.log(JSON.stringify(result.samples.at(-1))); await persist();
};
await bundle({stdin:{contents:"export {attachWorkspaceOverview} from '@kubohiroya/turbowarp-plus-editor-code-views/sprite-code-windows';",resolveDir:process.cwd()},bundle:true,format:'iife',globalName:'PerfOverview',platform:'browser',loader:{'.css':'empty'},outfile:path.join(fixture.directory,'overview.js')});
result.overviewBundleSha256=sha256(await readFile(path.join(fixture.directory,'overview.js')));
result.measurementSources=Object.fromEntries(await Promise.all(['prepare.mjs','browser.mjs','run.mjs','report.mjs'].map(async file=>[file,sha256(await readFile(new URL(file,import.meta.url)))])));
let env;
const tabs = page => page.locator('.tw-plus-sprite-toolbar[data-active-group="true"]');
const section = (page, name) => tabs(page).getByRole('tab', {name, exact: true});
const stage = async page => {await page.evaluate(() => vm.setEditingTarget(vm.runtime.getTargetForStage().id));
    await section(page, 'Free layout').click();
    await page.waitForFunction(() => ScratchBlocks.getMainWorkspace().getTopBlocks(false).length === vm.editingTarget.blocks.getScripts().length, null, {timeout:15000});};
try {
    for (let iteration = 0; iteration < iterations; iteration++) {
        assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:fixture.folder,encoding:'utf8'}).trim(),fixture.historyHead);
        await rm(path.join(fixture.folder,'.tw-plus'),{recursive:true,force:true});
        env=await environment(values.build,fixture.directory);
        result.environment.chromium=env.browser.version();
        const context = await env.context();
        try {
            const original = await shell(context, env.base);
            for (const phase of ['cold', 'warm']) {
                const opened = await openFile(original, fixture.input);
                const page = opened.page;
                try {
                    if (selected.has(1)) await record(1, phase, iteration, opened.ms,
                        {readyEvidence:opened.readyEvidence,boundary: 'Receiving File.arrayBuffer start → VM with 8 targets and rendered workspace; automated approval included'});
                    if (selected.has(11)) {
                        const checks = await page.evaluate(hashes => {
                            const records = new Map();
                            for (const item of window.__digests) if (hashes.includes(item.sha256) && !records.has(item.sha256)) records.set(item.sha256,item);
                            return [...records.values()];
                        }, lock.extensions.filter(e=>!e.builtin).map(e=>e.sha256));
                        result.actualEditorDigestObservations ??= [];
                        result.actualEditorDigestObservations.push({phase,iteration,checks});
                    }
                    await stage(page);
                    if (selected.has(14)) {
                        await page.addScriptTag({url: env.base + 'perf-overview.js'});
                        const measurement = await page.evaluate(async () => {
                            let attachment, map;
                            const previous = new Set(document.querySelectorAll('[data-workspace-minimap]'));
                            const ms = await __paint(() => {
                                attachment = PerfOverview.attachWorkspaceOverview({workspace: ScratchBlocks.getMainWorkspace(), ScratchBlocks});
                                map = [...document.querySelectorAll('[data-workspace-minimap]')].find(e => !previous.has(e));
                            }, () => map?.querySelectorAll('path').length > 0);
                            const paths = map.querySelectorAll('path').length;
                            attachment.dispose();
                            return {ms, paths};
                        });
                        await record(14, phase, iteration, measurement.ms, {paths: measurement.paths,
                            boundary: 'Fresh Code Views attachWorkspaceOverview on the real Stage workspace → nonempty map and two animation frames; excludes VM load'});
                    }

                    if (selected.has(3)) {
                        const ms = await page.evaluate(() => __paint(() => __tab('Calls'),
                            () => document.querySelectorAll('.tw-sprite-functions__node').length === 74 &&
                                document.querySelectorAll('.tw-sprite-functions__edges path[data-edge]').length === 105));
                        await record(3, phase, iteration, ms, {nodes: 74, edges: 105, scope: 'Stage calls graph, functions + message relations'});
                        await section(page, 'Free layout').click();
                    }
                    if (selected.has(4)) {
                        const ms = await page.evaluate(() => __paint(() => __tab('Messages'),
                            () => document.querySelectorAll('.tw-sprite-messages__edge').length > 0));
                        await record(4, phase, iteration, ms, {edges: await page.locator('.tw-sprite-messages__edge').count(),
                            nodes: await page.locator('.tw-sprite-messages__node').count(), scope: 'Stage message pane, default send direction'});
                        await section(page, 'Free layout').click();
                    }
                    if (selected.has(8)) {
                        const ms = await page.evaluate(() => __paint(() => __tab('Global Variables'),
                            () => document.querySelectorAll('.tw-sprite-variables__references a').length === 36));
                        await record(8, phase, iteration, ms, {rows: await page.locator('.tw-sprite-variables__references a').count() / 2, references: await page.locator('.tw-sprite-variables__references a').count(), scope: 'Stage global variables and lists, read/write references'});
                        await section(page, 'Free layout').click();
                    }
                    if (selected.has(6) || selected.has(7)) {
                        const search = page.getByRole('combobox', {name: 'Search project', exact: true});
                        await search.click();
                        const ms = await page.evaluate(() => __paint(() => {
                            const input = document.querySelector('[role="combobox"][aria-label="Search project"]');
                            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'poseIndex');
                            input.dispatchEvent(new Event('input', {bubbles: true}));
                        }, () => document.querySelectorAll('[role="listbox"][aria-label="Search results"] [role="option"]').length > 0));
                        if (selected.has(6)) await record(6, phase, iteration, ms,
                            {query: 'poseIndex', displayedResults: await page.getByRole('listbox', {name: 'Search results'}).getByRole('option').count()});
                        if (selected.has(7)) {
                            await page.getByRole('listbox', {name: 'Search results'}).getByRole('option').first().click();
                            await page.getByRole('textbox', {name: 'Replace with', exact: true}).fill('poseIndexPerf');
                            const replaced = await page.evaluate(() => __paint(() => {
                                [...document.querySelectorAll('button')].find(e => e.textContent === 'Replace selected match').click();
                            }, () => [...document.querySelectorAll('[role="status"]')].some(e => e.textContent === 'Replaced.')));
                            await record(7, phase, iteration, replaced, {scope: 'Selected global variable match; rename propagates to all references, not a bulk text replacement API'});
                        }
                        await search.press('Escape');
                    }
                    if (selected.has(5)) {
                        await section(page, 'Free layout').click();
                        for (const layout of ['Z', 'N']) {
                            const surface = layout === 'Z' ? page.locator('.blocklyMainBackground:visible').first() : page.locator('.tw-script-view-surface:visible');
                            const position = await surface.evaluate(element => {
                                const box = element.getBoundingClientRect();
                                for (let y=25;y<Math.min(box.height,innerHeight-box.top)-10;y+=40)
                                    for(let x=25;x<Math.min(box.width,innerWidth-box.left)-10;x+=40) {
                                        const target=document.elementFromPoint(box.left+x,box.top+y);
                                        if(target&&(target===element||element.contains(target))&&!target.closest('[data-script-view-block]')) return {x,y};
                                    }
                                throw Error('No visible code background point');
                            });
                            await surface.click({button:'right',position});
                            await page.getByRole('menuitem', {name: 'Change code layout view', exact: true}).hover();
                            await page.evaluate(() => document.addEventListener('pointerdown',
                                () => {window.__actionStart=performance.now();}, {once:true,capture:true}));
                            await page.getByRole('menuitemradio', {name:`${layout} layout view`,exact:true}).click();
                            const ms = await page.evaluate(async layout => {
                                await __paint(() => {}, () => [...document.querySelectorAll('.tw-script-view-surface')].some(e =>
                                    e.getBoundingClientRect().width > 0 && e.getAttribute('aria-label') === `${layout} layout view` &&
                                    e.querySelectorAll('[data-script-view-block]').length > 0));
                                return performance.now()-window.__actionStart;
                            }, layout);
                            await record(5, phase, iteration, ms, {layout, scripts: await page.locator('.tw-script-view-surface:visible [data-script-view-block]').count()});
                        }
                    }
                } finally {await page.close();}
                if ([2, 9, 10, 13].some(id => selected.has(id))) {
                    execFileSync('git',['restore','--source=HEAD','--worktree','--','.'],{cwd:fixture.folder});
                    const openedFolder = await openFolder(original, fixture.folder);
                    const folderPage = openedFolder.page;
                    try {
                        if (selected.has(2)) await record(2, phase, iteration, openedFolder.ms, {readyEvidence:openedFolder.readyEvidence,boundary: 'Choose folder activation → 8 VM targets and workspace; CDP directory transfer before timing'});
                        await expect(folderPage.getByRole('button', {name: 'Branch: main', exact: true})).toBeVisible();
                        if (selected.has(10)) {
                            const ms = await folderPage.evaluate(() => __paint(() => {
                                document.querySelector('[aria-label="Drawer views"] [aria-label="Git history"]').click();
                            }, () => document.querySelectorAll('.twgit-history-view [data-oid]').length === 50));
                            await record(10, phase, iteration, ms, {commits: 50, scope: 'Synthetic 50-commit local fixture, all commits refer to the real project'});
                        }
                        if (selected.has(13)) {
                            await folderPage.evaluate(() => {vm.runtime.getTargetForStage().volume = 42; vm.runtime.emitProjectChanged();});
                            await folderPage.getByText('File', {exact: true}).click();
                            await folderPage.evaluate(() => document.addEventListener('pointerdown', () => {window.__saveStart=performance.now();}, {once:true,capture:true}));
                            await folderPage.getByRole('button', {name:'Save Project',exact:true}).click();
                            const ms = await folderPage.evaluate(async () => {
                                await __paint(() => {}, () => document.querySelector('[data-project-folder-status]')?.textContent === 'Project folder saved.');
                                return performance.now()-window.__saveStart;
                            });
                            assert.equal(JSON.parse(await readFile(path.join(fixture.folder, 'project.source.json'))).targets[0].volume, 42);
                            await record(13, phase, iteration, ms, {diskVerified: true});
                        }
                        if (selected.has(9)) {
                            const project = JSON.parse(await readFile(path.join(fixture.directory, 'baseline-source.json')));
                            let changed;
                            outer: for (const target of project.targets) for (const [id, block] of Object.entries(target.blocks)) {
                                for (const input of Object.values(block.inputs || {})) if (Array.isArray(input[1]) && input[1][0] === 4) {
                                    input[1][1] = String(Number(input[1][1]) + 1); changed = id; break outer;
                                }
                            }
                            assert.ok(changed);
                            await writeFile(path.join(fixture.folder, 'project.source.json'), JSON.stringify(project, null, 2) + '\n');
                            await folderPage.getByRole('button', {name: 'Branch: main', exact: true}).click();
                            await folderPage.getByRole('menuitem', {name: 'Open Local Git', exact: true}).click();
                            const panel = folderPage.locator('.twgit-panel');
                            const saved = panel.getByRole('button', {name: 'Commit saved changes', exact: true});
                            if (await saved.getAttribute('aria-expanded') !== 'true') await saved.click();
                            const pane = panel.getByRole('region', {name: 'Commit saved changes', exact: true});
                            await pane.getByText('List by file', {exact: true}).click();
                            const file = pane.locator('[data-git-group="unstaged"]').filter({hasText: 'project.source.json'});
                            await file.waitFor();
                            await folderPage.evaluate(() => document.addEventListener('pointerdown', () => {window.__diffStart=performance.now();}, {once:true,capture:true}));
                            await file.click();
                            const summary = pane.locator('.twgit-review-script summary').first();
                            await summary.waitFor();
                            const ms = await folderPage.evaluate(async () => {await __paint(() => {
                                document.querySelector('.twgit-review-script summary').click();
                            }, () => [...document.querySelectorAll('.twgit-block-diff-preview svg.blocklySvg')]
                                .filter(e => e.getBoundingClientRect().width > 0).length >= 2); return performance.now()-window.__diffStart;});
                            await record(9, phase, iteration, ms, {changedBlock: changed, boundary: 'File row pointerdown → comparison preparation, automated expansion, before/after block SVG and two animation frames'});
                        }
                    } finally {await folderPage.close();}
                }
                if (selected.has(11)) {
                    const files = await Promise.all(lock.extensions.filter(e => !e.builtin).map(async e =>
                        ({sha256: e.sha256, bytes: [...await readFile(path.join(fixture.directory, 'extensions', e.id + '.js'))]})));
                    const ms = await original.evaluate(async files => {
                        const start = performance.now();
                        for (const file of files) {
                            const actual = [...new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(file.bytes)))]
                                .map(b => b.toString(16).padStart(2, '0')).join('');
                            if (actual !== file.sha256) throw Error('Extension digest mismatch');
                        }
                        return performance.now() - start;
                    }, files);
                    await record(11, phase, iteration, ms, {artifacts: 12, builtin: 1,
                        scope: 'SHA-256 kernel over 12 fixed source artifacts; excludes fetch, VM registration and policy. Original legacy SB3 has no manifest digest claims.'});
                }
                if (selected.has(12)) {
                    execFileSync('git',['restore','--source=HEAD','--worktree','--','.'],{cwd:fixture.folder});
                    const output = path.join(fixture.directory, `rebuilt-${phase}-${iteration}.sb3`);
                    const start = performance.now();
                    await buildSb3({sourceDirectory: fixture.buildFolder, outputPath: output, yes: true});
                    const ms = performance.now() - start;
                    const outputBytes = await readFile(output);
                    const hash = sha256(outputBytes);
                    const rebuilt = JSON.parse(await (await JSZip.loadAsync(outputBytes)).file('project.json').async('string'));
                    assert.equal(rebuilt.targets.length,lock.targets);
                    assert.equal(rebuilt.targets.reduce((n,t)=>n+Object.keys(t.blocks).length,0),lock.blocks);
                    assert.equal(rebuilt.extensions.length,13);
                    result.rebuiltSha256 ??= hash;
                    assert.equal(hash, result.rebuiltSha256, 'Nondeterministic rebuilt SB3');
                    await record(12, phase, iteration, ms, {rebuiltSha256: hash});
                }
            }
        } finally {await context.close(); await env.close(); env=null;}
    }
} catch (error) {
    result.errors.push({message: error.message, stack: error.stack}); throw error;
} finally {
    result.finishedAt = new Date().toISOString(); await persist(); if(env) await env.close();
}
