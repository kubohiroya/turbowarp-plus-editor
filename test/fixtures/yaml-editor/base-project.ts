import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import JSZip from '@turbowarp/jszip';

// A small SB3 with real asset entries, so the document fixtures can be built in CI without a
// checked-in binary or an SB3 borrowed from another repository. The browser regressions check
// that every asset entry survives a document save byte for byte, so two are enough.
const svg = (width, height, fill) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${fill}"/></svg>`;
const costume = (name, data, rotationCenterX, rotationCenterY) => {
    const assetId = createHash('md5').update(data).digest('hex');
    return {entry: {name, assetId, dataFormat: 'svg', md5ext: `${assetId}.svg`, rotationCenterX, rotationCenterY}, data};
};

export async function buildBaseProject(output) {
    const backdrop = costume('Backdrop', svg(480, 360, '#f4f1ea'), 240, 180);
    const sprite = costume('Square', svg(40, 40, '#087f8c'), 20, 20);
    const common = {variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {}, currentCostume: 0, sounds: [], volume: 100};
    const project = {
        targets: [
            {...common, isStage: true, name: 'Stage', layerOrder: 0, costumes: [backdrop.entry],
                tempo: 60, videoTransparency: 50, videoState: 'off', textToSpeechLanguage: null},
            {...common, isStage: false, name: 'Sprite1', layerOrder: 1, costumes: [sprite.entry], visible: true,
                x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'}
        ],
        monitors: [], extensions: [],
        meta: {semver: '3.0.0', vm: '0.2.0', agent: 'turbowarp-plus-editor document test fixture'}
    };
    const archive = new JSZip();
    archive.file('project.json', JSON.stringify(project));
    for (const item of [backdrop, sprite]) archive.file(item.entry.md5ext, item.data);
    const bytes = await archive.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'});
    await fs.mkdir(path.dirname(output), {recursive: true});
    await fs.writeFile(output, bytes);
    return {output, sha256: createHash('sha256').update(bytes).digest('hex'), assets: 2};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.stdout.write(JSON.stringify(await buildBaseProject(path.resolve(process.argv[2]))) + '\n');
}
