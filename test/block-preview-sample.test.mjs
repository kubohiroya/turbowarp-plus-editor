import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {test} from 'node:test';
import JSZip from '@turbowarp/jszip';
import {createBlockPreviewSample} from '../scripts/samples/block-preview-project.mjs';

const require = createRequire(import.meta.url);
const root = path.dirname(require.resolve('@kubohiroya/turbowarp-kamishibai-app/package.json'));
const published = relative => import(pathToFileURL(path.join(root, relative)).href);
let pending;
const sample = () => pending ??= createBlockPreviewSample();

test('the downloadable sample is byte reproducible and contains only published runtime and original assets', async () => {
    const first = await sample();
    const second = await createBlockPreviewSample();
    assert.deepEqual(first.bytes, second.bytes);
    assert.deepEqual(first.metadata, second.metadata);
    assert.equal(first.metadata.appVersion, '4.0.0-rc.77');
    assert.equal(first.metadata.sha256, createHash('sha256').update(first.bytes).digest('hex'));
    const runtime = await fs.readFile(path.join(root,
        'dist/builder/generated/dsl4-narrative-authoring-runtime-extension.js'));
    assert.equal(first.metadata.runtimeSha256, createHash('sha256').update(runtime).digest('hex'));
    assert.deepEqual(first.project.extensions, ['kubohiroyakamishibai4', 'kubohiroyakamishibaiauthoring4']);
    assert.deepEqual(Object.keys(first.project.extensionURLs), first.project.extensions);
    const zip = await JSZip.loadAsync(first.bytes);
    assert.deepEqual(JSON.parse(await zip.file('project.json').async('string')), first.project);
    assert.equal(Object.keys(zip.files).length, 5);
    for (const target of first.project.targets) for (const costume of target.costumes) {
        const bytes = await zip.file(costume.md5ext).async('nodebuffer');
        assert.equal(createHash('md5').update(bytes).digest('hex'), costume.assetId);
        const svg = bytes.toString('utf8');
        assert(!/<script|<foreignObject|\b(?:href|src)=|url\(/iu.test(svg));
    }
    for (const entry of Object.values(zip.files)) {
        assert.equal(entry.date.toISOString(), '2000-01-01T00:00:00.000Z');
    }
});

test('the initially selected actor explains how to open the valid Stage script and its runtime entry', async () => {
    const {project, metadata} = await sample();
    const hero = project.targets[1];
    const stage = project.targets[0];
    assert.equal(hero.name, metadata.initialTarget);
    assert.equal(hero.isStage, false);
    assert.deepEqual(metadata.commands, {scene: 2, show: 2, moveTo: 2, setSkin: 1,
        say: 1, think: 1, sayText: 1, thinkText: 1});
    assert.equal(metadata.scriptTarget, 'Stage');
    assert.deepEqual(hero.blocks, {});
    assert.match(hero.comments['open-preview-script'].text, /右下の「ステージ」/u);
    assert.equal(hero.comments['open-preview-script'].minimized, false);
    assert(stage.blocks[metadata.ids.scene]);
    assert(Object.values(stage.blocks).some(block => block.opcode.endsWith('_embeddedYaml')));
    assert.equal(Object.values(stage.blocks).filter(block => block.opcode.endsWith('_embeddedYamlRoot')).length, 1);
    assert(!Object.values(hero.blocks).some(block => block.opcode.endsWith('_embeddedYamlRoot')));
    const validation = await published('dist/dsl4/embedded-yaml-root-validation.js');
    assert.equal(validation.validateKamishibaiEmbeddedYamlRoot(project, {allowLegacySingle: false}).path,
        'preview.k4.yml');
    for (const [scene, ids] of Object.entries(metadata.idsByScene)) {
        assert(ids.stage?.length && ids.show?.length, `${scene} establishes its own backdrop and actor.`);
        for (const id of Object.values(ids).flat()) assert(stage.blocks[id]);
    }
});

test('the editable Stage script exports its complete canonical source through the official named provider', async () => {
    const {project, metadata} = await sample();
    const [migration, frontendAPI] = await Promise.all([
        published('dist/dsl4/embedded-yaml-migration.js'), published('dist/builder/dsl4-source-frontend.js')
    ]);
    const schema = JSON.parse(await fs.readFile(path.join(root, 'schema/dsl-4.schema.json')));
    const frontend = frontendAPI.createDsl4ProductionSourceFrontend(schema,
        {narrativeControlEnabled: true, runtimeStateExpressionsEnabled: true});
    const exported = await migration.extractEmbeddedYamlDocumentSources(project, frontend);
    assert.equal(exported.entryPath, 'preview.k4.yml');
    assert.equal(createHash('sha256').update(exported.sources['preview.k4.yml']).digest('hex'),
        metadata.canonicalSourceSha256);
    assert.deepEqual(Object.keys(exported.sources), ['preview.k4.yml']);
});
