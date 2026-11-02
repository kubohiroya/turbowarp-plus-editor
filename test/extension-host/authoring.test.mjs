import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import Zip from '@turbowarp/jszip';
import {installPlusExtensionHost} from '../../site/extension-host/host.js';

/**
 * What the installed host does with the GUI's authoring controller: it makes one, hands the VM's
 * project lifecycle to it, and restores the project when a candidate turns out to register the
 * wrong ID. The controller's own behaviour is the GUI's suite; this is the pairing.
 */

import {guiImport, guiRequire, vmModules} from './pinned-host.mjs';

// The authoring controller stays in the GUI: its extension library reads the controller back
// through the fork's own map. The host installed from here only makes one and hands it over.
const {createExtensionAuthoringController} = await guiImport('src/lib/tw-plus-extension-authoring.js');

const require = guiRequire;
const VM = require('scratch-vm');
const Storage = require('@turbowarp/scratch-storage');

test('real VM authoring preserves the project and restores prior extensions after ID mismatch', async () => {
    const vm = new VM();
    vm.attachStorage(new Storage());
    let approvals = 0;
    // The GUI hands the controller factory over; a built single HTML supplies none and runs
    // without one, which is why the host only makes one when it is asked to.
    const host = installPlusExtensionHost(vm, {enabled: true, document: undefined, vmModules,
        createAuthoring: createExtensionAuthoringController,
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
        await assert.rejects(host.authoring.add({id: 'firstwrong', source: {type: 'embedded'}, bytes: bytes('actual')}));
        assert.deepEqual(host.loader.getState(), {status: 'idle', ids: []});
        await host.authoring.add({id: 'example', source: {type: 'embedded'}, bytes: bytes('example')});
        assert.equal(vm.extensionManager.isExtensionLoaded('example'), true);
        assert.deepEqual(JSON.parse(vm.toJSON()).targets, before);
        const saved = await vm.saveProjectSb3('arraybuffer');
        const zip = await Zip.loadAsync(saved);
        assert.ok(zip.file('extensions/example.js'));
        const prior = JSON.parse(vm.toJSON());
        await assert.rejects(host.authoring.add({id: 'wrong', source: {type: 'embedded'}, bytes: bytes('actual')}));
        assert.equal(vm.extensionManager.isExtensionLoaded('example'), true);
        assert.equal(vm.extensionManager.isExtensionLoaded('wrong'), false);
        assert.equal(vm.extensionManager.isExtensionLoaded('actual'), false);
        assert.deepEqual(JSON.parse(vm.toJSON()), prior);
        assert.deepEqual(host.loader.getState(), {status: 'loaded', ids: ['example']});
        await host.authoring.add({id: 'second', source: {type: 'embedded'}, bytes: bytes('second')});
        assert.equal(vm.extensionManager.isExtensionLoaded('second'), true);
        assert.equal(approvals, 4);
    } finally {
        await host.dispose();
        vm.runtime.dispose();
    }
});
