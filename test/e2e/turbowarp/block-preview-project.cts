const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const JSZip = require('@turbowarp/jszip');

let pending;
const fixture = () => pending || (pending = build());
const probeSource = `
(function (Scratch) {
    globalThis.__blockPreviewHostCapabilities = {
        preview: typeof Scratch.gui?.blockEditors?.registerPreview === 'function',
        fixed: typeof Scratch.gui?.blockEditors?.registerFixedInputEditor === 'function',
        isolatedVm: typeof Scratch.gui?.createPreviewVm === 'function'
    };
    globalThis.__blockPreviewProbeLabel = 'before previews';
    Scratch.extensions.register({
        getInfo() { return {id: 'blockpreviewprobe', name: 'Preview host probe',
            color1: '#6b49a8', color2: '#593d8e', color3: '#473071',
            blocks: [{opcode: 'value', blockType: 'reporter', text: globalThis.__blockPreviewProbeLabel}]}; },
        value() { return 'editor-owned'; }
    });
})(Scratch);
`;

async function build() {
    const packageRoot = path.dirname(require.resolve('@kubohiroya/turbowarp-kamishibai-app/package.json'));
    const published = relative => import(pathToFileURL(path.join(packageRoot, relative)).href);
    const [author, sourceFrontend, embedded, migration, graphViews, provider, graphs, views] = await Promise.all([
        published('dist/builder/dsl4-block-source-author.js'),
        published('dist/builder/dsl4-source-frontend.js'),
        published('dist/dsl4/platform/embedded-block-story.js'),
        published('dist/dsl4/embedded-yaml-migration.js'),
        published('dist/dsl4/embedded-yaml-graph-views.js'),
        published('dist/dsl4/embedded-yaml-graph-provider.js'),
        published('dist/dsl4/embedded-yaml-source-graph.js'),
        import('@kubohiroya/turbowarp-embedded-yaml/view-metadata')
    ]);
    const schema = JSON.parse(await fs.readFile(path.join(packageRoot, 'schema/dsl-4.schema.json'), 'utf8'));
    const runtimeSource = await fs.readFile(path.join(packageRoot,
        'dist/builder/generated/dsl4-narrative-authoring-runtime-extension.js'), 'utf8');
    const frontend = sourceFrontend.createDsl4ProductionSourceFrontend(schema, {
        narrativeControlEnabled: true, runtimeStateExpressionsEnabled: true
    });
    const zip = new JSZip();
    const images = {
        Beach: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><path fill="#d7efff" d="M0 0h480v360H0z"/><path fill="#f7dfb0" d="M0 250h480v110H0z"/><circle cx="400" cy="65" r="32" fill="#ffcd56"/></svg>',
        HeroIdle: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="140"><rect x="10" y="40" width="80" height="95" rx="22" fill="#ee6a62"/><circle cx="50" cy="35" r="30" fill="#ffd6ad"/><circle cx="39" cy="30" r="4"/><circle cx="61" cy="30" r="4"/></svg>'
    };
    const costume = name => {
        const assetId = createHash('md5').update(images[name]).digest('hex');
        zip.file(`${assetId}.svg`, images[name]);
        return {name, assetId, md5ext: `${assetId}.svg`, dataFormat: 'svg', bitmapResolution: 1,
            rotationCenterX: name === 'Beach' ? 240 : 50, rotationCenterY: name === 'Beach' ? 180 : 70};
    };
    const base = {targets: [
        {isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
            costumes: [costume('Beach')], currentCostume: 0, sounds: [], volume: 100, layerOrder: 0,
            tempo: 60, videoTransparency: 50, videoState: 'off', textToSpeechLanguage: null},
        {isStage: false, name: 'Hero', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
            costumes: [costume('HeroIdle')], currentCostume: 0, sounds: [], volume: 100, layerOrder: 1,
            visible: false, x: -160, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'}
    ], monitors: [], extensions: ['kubohiroyakamishibai4', 'blockpreviewprobe'], extensionURLs: {
        kubohiroyakamishibai4: `data:text/javascript;base64,${Buffer.from(runtimeSource).toString('base64')}`,
        blockpreviewprobe: `data:text/javascript;base64,${Buffer.from(probeSource).toString('base64')}`
    }, meta: {semver: '3.0.0', vm: '0.2.0', agent: 'TurboWarp Plus Editor preview integration fixture'}};
    base.targets[1].blocks['preview-host-probe'] = {opcode: 'blockpreviewprobe_value',
        next: null, parent: null, topLevel: true, shadow: false, fields: {}, inputs: {}, x: 40, y: 40};
    zip.file('project.json', JSON.stringify(base));
    const source = `kamishibai: '4.0'
controls:
  keymaps:
    production: {Space: navigation.nextAction}
assets:
  Beach: backdrop
  HeroIdle: costume:Hero
actors:
  Hero: HeroIdle
bubbleStyles:
  animated:
    reveal: {unit: CHARACTER, intervalSeconds: 0.03}
    showAnimation: {name: fadeIn, durationSeconds: 0.3}
    hideAnimation: {name: fadeOut, durationSeconds: 0.1}
  alternate:
    reveal: {unit: WORD, intervalSeconds: 0.05}
    showAnimation: {name: zoomIn, durationSeconds: 0.3}
scenes:
  opening:
    - stage: Beach
    - Hero.show: {skin: HeroIdle, x: -100, y: -20, scale: 100}
    - Hero.moveTo: {x: 110, y: 40, seconds: 1.2, easing: easeInOut}
    - Hero.say: {text: 'こんにちは！', seconds: 3, styles: [animated]}
    - Hero.think: {text: '心の声', seconds: 3, styles: [animated]}
    - wait: 0.1
`;
    const authored = author.authorDsl4BlockSourceSb3({
        baseBytes: await zip.generateAsync({type: 'uint8array'}), sourceText: source,
        sourceFrontend: frontend, narrativeRuntimeSource: runtimeSource
    });
    assert(authored.ok, JSON.stringify(authored.diagnostics));
    const archive = await JSZip.loadAsync(authored.bytes || authored.sb3Bytes);
    const original = JSON.parse(await archive.file('project.json').async('string'));
    const prepared = await embedded.prepareDsl4EmbeddedBlockStoryProject(original, frontend, {
        maxSourceBytes: 4 * 1024 * 1024, maxAssetFiles: 64, maxTotalAssetBytes: 64 * 1024 * 1024
    });
    const migrated = await migration.migrateDsl4LegacyBlockProject(prepared, {
        sourceFrontend: frontend, entryFile: 'preview.k4.yml'
    });
    const reference = migrated.report.documents[0].reference;
    const owner = project => project.extensionStorage.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4;
    const canonical = graphs.readEmbeddedYamlSourceGraphRecord(owner(migrated.project).sourceDocuments)
        .files['preview.k4.yml'].source;
    const options = {frontend, replaceSource: (project, id, text) =>
        provider.replaceGraphDocumentSource(project, id, text, frontend)};
    const reflected = await graphViews.buildKamishibaiGraphDocumentViewCandidate({
        project: migrated.project, source: canonical, reference,
        request: {kind: 'schema-blocks', direction: 'to-source'}
    }, options);
    const rebuilt = await graphViews.buildKamishibaiGraphDocumentViewCandidate({
        project: reflected.project, source: reflected.source, reference,
        request: {kind: 'schema-blocks', direction: 'from-source'}
    }, options);
    const project = rebuilt.project;
    assert.equal(graphViews.readKamishibaiGraphDocumentViewSource(project, reference), canonical);
    assert.equal(views.readDocumentViewMetadata(owner(project), reference).activeKind, 'schema-blocks');
    const stage = project.targets.find(target => target.isStage);
    const ids = Object.fromEntries(['scene', 'show', 'moveTo', 'say', 'think'].map(command => {
        const match = Object.entries<any>(stage.blocks).find(([, block]) => block.opcode.endsWith(`_${command}`));
        assert(match, `Missing ${command} schema view block`);
        return [command, match[0]];
    }));
    archive.file('project.json', JSON.stringify(project));
    const bytes = await archive.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'});
    const sources = Object.values<any>(project.extensionURLs).map(url => {
        assert(url.startsWith('data:text/javascript'), 'The fixture must use published embedded runtime assets.');
        const offset = url.indexOf(',');
        return url.slice(0, offset).endsWith(';base64') ? Buffer.from(url.slice(offset + 1), 'base64').toString('utf8') :
            decodeURIComponent(url.slice(offset + 1));
    });
    const manifest = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'));
    return {bytes, ids, sources, metadata: {appVersion: manifest.version,
        runtimeSha256: createHash('sha256').update(runtimeSource).digest('hex'),
        fixtureSha256: createHash('sha256').update(bytes).digest('hex'), canonical, reference, ids}};
}

module.exports = {fixture};
