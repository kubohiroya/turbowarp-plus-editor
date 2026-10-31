const Zip = require('@turbowarp/jszip');
const {createHash} = require('node:crypto');
const source = `(function(Scratch){
if (!Scratch.extensions.unsandboxed) throw new Error('Unsandboxed execution required');
Scratch.vm.__plusPackageExecutions = (Scratch.vm.__plusPackageExecutions || 0) + 1;
Scratch.extensions.register({getInfo(){return {id:'sample',name:'Offline fixture',blocks:[
{opcode:'value',blockType:Scratch.BlockType.REPORTER,text:'offline value'}]};},value(){return 42;}});
})(Scratch);`;
const bytes = new TextEncoder().encode(source);
const sha256 = createHash('sha256').update(bytes).digest('hex');

async function packagedProject(type = 'embedded') {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#ffffff"/></svg>';
    const assetId = createHash('md5').update(svg).digest('hex');
    const project = {targets: [{isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
        currentCostume: 0, costumes: [{assetId, name: 'backdrop1', bitmapResolution: 1, md5ext: `${assetId}.svg`,
            dataFormat: 'svg', rotationCenterX: 240, rotationCenterY: 180}], sounds: [], volume: 100, layerOrder: 0,
        tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null}],
        monitors: [], extensions: ['sample'], extensionURLs: {}, meta: {semver: '3.0.0', vm: '2.0.0', agent: 'Plus offline fixture'},
        turboWarpPlus: {schemaVersion: 1, extensions: [{id: 'sample', execution: 'unsandboxed', sha256,
            source: type === 'remote' ? {type, url: 'https://fixture.invalid/code.js'} : {type, path: 'extensions/sample.js'}}]}};
    const zip = new Zip().file('project.json', JSON.stringify(project)).file(`${assetId}.svg`, svg);
    if (type === 'embedded') zip.file('extensions/sample.js', bytes);
    return zip.generateAsync({type: 'nodebuffer'});
}
module.exports = {source, bytes, sha256, packagedProject};
