import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import Zip from '@turbowarp/jszip';
const gui = process.env.E2E_GUI_ROOT;
if (!gui || !path.isAbsolute(gui)) throw new Error('An absolute E2E_GUI_ROOT is required');
const hostRequire = createRequire(path.join(gui, 'package.json'));
const {prepareOfflinePackage} = await import(pathToFileURL(hostRequire.resolve('@kubohiroya/turbowarp-extension-loader/packager')));
const {packagePlusHTML} = await import(pathToFileURL(path.join(gui, 'src/lib/tw-plus-packager.js')));
const output = path.resolve('.host/issue-4-artifacts');
await mkdir(output, {recursive: true});
const require = createRequire(import.meta.url);
const {Packager} = require('@turbowarp/packager');
const source = `(function(Scratch){
if (!Scratch.extensions.unsandboxed) throw new Error('Unsandboxed execution required');
Scratch.vm.__plusPackageExecutions = (Scratch.vm.__plusPackageExecutions || 0) + 1;
Scratch.extensions.register({getInfo(){return {id:'sample',name:'Offline fixture',blocks:[
{opcode:'value',blockType:Scratch.BlockType.REPORTER,text:'offline value'}]};},value(){return 42;}});
})(Scratch);`;
const bytes = new TextEncoder().encode(source);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const project = {targets: [{isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
    currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0, tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null}],
    monitors: [], extensions: ['sample'], extensionURLs: {}, meta: {semver: '3.0.0', vm: '2.0.0', agent: 'Plus offline fixture'},
    turboWarpPlus: {schemaVersion: 1, extensions: [{id: 'sample', execution: 'unsandboxed', sha256, source: {type: 'remote', url: 'https://fixture.invalid/code.js'}}]}};
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#ffffff"/></svg>';
const assetId = createHash('md5').update(svg).digest('hex');
project.targets[0].costumes = [{assetId, name: 'backdrop1', bitmapResolution: 1, md5ext: `${assetId}.svg`,
    dataFormat: 'svg', rotationCenterX: 240, rotationCenterY: 180}];
const sb3 = await new Zip().file('project.json', JSON.stringify(project)).file(`${assetId}.svg`, svg).generateAsync({type: 'uint8array'});
const prepared = await prepareOfflinePackage(sb3, {
    fetcher: {async fetch(url) { return {bytes, finalURL: url, redirects: []}; }},
    trustProvider: {async authorize(code) { return {allowed: true, scope: 'digest', sha256: code.sha256}; }}
}, {zip: Zip, resourceDependencies: {sample: []}, metadata: {sample: {license: 'CC0-1.0', provenance: 'Local test fixture'}}});
const assetRoot = pathToFileURL(path.resolve(process.env.TW_PLUS_SCAFFOLDING_ROOT || path.join(output, 'scaffolding')) + path.sep);
const info = JSON.parse(await readFile(new URL('build-info.json', assetRoot), 'utf8'));
const scaffoldingAssets = {};
for (const [name, file] of Object.entries({scaffolding: 'scaffolding-full.js', 'scaffolding-min': 'scaffolding-min.js', addons: 'addons.js'})) {
    const source = await readFile(new URL(file, assetRoot), 'utf8');
    if (createHash('sha256').update(source).digest('hex') !== info.sourceHashes[file]) throw new Error('Scaffolding integrity mismatch');
    scaffoldingAssets[name] = source;
}
const runtimeBundle = await readFile(path.resolve(process.env.TW_PLUS_RUNTIME_OUTPUT || path.join(output, 'extension-runtime.js')), 'utf8');
const result = await packagePlusHTML(new Packager(), prepared, {runtimeBundle, scaffoldingAssets});
await writeFile(path.join(output, 'plus-offline.html'), result.data);
await writeFile(path.join(output, 'plus-offline.sb3'), prepared.projectBytes);
await writeFile(path.join(output, 'plus-offline-fixture.json'), JSON.stringify({sha256, source, manifest: prepared.manifest}, null, 2));
console.log(path.join(output, 'plus-offline.html'));
