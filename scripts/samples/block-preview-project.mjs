import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import JSZip from '@turbowarp/jszip';
import {parse} from 'yaml';
import {readDocumentViewMetadata} from '@kubohiroya/turbowarp-embedded-yaml/view-metadata';

const require = createRequire(import.meta.url);
const sampleRoot = fileURLToPath(new URL('../../site/samples/block-preview/', import.meta.url));
const expectedAppVersion = '4.0.0-rc.77';
const fixedDate = new Date('2000-01-01T00:00:00.000Z');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const embeddedURL = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const component = project => project.extensionStorage.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4;
const limits = {maxSourceBytes: 4 * 1024 * 1024, maxAssetFiles: 64, maxTotalAssetBytes: 64 * 1024 * 1024};

async function deterministicArchive(files) {
    const zip = new JSZip();
    for (const name of Object.keys(files).sort()) {
        zip.file(name, files[name], {date: fixedDate, createFolders: false});
    }
    return zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: {level: 6},
        platform: 'DOS', comment: ''});
}

function literal(blocks, block, name) {
    const input = block.inputs[name];
    if (Array.isArray(input?.[1])) return input[1][1];
    const shadow = blocks[input?.[1]];
    return shadow?.fields?.TEXT?.[0] ?? shadow?.fields?.NUM?.[0];
}

function blockIndex(target) {
    const ids = {}, commands = {}, sceneIds = {}, idsByScene = {};
    for (const [id, block] of Object.entries(target.blocks)) {
        const command = block.opcode.split('_').at(-1);
        if (!['scene', 'show', 'moveTo', 'setSkin', 'say', 'think', 'sayText', 'thinkText'].includes(command)) continue;
        ids[command] ??= id;
        commands[command] = (commands[command] || 0) + 1;
        if (command === 'scene') {
            const name = literal(target.blocks, block, 'SCENE');
            sceneIds[name] = id;
            idsByScene[name] = {scene: [id]};
            let actionId = block.inputs.SUBSTACK?.[1];
            while (typeof actionId === 'string') {
                const action = target.blocks[actionId];
                assert(action, 'Every scene action must exist in the same target.');
                const actionCommand = action.opcode.split('_').at(-1);
                (idsByScene[name][actionCommand] ??= []).push(actionId);
                actionId = action.next;
            }
        }
    }
    return {ids, commands, sceneIds, idsByScene};
}

/** Build the user sample with published App APIs; callers decide where to publish its bytes. */
export async function createBlockPreviewSample() {
    const packageRoot = path.dirname(require.resolve('@kubohiroya/turbowarp-kamishibai-app/package.json'));
    const published = relative => import(pathToFileURL(path.join(packageRoot, relative)).href);
    const [manifest, source, runtimeSource, schema, author, frontendAPI, embedded, migration, graphViews, graphs,
        providerAPI] = await Promise.all([
        fs.readFile(path.join(packageRoot, 'package.json'), 'utf8').then(JSON.parse),
        fs.readFile(path.join(sampleRoot, 'preview.k4.yml'), 'utf8'),
        fs.readFile(path.join(packageRoot, 'dist/builder/generated/dsl4-narrative-authoring-runtime-extension.js'), 'utf8'),
        fs.readFile(path.join(packageRoot, 'schema/dsl-4.schema.json'), 'utf8').then(JSON.parse),
        published('dist/builder/dsl4-block-source-author.js'),
        published('dist/builder/dsl4-source-frontend.js'),
        published('dist/dsl4/platform/embedded-block-story.js'),
        published('dist/dsl4/embedded-yaml-migration.js'),
        published('dist/dsl4/embedded-yaml-graph-views.js'),
        published('dist/dsl4/embedded-yaml-source-graph.js'),
        published('dist/dsl4/embedded-yaml-graph-provider.js')
    ]);
    assert.equal(manifest.version, expectedAppVersion, 'The sample must use its advertised published App release.');
    const frontend = frontendAPI.createDsl4ProductionSourceFrontend(schema, {
        narrativeControlEnabled: true, runtimeStateExpressionsEnabled: true
    });
    const validation = frontend.parse(source, {sourceId: 'preview.k4.yml'});
    assert(validation.ok, JSON.stringify(validation.diagnostics));

    const files = {}, assetSha256 = {};
    async function costume(name, filename, stage) {
        const svg = await fs.readFile(path.join(sampleRoot, 'assets', filename));
        const assetId = createHash('md5').update(svg).digest('hex');
        files[`${assetId}.svg`] = svg;
        assetSha256[filename] = sha256(svg);
        return {name, assetId, md5ext: `${assetId}.svg`, dataFormat: 'svg', bitmapResolution: 1,
            rotationCenterX: stage ? 240 : 50, rotationCenterY: stage ? 180 : 70};
    }
    const [studio, bubbleStudio, idle, happy] = await Promise.all([
        costume('Studio', 'studio.svg', true), costume('BubbleStudio', 'bubble-studio.svg', true),
        costume('HeroIdle', 'hero-idle.svg', false), costume('HeroHappy', 'hero-happy.svg', false)
    ]);
    const base = {targets: [
        {isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
            costumes: [studio, bubbleStudio], currentCostume: 0, sounds: [], volume: 100, layerOrder: 0,
            tempo: 60, videoTransparency: 50, videoState: 'off', textToSpeechLanguage: null},
        {isStage: false, name: 'Hero', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
            costumes: [idle, happy], currentCostume: 0, sounds: [], volume: 100, layerOrder: 1,
            visible: true, x: -120, y: -35, size: 90, direction: 90, draggable: false, rotationStyle: "don't rotate"}
    ], monitors: [], extensions: ['kubohiroyakamishibai4'], extensionURLs: {
        kubohiroyakamishibai4: embeddedURL(runtimeSource)
    }, meta: {semver: '3.0.0', vm: '0.2.0', agent: 'TurboWarp Plus Editor block preview sample / App 4.0.0-rc.77'}};
    const authored = author.authorDsl4BlockSourceSb3({baseBytes: await deterministicArchive({
        ...files, 'project.json': JSON.stringify(base)
    }), sourceText: source, sourceFrontend: frontend, narrativeRuntimeSource: runtimeSource});
    assert(authored.ok, JSON.stringify(authored.diagnostics));
    const authoredZip = await JSZip.loadAsync(authored.bytes);
    const legacy = JSON.parse(await authoredZip.file('project.json').async('string'));
    const prepared = await embedded.prepareDsl4EmbeddedBlockStoryProject(legacy, frontend, limits);
    const migrated = await migration.migrateDsl4LegacyBlockProject(prepared, {
        sourceFrontend: frontend, entryFile: 'preview.k4.yml'
    });
    const project = migrated.project;
    const stage = project.targets.find(target => target.isStage);
    const hero = project.targets[1];
    // App rc.77 previews require the script on Stage. Scratch initially selects the first sprite,
    // so explain the one native selection step in an ordinary, unconnected Scratch comment.
    hero.comments['open-preview-script'] = {blockId: null, x: 40, y: 40, width: 440, height: 190,
        minimized: false, text: 'ブロックのプレビューを試そう\n\n1. 右下の「ステージ」を選ぶ\n2. 「コード」タブを開く\n3. ブロック左端のアイコンにマウスを重ねる／クリック\n\n詳しい操作は、サンプル配布ページのガイドへ。'};
    const reference = migrated.report.documents.find(document => document.filename === 'preview.k4.yml').reference;
    const canonical = graphs.readEmbeddedYamlSourceGraphRecord(component(project).sourceDocuments)
        .files['preview.k4.yml'].source;
    assert.deepEqual(parse(canonical), parse(source), 'Named source must retain the complete authored scenario.');
    assert.equal(graphViews.readKamishibaiGraphDocumentViewSource(project, reference), canonical);
    assert.equal(readDocumentViewMetadata(component(project), reference).activeKind, 'schema-blocks');
    const exported = await migration.extractEmbeddedYamlDocumentSources(project, frontend);
    assert.equal(exported.sources['preview.k4.yml'], canonical);
    const provider = providerAPI.createKamishibaiGraphDocumentProvider({
        runtime: {extensionStorage: project.extensionStorage, targets: project.targets,
            emitProjectChanged() { throw new Error('Sample verification must not mutate its project.'); }},
        toJSON() { return JSON.stringify(project); }
    }, {sourceFrontend: frontend, documentViewsEnabled: true});
    try {
        assert(provider.list().some(document => document.documentId === reference.documentId &&
            document.available && document.activeRepresentation === 'schema-blocks'));
        const opened = provider.open(reference.documentId);
        try { assert.equal(opened.capture().source, canonical); } finally { opened.dispose(); }
    } finally { provider.dispose?.(); }

    const initialTarget = project.targets[1];
    const index = blockIndex(stage);
    for (const command of ['scene', 'show', 'setSkin', 'moveTo', 'say', 'think', 'sayText', 'thinkText']) {
        assert(index.ids[command], `The sample must contain ${command} on Stage.`);
    }
    const documentRoot = Object.entries(stage.blocks).find(([, block]) => block.opcode.endsWith('_embeddedYaml'));
    assert(documentRoot, 'Stage must contain the named script root.');
    const [rootId, root] = documentRoot;
    const guideId = 'block-preview-guide';
    root.comment = guideId;
    stage.comments[guideId] = {blockId: rootId, x: 450, y: 40, width: 370, height: 190,
        minimized: true, text: 'アイコンから試そう\n① 左端アイコンに重ねる: このactionの静止画\n② sceneをクリック: この場面を再生\n③ show: 本体をドラッグして位置、青枠のふちで大きさ\n④ moveTo: 移動先・秒数・動きの変化を変更\n⑤ say / think: 文章・秒数・スタイルを変更して即再生\n⑥ 保存で反映、キャンセルで破棄。Undo / Redoも試せます。\n詳しい説明は配布ページの操作ガイドへ。'};
    for (const [name, entry] of Object.entries(authoredZip.files)) {
        if (!entry.dir && name !== 'project.json') files[name] = await entry.async('nodebuffer');
    }
    files['project.json'] = JSON.stringify(project);
    const bytes = await deterministicArchive(files);
    return {bytes, project, metadata: {appVersion: expectedAppVersion, filename: 'block-preview-rc77.sb3',
        sha256: sha256(bytes), runtimeSha256: sha256(runtimeSource), sourceSha256: sha256(source),
        canonicalSourceSha256: sha256(canonical), assetSha256, size: bytes.length,
        ...index, initialTarget: initialTarget.name, scriptTarget: stage.name,
        initialInstruction: '右下の「ステージ」を選択し、「コード」タブを開きます。', reference,
        extensions: [...project.extensions], license: 'CC0-1.0 (scenario and original SVG assets)',
        softwareLicense: 'MPL-2.0 and bundled dependency notices',
        editorFlags: {twPlusBlockPreview: '1', twPlusYamlEditor: '1'}}};
}
