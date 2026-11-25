import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import Zip from '@turbowarp/jszip';
import {installEditorExtensionHost} from '../../site/extension-host/editor-host.ts';
import {identifyProject} from '../../site/extension-host/review.ts';
import {guiRequire, vmModules} from './pinned-host.ts';

const SHAPE = /^https:\/\/editor\.example\/turbowarp-plus-projects\/([0-9a-f]{2})\/([0-9a-f]{4})\/([0-9a-f-]{36})\.sb3$/;

test('the Editor passes its origin to project authoring and the review reads the saved address', async () => {
    const VM = guiRequire('scratch-vm');
    const Storage = guiRequire('@turbowarp/scratch-storage');
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
    Object.defineProperty(globalThis, 'location', {configurable: true, value: {origin: 'https://editor.example'}});
    const vm = new VM();
    vm.attachStorage(new Storage());
    let host;
    try {
        host = installEditorExtensionHost(vm, {enabled: true, document: undefined, vmModules,
            requestApproval: async () => true});
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"></svg>';
        const assetId = createHash('md5').update(svg).digest('hex');
        const project = {targets: [{isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {},
            comments: {}, currentCostume: 0, sounds: [], volume: 100, layerOrder: 0, tempo: 60,
            costumes: [{name: 'Blank', assetId, dataFormat: 'svg', md5ext: `${assetId}.svg`, rotationCenterX: 240, rotationCenterY: 180}],
            videoTransparency: 50, videoState: 'off', textToSpeechLanguage: null}],
        monitors: [], extensions: [], meta: {semver: '3.0.0', vm: '2.0.0', agent: 'URI fixture'}};
        await vm.loadProject(await new Zip().file('project.json', JSON.stringify(project)).file(`${assetId}.svg`, svg)
            .generateAsync({type: 'uint8array'}));
        const bytes = new TextEncoder().encode(
            "Scratch.extensions.register({getInfo(){return {id:'example',name:'Sample',blocks:[]}}});");
        await host.authoring.add({id: 'example', source: {type: 'embedded-file'}, bytes});
        const first = (await host.authoring.inspect()).uri;
        assert.match(first, SHAPE);
        assert.equal(await identifyProject(await vm.saveProjectSb3('arraybuffer')), first);
    } finally {
        if (descriptor) Object.defineProperty(globalThis, 'location', descriptor);
        else delete globalThis.location;
        await host?.dispose();
        vm.runtime.dispose();
    }
});
