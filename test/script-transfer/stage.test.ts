// @ts-nocheck -- Migrated test fixture with dynamic host mocks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {guiRequire} from '../extension-host/pinned-host.ts';
import {exportStage, importStage} from '@kubohiroya/turbowarp-script-transfer';
const VM = guiRequire('scratch-vm');
const Storage = guiRequire('@turbowarp/scratch-storage');
const Zip = guiRequire('@turbowarp/jszip');
const {deserializeBlocks} = guiRequire('scratch-vm/src/serialization/sb3');
const makeVM = async t => {
    const vm = new VM();
    t.after(() => vm.runtime.dispose());
    const Sprite = guiRequire('scratch-vm/src/sprites/sprite');
    const target = new Sprite(null, vm.runtime).createClone();
    target.isStage = true;
    vm.runtime.targets.push(target);
    vm.setEditingTarget(target.id);
    const storage = new Storage();
    vm.attachStorage(storage);
    const asset = storage.createAsset(storage.AssetType.ImageVector, 'svg',
        new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'), null, true);
    vm.runtime.getTargetForStage().sprite.costumes = [{name: 'original', asset, assetId: asset.assetId,
        md5: `${asset.assetId}.svg`, dataFormat: 'svg', rotationCenterX: 0, rotationCenterY: 0}];
    // Asset decoding/rendering is covered by browser E2E. Keep real VM blocks, variables and ZIPs.
    vm.addCostume = async (md5, costume, id) => vm.runtime.getTargetById(id).addCostume(costume);
    return vm;
};
const archive = async (json, asset = false) => {
    const zip = new Zip();
    zip.file('sprite.json', JSON.stringify(json));
    if (asset) zip.file('image.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>');
    return zip.generateAsync({type: 'uint8array'});
};
const stageFile = () => ({isStage: true, name: 'Stage', variables: {old: ['score', 42]}, lists: {list: ['words', ['日本語']]},
    broadcasts: {}, blocks: {b: {opcode: 'data_setvariableto', next: null, parent: null, inputs: {},
        fields: {VARIABLE: ['score', 'old']}, topLevel: true, shadow: false, x: 40, y: 50}},
    costumes: [], sounds: []});

test('export is a sprite3-shaped archive containing the stage and its assets', async t => {
    const vm = await makeVM(t);
    const stage = vm.runtime.getTargetForStage();
    stage.createVariable('score', 'score', ''); stage.variables.score.value = 17;
    const blob = await exportStage(vm, stage, {Zip});
    const zip = await Zip.loadAsync(await blob.arrayBuffer());
    const json = JSON.parse(await zip.file('sprite.json').async('string'));
    assert.equal(json.isStage, true);
    assert.deepEqual(json.variables.score, ['score', 17]);
    for (const costume of json.costumes) assert.ok(zip.file(costume.md5ext));
});

test('stage import adds scripts/assets and merges globals while retaining destination values and settings', async t => {
    const vm = await makeVM(t);
    const stage = vm.runtime.getTargetForStage();
    stage.createVariable('destination', 'score', ''); stage.variables.destination.value = 9;
    stage.tempo = 83;
    const before = stage.getCostumes().length;
    const json = stageFile();
    json.costumes.push({name: 'imported', assetId: 'image', md5ext: 'image.svg', dataFormat: 'svg', rotationCenterX: 0, rotationCenterY: 0});
    await importStage(vm, await archive(json, true), {Zip, deserializeBlocks});
    assert.equal(vm.runtime.targets.filter(t => t.isStage).length, 1);
    assert.equal(stage.variables.destination.value, 9);
    assert.deepEqual(Object.values(stage.variables).find(v => v.type === 'list').value, ['日本語']);
    assert.equal(stage.getCostumes().length, before + 1);
    assert.equal(stage.tempo, 83);
    const imported = Object.values(stage.blocks._blocks).find(b => b.opcode === 'data_setvariableto');
    assert.equal(imported.fields.VARIABLE.id, 'destination');
});

test('missing assets fail before adding scripts or variables', async t => {
    const vm = await makeVM(t);
    const stage = vm.runtime.getTargetForStage();
    const before = Object.keys(stage.variables);
    const json = stageFile(); json.sounds.push({name: 'missing', md5ext: 'missing.wav'});
    await assert.rejects(importStage(vm, await archive(json), {Zip, deserializeBlocks}), /Missing stage asset/);
    assert.deepEqual(Object.keys(stage.variables), before);
    assert.equal(Object.keys(stage.blocks._blocks).length, 0);
});

test('asset installation failure rolls back new stage content', async t => {
    const vm = await makeVM(t);
    const stage = vm.runtime.getTargetForStage();
    const before = Object.keys(stage.variables);
    const json = stageFile();
    json.costumes.push({name: 'imported', assetId: 'image', md5ext: 'image.svg', dataFormat: 'svg'});
    vm.addCostume = async () => { throw new Error('asset failed'); };
    await assert.rejects(importStage(vm, await archive(json, true), {Zip, deserializeBlocks}), /asset failed/);
    assert.deepEqual(Object.keys(stage.variables), before);
    assert.equal(Object.keys(stage.blocks._blocks).length, 0);
});

test('asset name collisions rename both the imported backdrop and its literal references', async t => {
    const vm = await makeVM(t);
    const stage = vm.runtime.getTargetForStage();
    const json = stageFile();
    json.costumes.push({name: 'original', md5ext: 'image.svg', assetId: 'image', dataFormat: 'svg'});
    json.blocks.menu = {opcode: 'looks_backdrops', inputs: {}, fields: {BACKDROP: ['original', null]},
        topLevel: true, shadow: true, next: null, parent: null};
    await importStage(vm, await archive(json, true), {Zip, deserializeBlocks});
    assert.deepEqual(stage.getCostumes().map(c => c.name), ['original', 'original (2)']);
    assert.equal(Object.values(stage.blocks._blocks).find(b => b.opcode === 'looks_backdrops').fields.BACKDROP.value, 'original (2)');
});
