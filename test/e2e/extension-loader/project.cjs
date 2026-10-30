const Zip = require('@turbowarp/jszip');
const {createHash} = require('node:crypto');
const source = `
globalThis.__plusFixtureStarted=(globalThis.__plusFixtureStarted||0)+1;
Scratch.vm.runtime.__plusFixtureStarted=(Scratch.vm.runtime.__plusFixtureStarted||0)+1;
Scratch.extensions.register({
 getInfo(){return {id:'plusfixture',name:'Plus fixture',blocks:[{opcode:'value',blockType:Scratch.BlockType.REPORTER,text:'verified Plus value'}]};},
 value(){return Scratch.extensions.unsandboxed && Scratch.vm.runtime ? 'verified VM' : 'wrong mode';}
});`;
const bytes = Buffer.from(source);
const digest = createHash('sha256').update(bytes).digest('hex');
const remoteURL = 'https://plus-fixture.invalid/extension.js';
async function project({type = 'embedded', code = bytes, sha256 = digest, id = 'plusfixture', url = remoteURL,
    schemaVersion = 1, extraManifest = {}, extensionURLs = {}} = {}) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"></svg>';
    const assetId = createHash('md5').update(svg).digest('hex');
    const spec = {id, execution: 'unsandboxed', sha256,
        source: type === 'remote' ? {type, url} : {type, path: 'extensions/plusfixture.js'}};
    const json = {targets: [{isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, comments: {},
        blocks: {fixture: {opcode: `${id}_value`, next: null, parent: null, inputs: {}, fields: {},
            shadow: false, topLevel: true, x: 40, y: 40}}, currentCostume: 0,
        costumes: [{name: 'Blank', assetId, dataFormat: 'svg', md5ext: `${assetId}.svg`, rotationCenterX: 240, rotationCenterY: 180}],
        sounds: [], volume: 100, layerOrder: 0, tempo: 60, videoTransparency: 50, videoState: 'off', textToSpeechLanguage: null}],
        monitors: [], extensions: [id], extensionURLs, meta: {semver: '3.0.0', vm: '2.0.0', agent: 'Plus loader E2E'},
        turboWarpPlus: {schemaVersion, extensions: [spec], ...extraManifest}};
    const zip = new Zip().file('project.json', JSON.stringify(json)).file(`${assetId}.svg`, svg);
    if (type === 'embedded') zip.file('extensions/plusfixture.js', code);
    return zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'});
}
module.exports = {project, source, bytes, digest, remoteURL};
