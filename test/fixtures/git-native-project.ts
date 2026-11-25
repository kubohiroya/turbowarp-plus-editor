import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16"/></svg>';
const assetId = createHash('md5').update(svg).digest('hex');

/** A minimal real Scratch project folder for tests that previously picked an arbitrary repository. */
export async function writeNativeGitProject(root: string) {
    const asset = assetId + '.svg';
    const costume = {name: 'Square', assetId, dataFormat: 'svg', md5ext: asset,
        rotationCenterX: 8, rotationCenterY: 8, bitmapResolution: 1};
    const target = {variables: {}, lists: {}, broadcasts: {}, comments: {}, costumes: [costume],
        sounds: [], currentCostume: 0, volume: 100, blocks: {}};
    const project = {targets: [
        {...target, name: 'Stage', isStage: true},
        {...target, name: 'Sprite', isStage: false, x: 0, y: 0, size: 100, visible: true,
            direction: 90, draggable: false, rotationStyle: 'all around'}
    ], monitors: [], extensions: [], meta: {semver: '3.0.0'}};
    await mkdir(path.join(root, 'assets'), {recursive: true});
    const filename = path.join(root, 'project.source.json');
    await Promise.all([
        writeFile(filename, JSON.stringify(project, null, 2) + '\n'),
        writeFile(path.join(root, 'assets', asset), svg),
        writeFile(path.join(root, 'embedded-extensions.json'), JSON.stringify({formatVersion: 1, extensions: []})),
        writeFile(path.join(root, 'sb3-source.json'), JSON.stringify({formatVersion: 1, project: 'project.source.json',
            embeddedExtensions: 'embedded-extensions.json', assetsDirectory: 'assets', archiveEntries: ['project.json', asset]}))
    ]);
    return {filename, project};
}
