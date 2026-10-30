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
import { startYamlEditorHost } from '../scripts/yaml-editor/host.mjs';
const sourceRaw =
    '# Keep this YAML comment\r\nmessage: "Hello"\r\nvalues:\r\n  - 42\r\n  - false\r\n  - null\r\n';
const reference = { providerId: 'workspace-proof', documentId: 'same-source' };

test(
    'actual workspace renders the common graph, edits literals, and survives normal optimized SB3 save/reload',
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
            assert.equal(
                readYamlSourceBlockView({
                    baseline: view.baseline,
                    blocks: original.targets[0].blocks,
                    descriptor: view.descriptor,
                    sourceRevision: '1'
                }).source,
                sourceRaw
            );
            await page.screenshot({ path: path.join(output, 'workspace.png') });
            const edited = await page.evaluate(async () => {
                const Blockly = await window.Scratch.gui.getBlockly(),
                    ws = Blockly.getMainWorkspace();
                const block = ws
                    .getAllBlocks(false)
                    .find(
                        (b) =>
                            b.type === 'kubohiroyaembeddedyaml_yamlScalar' &&
                            b.getInputTargetBlock('VALUE')?.getFieldValue('TEXT') === 'Hello'
                    );
                if (!block) throw Error('Rendered scalar input is missing.');
                block.getInputTargetBlock('VALUE').setFieldValue('Edited in workspace', 'TEXT');
                return ws
                    .getAllBlocks(false)
                    .filter((b) => !b.isShadow())
                    .map((b) => b.type);
            });
            assert(edited.includes('kubohiroyaembeddedyaml_yamlComment'));
            await page.waitForTimeout(150);
            const current = await page.evaluate(() =>
                JSON.parse(window.vm.toJSON(undefined, { allowOptimization: false }))
            );
            assert.equal(
                readYamlBlockView({
                    blocks: current.targets[0].blocks,
                    descriptor: view.descriptor
                }).entries[0].value.value,
                'Edited in workspace'
            );
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
                readYamlBlockView({
                    blocks: savedProject.targets[0].blocks,
                    descriptor: savedProject.extensionStorage.yamlproofowner.descriptor
                }).entries[0].value.value,
                'Edited in workspace'
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
            const result = readYamlBlockView({
                blocks: reloaded.targets[0].blocks,
                descriptor: reloaded.extensionStorage.yamlproofowner.descriptor
            });
            assert.equal(result.entries[0].value.value, 'Edited in workspace');
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
            assert(emitted.source.includes('Edited in workspace'));
            assert(emitted.source.includes('\r\n'));
            await writeFile(path.join(output, 'edited-from-blocks.yml'), emitted.source);
            await page.screenshot({ path: path.join(output, 'reloaded.png') });
            assert.deepEqual(errors, []);
            await writeFile(
                path.join(output, 'report.json'),
                JSON.stringify(
                    {
                        passed: true,
                        testOnlyOwner: true,
                        flags: { TW_EMBEDDED_DOCUMENT_VIEWS: true, defaultOff: true },
                        rendered: edited,
                        blockIDsOptimized: true,
                        commentsRetained: true,
                        sourceBytesPreservedInSB3: true,
                        cstEmissionAfterReload: true,
                        scalarTypes: result.entries[1].value.items.map((n) =>
                            n.value === null ? 'null' : typeof n.value
                        ),
                        errors
                    },
                    null,
                    2
                ) + '\n'
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
