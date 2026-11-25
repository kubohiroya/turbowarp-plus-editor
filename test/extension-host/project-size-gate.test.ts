import {test} from 'node:test';
import assert from 'node:assert/strict';
import {confirmedProjectArchiveOptions, extensionProjectArchiveOptions} from '../../site/extension-host/config.ts';
import {installPlusExtensionHost} from '../../site/extension-host/host.ts';
import {gateProjectSize} from '../../site/extension-host/project-size-gate.ts';

import {guiRequire, vmModules} from './pinned-host.ts';

const VM = guiRequire('scratch-vm');
const Zip = guiRequire('@turbowarp/jszip');
const MiB = 1024 * 1024;
const project = {targets: [{isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {},
    comments: {}, currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0, tempo: 60,
    videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null}], monitors: [], extensions: [],
    meta: {semver: '3.0.0', vm: '0.2.0', agent: 'size gate test'}};
// The bulk is a stage variable, which the VM keeps, so a test can tell which project is open.
const json = (bulkBytes: number) => JSON.stringify({...project,
    targets: [{...project.targets[0], variables: {bulk: ['bulk', 'x'.repeat(bulkBytes)]}}]});
const bulk = vm => vm.runtime.getTargetForStage().variables.bulk.value.length;
const stored = (text: string) => new Zip().file('project.json', text).generateAsync({type: 'uint8array', compression: 'STORE'});

test('the Editor host asks before opening a project over 64 MiB and opens it on agreement', async () => {
    const vm = new VM();
    const asked = [];
    let answer = false;
    const host = installPlusExtensionHost(vm, {enabled: true, document: undefined, vmModules,
        requestApproval: async () => false, archiveOptions: confirmedProjectArchiveOptions,
        gateProjectIO: io => gateProjectSize(io, {standard: extensionProjectArchiveOptions,
            ceiling: confirmedProjectArchiveOptions,
            confirm: async question => { asked.push(question); return answer; }})});
    try {
        const archive = await stored(json(70 * MiB));
        await vm.loadProject(json(10));
        await assert.rejects(vm.loadProject(archive), {code: 'INVALID_ARCHIVE'});
        assert.equal(bulk(vm), 10);
        assert.equal(asked.length, 1);
        assert.equal(asked[0].limit, 64 * MiB);
        assert.ok(asked[0].bytes > 70 * MiB);
        answer = true;
        await vm.loadProject(archive);
        assert.equal(bulk(vm), 70 * MiB);
        assert.equal(asked.length, 2);
    } finally { await host.dispose(); vm.runtime.dispose(); }
});
