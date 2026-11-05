// @ts-nocheck -- Migrated test fixture with dynamic host mocks.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import Zip from '@turbowarp/jszip';
import {installEditorExtensionHost} from '../../site/extension-host/editor-host.ts';

/**
 * What the installed host does with the authoring controller: it makes one, hands the VM's project
 * lifecycle to it, and restores the project when a candidate turns out to register the wrong ID.
 * The controller's own behaviour is `authoring-controller.test.ts`; this is the pairing with a
 * real VM and a real project.
 */

import {guiRequire, vmModules} from './pinned-host.ts';

const require = guiRequire;
const VM = require('scratch-vm');
const Storage = require('@turbowarp/scratch-storage');

test('real VM authoring preserves the project and restores prior extensions after ID mismatch', async () => {
    const vm = new VM();
    vm.attachStorage(new Storage());
    let approvals = 0;
    // The editor's entry is what adds the controller; a built HTML's entry supplies none.
    const host = installEditorExtensionHost(vm, {enabled: true, document: undefined, vmModules,
        requestApproval: async () => { approvals++; return true; }});
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"></svg>';
    const assetId = createHash('md5').update(svg).digest('hex');
    const project = {targets: [{isStage: true, name: 'Stage', variables: {kept: ['kept', 123]}, lists: {},
        broadcasts: {}, blocks: {}, comments: {}, currentCostume: 0,
        costumes: [{name: 'Blank', assetId, dataFormat: 'svg', md5ext: `${assetId}.svg`, rotationCenterX: 240, rotationCenterY: 180}],
        sounds: [], volume: 100, layerOrder: 0, tempo: 60, videoTransparency: 50, videoState: 'off', textToSpeechLanguage: null}],
    monitors: [], extensions: [], meta: {semver: '3.0.0', vm: '2.0.0', agent: 'Authoring fixture'}};
    const input = await new Zip().file('project.json', JSON.stringify(project)).file(`${assetId}.svg`, svg)
        .generateAsync({type: 'uint8array'});
    const bytes = id => new TextEncoder().encode(`Scratch.extensions.register({getInfo(){return {id:'${id}',name:'Sample',blocks:[]}}});`);
    try {
        await vm.loadProject(input);
        const before = JSON.parse(vm.toJSON()).targets;
        await assert.rejects(host.authoring.add({id: 'firstwrong', source: {type: 'embedded-file'}, bytes: bytes('actual')}));
        assert.deepEqual(host.loader.getState(), {status: 'idle', ids: []});
        await host.authoring.add({id: 'example', source: {type: 'embedded-file'}, bytes: bytes('example')});
        assert.equal(vm.extensionManager.isExtensionLoaded('example'), true);
        assert.deepEqual(JSON.parse(vm.toJSON()).targets, before);
        const saved = await vm.saveProjectSb3('arraybuffer');
        const zip = await Zip.loadAsync(saved);
        assert.ok(zip.file('extensions/example.js'));
        const prior = JSON.parse(vm.toJSON());
        await assert.rejects(host.authoring.add({id: 'wrong', source: {type: 'embedded-file'}, bytes: bytes('actual')}));
        assert.equal(vm.extensionManager.isExtensionLoaded('example'), true);
        assert.equal(vm.extensionManager.isExtensionLoaded('wrong'), false);
        assert.equal(vm.extensionManager.isExtensionLoaded('actual'), false);
        assert.deepEqual(JSON.parse(vm.toJSON()), prior);
        assert.deepEqual(host.loader.getState(), {status: 'loaded', ids: ['example']});
        await host.authoring.add({id: 'second', source: {type: 'embedded-file'}, bytes: bytes('second')});
        assert.equal(vm.extensionManager.isExtensionLoaded('second'), true);
        assert.equal(approvals, 4);
    } finally {
        await host.dispose();
        vm.runtime.dispose();
    }
});
