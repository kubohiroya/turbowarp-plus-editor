import type {FixtureYamlMapping} from './helpers/fixture-types.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import JSZip from '@turbowarp/jszip';
import { createHash } from 'node:crypto';
import { readYamlBlockView } from '@kubohiroya/turbowarp-embedded-yaml/yaml-blocks';
import {
    createYamlSourceBlockView,
    readYamlSourceBlockView
} from '@kubohiroya/turbowarp-embedded-yaml/source-view';
import { startYamlEditorHost } from '../scripts/yaml-editor/host.ts';
const sourceRaw =
    '# Keep this YAML comment\r\n# second comment line\r\nmessage: "Hello"\r\nvalues:\r\n  - 42\r\n  - false\r\n  - null\r\ndescription: |-\r\n  line1\r\n  line2\r\nblankLines: \"first\\n\\nlast\\n\"\r\ncrlfString: \"first\\r\\nsecond\\r\\n\"\r\ntabString: "before\\tafter\\nnext"\r\nspaceString: " first \\n last "\r\n';
const reference = { providerId: 'workspace-proof', documentId: 'same-source' };

test(
    'actual multiline comments and scalars survive unedited workspace rendering and optimized SB3 save/reload',
    { timeout: 180000 },
    async () => {
        const input = process.env.TWPE_YAML_SITE;
        assert(
            input && path.isAbsolute(input),
            'TWPE_YAML_SITE must name an owned verified Editor build.'
        );
        const output =
            process.env.TWPE_YAML_BLOCK_EVIDENCE ||
            (await mkdtemp(path.join(tmpdir(), 'twpe-yaml-block-proof-')));
        await mkdir(output, { recursive: true });
        const owned = await mkdtemp(path.join(tmpdir(), 'twpe-yaml-block-site-')),
            site = path.join(owned, 'site');
        await cp(input, site, { recursive: true });
        const host = await startYamlEditorHost({
            siteDirectory: site,
            dataDirectory: path.join(owned, 'work'),
            launchEditor: async () => {
                throw new Error('This workspace test must never launch a native editor.');
            }
        });
        const base = `${host.apiOrigin}/turbowarp-plus-editor/`,
            runtime = path.join(site, 'static/yaml-common-proof.js'),
            owner = path.join(site, 'static/yaml-owner-proof.js');
        await build({
            stdin: {
                contents:
                    "import {createYamlBlockRuntime} from '@kubohiroya/turbowarp-embedded-yaml/runtime'; Scratch.extensions.register(createYamlBlockRuntime(Scratch,{enabled:true}));",
                resolveDir: process.cwd()
            },
            bundle: true,
            format: 'iife',
            platform: 'browser',
            outfile: runtime,
            logLevel: 'silent'
        });
        await build({
            stdin: {
                contents:
                    "import {createEmbeddedYamlHatDefinition,createEmbeddedYamlDocumentMenu} from '@kubohiroya/turbowarp-embedded-yaml'; const ref=" +
                    JSON.stringify(reference) +
                    "; Scratch.extensions.register({getInfo(){return{id:'yamlproofowner',name:'YAML owner proof',blocks:[createEmbeddedYamlHatDefinition({BlockType:Scratch.BlockType,defaultReference:ref})],menus:{embeddedYamlDocuments:createEmbeddedYamlDocumentMenu([{reference:ref,filename:'document.yml'}])}}},embeddedYaml(){return false}});",
                resolveDir: process.cwd()
            },
            bundle: true,
            format: 'iife',
            platform: 'browser',
            outfile: owner,
            logLevel: 'silent'
        });
        const view = createYamlSourceBlockView({
            reference,
            source: sourceRaw,
            sourceRevision: '1',
            rootId: 'common-yaml-document',
            rootOpcode: 'yamlproofowner_embeddedYaml'
        });
        const svg =
                '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><path fill="white" d="M0 0h480v360H0z"/></svg>',
            asset = createHash('md5').update(svg).digest('hex');
        const project = {
            targets: [
                {
                    isStage: true,
                    name: 'Stage',
                    variables: {},
                    lists: {},
                    broadcasts: {},
                    blocks: view.blocks,
                    comments: {},
                    currentCostume: 0,
                    costumes: [
                        {
                            assetId: asset,
                            name: 'backdrop1',
                            bitmapResolution: 1,
                            md5ext: asset + '.svg',
                            dataFormat: 'svg',
                            rotationCenterX: 240,
                            rotationCenterY: 180
                        }
                    ],
                    sounds: [],
                    volume: 100,
                    layerOrder: 0,
                    tempo: 60,
                    videoTransparency: 50,
                    videoState: 'on',
                    textToSpeechLanguage: null
                }
            ],
            monitors: [],
            extensions: ['yamlproofowner', 'kubohiroyaembeddedyaml'],
            extensionURLs: {
                yamlproofowner: base + 'static/yaml-owner-proof.js',
                kubohiroyaembeddedyaml: base + 'static/yaml-common-proof.js'
            },
            extensionStorage: {
                yamlproofowner: { descriptor: view.descriptor, source: sourceRaw }
            },
            meta: { semver: '3.0.0', vm: '0.2.0', agent: 'local-test' }
        };
        const archive = new JSZip();
        archive.file('project.json', JSON.stringify(project));
        archive.file(asset + '.svg', svg);
        await writeFile(
            path.join(site, 'static/common-yaml-proof.sb3'),
            await archive.generateAsync({ type: 'nodebuffer' })
        );
        const browser = await chromium.launch({
            headless: true,
            ...(process.env.TWPE_CHROME_EXECUTABLE
                ? { executablePath: process.env.TWPE_CHROME_EXECUTABLE }
                : {})
        });
        const page = await browser.newPage({
            viewport: { width: 1440, height: 1000 },
            locale: 'ja-JP'
        });
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        const load = async (name) => {
            await page.goto(
                base +
                    'editor.html?lang=ja&project_url=' +
                    encodeURIComponent(base + 'static/' + name)
            );
            const security = page.locator('.twextsec-modal');
            await security.waitFor({ timeout: 60000 });
            await security.getByRole('button', { name: 'サンドボックスなし', exact: true }).click();
            await security.getByRole('button', { name: 'OK', exact: true }).click();
            await security.waitFor({ state: 'hidden', timeout: 60000 });
            await page.locator('[class*="stage-selector_stage-selector"]').click();
            await page.waitForFunction(
                () => window.vm?.editingTarget?.isStage && window.Scratch?.gui?.getBlockly
            );
        };
        try {
            await load('common-yaml-proof.sb3');
            await page.waitForFunction(
                () => window.vm.editingTarget.blocks.getScripts().length > 0
            );
            await page.waitForTimeout(300);
            const original = await page.evaluate(() =>
                JSON.parse(window.vm.toJSON(undefined, { allowOptimization: false }))
            );
            const initialSource = readYamlSourceBlockView({
                baseline: view.baseline,
                blocks: original.targets[0].blocks,
                descriptor: view.descriptor,
                sourceRevision: '1'
            }).source;
            await writeFile(path.join(output, 'original-source.yml'), sourceRaw);
            await writeFile(path.join(output, 'after-display-source.yml'), initialSource);
            await writeFile(
                path.join(output, 'after-display-project.json'),
                JSON.stringify(original, null, 2)
            );
            await page.screenshot({ path: path.join(output, 'workspace.png') });
            const fields = await page.evaluate(async () => {
                const Blockly = await window.Scratch.gui.getBlockly();
                return Blockly.getMainWorkspace()
                    .getAllBlocks(false)
                    .filter((b) =>
                        [
                            'kubohiroyaembeddedyaml_yamlScalar',
                            'kubohiroyaembeddedyaml_yamlLineComment',
                            'kubohiroyaembeddedyaml_yamlTextLine'
                        ].includes(b.type)
                    )
                    .map((b) => ({
                        type: b.type,
                        value: b.getInputTargetBlock('VALUE')?.getFieldValue('TEXT'),
                        text: b.getInputTargetBlock('TEXT')?.getFieldValue('TEXT'),
                        ending: b.getFieldValue('BREAK')
                    }));
            });
            const current = original;
            const bytes = await page.evaluate(async () =>
                Array.from(new Uint8Array(await (await window.vm.saveProjectSb3()).arrayBuffer()))
            );
            const saved = Buffer.from(bytes);
            await writeFile(path.join(output, 'saved.sb3'), saved);
            await writeFile(path.join(site, 'static/common-yaml-saved.sb3'), saved);
            const savedProject = JSON.parse(
                await (await JSZip.loadAsync(saved)).file('project.json').async('string')
            );
            assert.equal(
                (readYamlBlockView({
                    blocks: savedProject.targets[0].blocks,
                    descriptor: savedProject.extensionStorage.yamlproofowner.descriptor
                }) as FixtureYamlMapping).entries[0].value.value,
                'Hello'
            );
            const beforeIDs = Object.keys(current.targets[0].blocks),
                afterIDs = Object.keys(savedProject.targets[0].blocks);
            assert.notDeepEqual(
                afterIDs,
                beforeIDs,
                'Normal save should exercise optimized block IDs.'
            );
            await load('common-yaml-saved.sb3');
            const reloaded = await page.evaluate(() =>
                JSON.parse(window.vm.toJSON(undefined, { allowOptimization: false }))
            );
            const result = (readYamlBlockView({
                blocks: reloaded.targets[0].blocks,
                descriptor: reloaded.extensionStorage.yamlproofowner.descriptor
            }) as FixtureYamlMapping);
            assert.equal(result.entries[0].value.value, 'Hello');
            assert.equal(reloaded.extensionStorage.yamlproofowner.source, sourceRaw);
            const fresh = createYamlSourceBlockView({
                source: reloaded.extensionStorage.yamlproofowner.source,
                sourceRevision: '1',
                reference,
                rootId: 'unused-fresh-hat',
                rootOpcode: 'yamlproofowner_embeddedYaml'
            });
            const emitted = readYamlSourceBlockView({
                baseline: fresh.baseline,
                blocks: reloaded.targets[0].blocks,
                descriptor: reloaded.extensionStorage.yamlproofowner.descriptor,
                sourceRevision: '1'
            });
            assert(emitted.source.includes('# Keep this YAML comment'));

            assert(emitted.source.includes('\r\n'));
            await writeFile(path.join(output, 'edited-from-blocks.yml'), emitted.source);
            await page.screenshot({ path: path.join(output, 'reloaded.png') });
            assert.deepEqual(errors, []);
            const savedFresh = createYamlSourceBlockView({
                source: savedProject.extensionStorage.yamlproofowner.source,
                sourceRevision: '1',
                reference,
                rootId: 'unused-saved-hat',
                rootOpcode: 'yamlproofowner_embeddedYaml'
            });
            const savedSource = readYamlSourceBlockView({
                baseline: savedFresh.baseline,
                blocks: savedProject.targets[0].blocks,
                descriptor: savedProject.extensionStorage.yamlproofowner.descriptor,
                sourceRevision: '1'
            }).source;
            const widgets = [];
            const fieldBlocks = await page.evaluate(async () => {
                const Blockly = await window.Scratch.gui.getBlockly();
                return Blockly.getMainWorkspace()
                    .getAllBlocks(false)
                    .filter((b) =>
                        [
                            'kubohiroyaembeddedyaml_yamlTextLine',
                            'kubohiroyaembeddedyaml_yamlLineComment'
                        ].includes(b.type)
                    )
                    .map((b) => ({
                        id: b.id,
                        type: b.type,
                        expected: b.getInputTargetBlock('TEXT').getFieldValue('TEXT')
                    }));
            });
            for (const item of fieldBlocks) {
                const point = await page.evaluate(async (id) => {
                    const Blockly = await window.Scratch.gui.getBlockly(),
                        ws = Blockly.getMainWorkspace(),
                        b = ws.getBlockById(id);
                    if (typeof ws.zoomToFit !== 'function')
                        throw Error('Workspace fit API unavailable');
                    ws.zoomToFit();
                    await new Promise(requestAnimationFrame);
                    await new Promise(requestAnimationFrame);
                    const r = b
                        .getInputTargetBlock('TEXT')
                        .getField('TEXT')
                        .getSvgRoot()
                        .getBoundingClientRect();
                    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
                }, item.id);
                await writeFile(
                    path.join(output, 'field-progress.json'),
                    JSON.stringify({ current: item, point, completed: widgets }, null, 2)
                );
                await page.mouse.dblclick(point.x, point.y);
                const widget = page.locator('.blocklyHtmlInput');
                await widget.waitFor();
                const value = await widget.inputValue();
                widgets.push({ type: item.type, expected: item.expected, value });
                assert.equal(value, item.expected);
                assert(!/[\r\n]/u.test(value));
                await page.keyboard.press('Enter');
                await page.waitForTimeout(50);
            }
            const afterFieldProject = await page.evaluate(() =>
                JSON.parse(window.vm.toJSON(undefined, { allowOptimization: false }))
            );
            const afterFieldSource = readYamlSourceBlockView({
                baseline: fresh.baseline,
                blocks: afterFieldProject.targets[0].blocks,
                descriptor: afterFieldProject.extensionStorage.yamlproofowner.descriptor,
                sourceRevision: '1'
            }).source;
            await writeFile(path.join(output, 'after-field-confirm-source.yml'), afterFieldSource);
            await writeFile(
                path.join(output, 'after-field-confirm-project.json'),
                JSON.stringify(afterFieldProject, null, 2)
            );
            await page.evaluate(async () => {
                const Blockly = await window.Scratch.gui.getBlockly(),
                    ws = Blockly.getMainWorkspace();
                const b = ws
                    .getAllBlocks(false)
                    .find(
                        (b) =>
                            b.type === 'kubohiroyaembeddedyaml_yamlTextLine' &&
                            b.getInputTargetBlock('TEXT')?.getFieldValue('TEXT') === 'line1'
                    );
                if (!b) throw Error('Explicit line block missing');
                if (typeof ws.zoomToFit !== 'function')
                    throw Error('Workspace fit API unavailable');
                ws.zoomToFit();
                await new Promise(requestAnimationFrame);
                await new Promise(requestAnimationFrame);
                const r = b
                    .getInputTargetBlock('TEXT')
                    .getField('TEXT')
                    .getSvgRoot()
                    .getBoundingClientRect();
                window.linePoint = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
            });
            const linePoint = await page.evaluate(() => window.linePoint);
            await page.mouse.dblclick(linePoint.x, linePoint.y);
            await page.locator('.blocklyHtmlInput').fill('line1 edited');
            await page.keyboard.press('Enter');
            await page.waitForTimeout(100);
            const commentPoint = await page.evaluate(async () => {
                const Blockly = await window.Scratch.gui.getBlockly(),
                    ws = Blockly.getMainWorkspace(),
                    b = ws
                        .getAllBlocks(false)
                        .find(
                            (b) =>
                                b.type === 'kubohiroyaembeddedyaml_yamlLineComment' &&
                                b
                                    .getInputTargetBlock('TEXT')
                                    ?.getFieldValue('TEXT')
                                    ?.includes('Keep this YAML comment')
                        );
                ws.zoomToFit();
                await new Promise(requestAnimationFrame);
                await new Promise(requestAnimationFrame);
                const r = b
                    .getInputTargetBlock('TEXT')
                    .getField('TEXT')
                    .getSvgRoot()
                    .getBoundingClientRect();
                return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
            });
            await page.mouse.dblclick(commentPoint.x, commentPoint.y);
            await page.locator('.blocklyHtmlInput').fill(' Updated comment line');
            await page.keyboard.press('Enter');
            await page.waitForTimeout(100);
            const editedProject = await page.evaluate(() =>
                    JSON.parse(window.vm.toJSON(undefined, { allowOptimization: false }))
                ),
                editedTree = (readYamlBlockView({
                    blocks: editedProject.targets[0].blocks,
                    descriptor: editedProject.extensionStorage.yamlproofowner.descriptor
                }) as FixtureYamlMapping);
            const lineEdit = readYamlSourceBlockView({
                baseline: fresh.baseline,
                blocks: editedProject.targets[0].blocks,
                descriptor: editedProject.extensionStorage.yamlproofowner.descriptor,
                sourceRevision: '1'
            }).source;
            await writeFile(path.join(output, 'after-line-edit-source.yml'), lineEdit);
            const description = editedTree.entries.find((p) => p.key.value === 'description')?.value
                    .value,
                blankLines = editedTree.entries.find((p) => p.key.value === 'blankLines')?.value
                    .value,
                crlfString = editedTree.entries.find((p) => p.key.value === 'crlfString')?.value
                    .value;
            assert.equal(description, 'line1 edited\nline2');
            assert.equal(blankLines, 'first\n\nlast\n');
            assert.equal(crlfString, 'first\r\nsecond\r\n');
            assert.equal(
                editedTree.entries.find((p) => p.key.value === 'tabString')?.value.value,
                'before\tafter\nnext'
            );
            assert.equal(
                editedTree.entries.find((p) => p.key.value === 'spaceString')?.value.value,
                ' first \n last '
            );
            assert(lineEdit.includes('# Updated comment line'));
            assert(lineEdit.includes('# second comment line'));
            const report = {
                tabsAndSpacesPreserved: true,
                commentLineEditCorrect: true,
                lineEditCorrect: true,
                blankLinesAndTrailingBreaks: true,
                crlfStringPreserved: true,
                allTextFieldsSingleLine: true,
                fieldRoundtripPreserved: afterFieldSource === sourceRaw,
                widgets,
                afterFieldConfirm: afterFieldSource,
                passed:
                    initialSource === sourceRaw &&
                    savedSource === sourceRaw &&
                    emitted.source === sourceRaw &&
                    afterFieldSource === sourceRaw,
                testOnlyOwner: true,
                uneditedWorkspace: true,
                original: sourceRaw,
                afterDisplay: initialSource,
                afterSave: savedSource,
                afterReload: emitted.source,
                sourceBytesPreservedInStorage:
                    reloaded.extensionStorage.yamlproofowner.source === sourceRaw,
                expectedDescription: 'line1\nline2',
                descriptionAfterReload: result.entries.find((p) => p.key.value === 'description')
                    ?.value.value,
                renderedFields: fields,
                blockIDsOptimized: true,
                errors
            };
            await writeFile(
                path.join(output, 'report.json'),
                JSON.stringify(report, null, 2) + '\n'
            );
            assert.equal(
                report.passed,
                true,
                'Displaying and saving an unedited view must not change multiline source.'
            );
        } catch (error) {
            await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
            await writeFile(
                path.join(output, 'failure.json'),
                JSON.stringify({ message: error.message, errors }, null, 2)
            );
            throw error;
        } finally {
            await browser.close();
            await host.close();
        }
    }
);
