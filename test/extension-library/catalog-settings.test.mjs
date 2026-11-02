import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import Zip from '@turbowarp/jszip';
import {applyPlusCatalogSettings, readPlusCatalogSettings} from '../../site/extension-library/catalog-settings.js';
import {createExtensionAuthoringController, setExtensionAuthoringHost} from '../../site/extension-host/authoring.js';

const entry = (id, dependencies = []) => ({id, ids: [id], url: `https://catalog.test/${id}.js`, dependencies,
    metadata: {name: id, version: '1.2.3'}});
const spec = (id, type = 'remote', execution = 'unsandboxed') => ({id, execution, sha256: 'a'.repeat(64),
    source: type === 'remote' ? {type, url: entry(id).url} : {type, path: `extensions/${id}.js`}});
function vmFixture(services = [], loadedIds = services.map(([id]) => id)) {
    return {extensionManager: {_loadedExtensions: new Map(services),
        isExtensionLoaded(id) { return loadedIds.includes(id); }}};
}
const selection = (entries, choices, distributions = []) => ({entries,
    choices: new Map(choices.map(([id, mode]) => [entry(id).url, mode])), distributions: new Map(distributions)});
const deferred = () => {
    let resolve;
    const promise = new Promise(yes => { resolve = yes; });
    return {promise, resolve};
};
async function plainSB3() {
    return new Zip().file('project.json', JSON.stringify({targets: [{isStage: true, name: 'Stage', blocks: {}}],
        extensions: [], meta: {agent: 'Catalog adapter tests'}})).file('keep.bin', new Uint8Array([1, 3, 7]))
        .generateAsync({type: 'uint8array', compression: 'STORE'});
}

test('actual VM service prefixes restore execution while Loader manifest restores independent distribution', async () => {
    const entries = [entry('outside'), entry('inside')];
    const vm = vmFixture([['outside', 'unsandboxed.1.outside'], ['inside', 'extension.2.inside']]);
    const manifest = {extensions: [spec('outside', 'embedded', 'sandboxed'), spec('inside', 'remote', 'unsandboxed')]};
    setExtensionAuthoringHost(vm, {inspect: async () => manifest});
    const settings = await readPlusCatalogSettings(vm, entries);
    assert.deepEqual([...settings.choices], [[entries[0].url, 'unsandboxed'], [entries[1].url, 'sandboxed']]);
    assert.deepEqual([...settings.distributions], [['outside', 'embedded'], ['inside', 'remote']]);
    setExtensionAuthoringHost(vm, null);
});

test('legacy loaded entries default to Remote and a missing Loader host does not invent execution state', async () => {
    const entries = [entry('legacy'), entry('newentry')];
    const vm = vmFixture([['legacy', 'extension.2.legacy']]);
    const settings = await readPlusCatalogSettings(vm, entries);
    assert.deepEqual([...settings.choices], [[entries[0].url, 'sandboxed']]);
    assert.deepEqual([...settings.distributions], [['legacy', 'remote']]);
});

test('saved but unused Plus metadata restores distribution without treating its execution request as consent', async () => {
    const vm = vmFixture([['unused', 'unsandboxed.3.unused']], []);
    const existing = spec('unused', 'embedded');
    setExtensionAuthoringHost(vm, {inspect: async () => ({extensions: [existing]})});
    const settings = await readPlusCatalogSettings(vm, [entry('unused')]);
    assert.deepEqual([...settings.distributions], [['unused', 'embedded']]);
    assert.equal(settings.choices.size, 0);
    assert.equal(existing.execution, 'unsandboxed');
    setExtensionAuthoringHost(vm, null);
});

test('unknown or absent VM service names do not silently restore a sandbox mode', async () => {
    const entries = [entry('unknown'), entry('missing')];
    const vm = vmFixture([['unknown', 'unexpected-service']], ['unknown', 'missing']);
    const settings = await readPlusCatalogSettings(vm, entries);
    assert.equal(settings.choices.size, 0);
    assert.deepEqual([...settings.distributions], [['unknown', 'remote'], ['missing', 'remote']]);
});

test('apply forwards every selected and loaded row together with execution, distribution, dependencies, version and signal', async () => {
    const vm = vmFixture([['base', 'extension.1.base']]);
    const entries = [entry('base'), entry('parent', ['base'])];
    const calls = [];
    const signal = new AbortController().signal;
    setExtensionAuthoringHost(vm, {configure: async (...args) => calls.push(args)});
    const result = await applyPlusCatalogSettings(vm, selection(entries,
        [['base', 'sandboxed'], ['parent', 'unsandboxed']], [['base', 'embedded'], ['parent', 'remote']]), {signal});
    assert.deepEqual(result, ['base', 'parent']);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][0], [
        {id: 'base', url: entries[0].url, execution: 'sandboxed', distribution: 'embedded', dependencies: [], version: '1.2.3'},
        {id: 'parent', url: entries[1].url, execution: 'unsandboxed', distribution: 'remote', dependencies: ['base'], version: '1.2.3'}
    ]);
    assert.equal(calls[0][1].signal, signal);
    setExtensionAuthoringHost(vm, null);
});

test('an empty selection does not call configure and forged deny choices reject the entire batch', async () => {
    const vm = vmFixture();
    const entries = [entry('denied'), entry('allowed')];
    const calls = [];
    setExtensionAuthoringHost(vm, {configure: async requests => calls.push(requests)});
    assert.deepEqual(await applyPlusCatalogSettings(vm, selection([], [])), []);
    await assert.rejects(applyPlusCatalogSettings(vm,
        selection(entries, [['denied', 'deny'], ['allowed', 'sandboxed']])), {code: 'MISSING_EXECUTION'});
    assert.equal(calls.length, 0);
    setExtensionAuthoringHost(vm, null);
});

test('denial of an already-loaded extension is rejected instead of claiming it stopped running', async () => {
    const vm = vmFixture([['loaded', 'extension.1.loaded']]);
    let calls = 0;
    setExtensionAuthoringHost(vm, {configure: async () => { calls++; }});
    await assert.rejects(applyPlusCatalogSettings(vm, selection([entry('loaded')], [['loaded', 'deny']])), {code: 'MISSING_EXECUTION'});
    assert.equal(calls, 0);
    assert.equal(vm.extensionManager.isExtensionLoaded('loaded'), true);
    setExtensionAuthoringHost(vm, null);
});

test('missing or unknown execution prevents the entire batch from reaching configure', async () => {
    for (const mode of [undefined, 'automatic']) {
        const vm = vmFixture();
        let calls = 0;
        setExtensionAuthoringHost(vm, {configure: async () => { calls++; }});
        await assert.rejects(applyPlusCatalogSettings(vm, selection([entry('first'), entry('second')],
            [['first', 'sandboxed'], ['second', mode]])), {code: 'MISSING_EXECUTION'});
        assert.equal(calls, 0);
        setExtensionAuthoringHost(vm, null);
    }
});

test('the disabled Loader host refuses distribution writes', async () => {
    await assert.rejects(applyPlusCatalogSettings(vmFixture(), selection([entry('sample')], [['sample', 'sandboxed']])), {code: 'LOADER_DISABLED'});
});

test('configure and inspect connect the real core batch API to one project apply without executing JS', async () => {
    const vm = new EventEmitter();
    vm.extensionManager = {isExtensionLoaded: () => false};
    let current = await plainSB3();
    const approvals = [];
    const loads = [];
    let controller;
    vm.saveProjectSb3 = async () => current.slice().buffer;
    vm.loadProject = async bytes => {
        controller.projectLoadStarted();
        loads.push(bytes);
        current = new Uint8Array(bytes);
    };
    controller = createExtensionAuthoringController(vm, {zip: Zip, ports: {
        fetcher: {async fetch(url) { return {bytes: new TextEncoder().encode('globalThis.__catalogAdapterExecuted=true;'), finalURL: url, redirects: []}; }},
        trustProvider: {async authorize(code) { approvals.push([code.id, code.execution, code.source.type]); return {allowed: true, scope: 'digest', sha256: code.sha256}; }}
    }});
    const configured = await controller.configure([
        {id: 'first', url: entry('first').url, distribution: 'embedded', execution: 'sandboxed', dependencies: [], version: '1.2.3'},
        {id: 'second', url: entry('second').url, distribution: 'remote', execution: 'unsandboxed', dependencies: ['first'], version: '1.2.3'}
    ]);
    assert.deepEqual(approvals, [['first', 'sandboxed', 'embedded'], ['second', 'unsandboxed', 'remote']]);
    assert.equal(loads.length, 1);
    assert.deepEqual(await controller.inspect(), configured);
    assert.equal(globalThis.__catalogAdapterExecuted, undefined);
    const saved = await Zip.loadAsync(current);
    assert.deepEqual(await saved.file('keep.bin').async('uint8array'), new Uint8Array([1, 3, 7]));
    controller.dispose();
});

test('inspect rejects pending configuration and project changes during asynchronous serialization', async () => {
    const vm = new EventEmitter();
    vm.extensionManager = {isExtensionLoaded: () => false};
    const current = await plainSB3();
    const fetching = deferred();
    const resume = deferred();
    vm.saveProjectSb3 = async () => current;
    vm.loadProject = async () => {};
    const controller = createExtensionAuthoringController(vm, {zip: Zip, ports: {
        fetcher: {async fetch(url) { fetching.resolve(); await resume.promise; return {bytes: new TextEncoder().encode('/* code */'), finalURL: url, redirects: []}; }},
        trustProvider: {async authorize(code) { return {allowed: true, scope: 'digest', sha256: code.sha256}; }}
    }});
    const pending = controller.configure([{id: 'sample', url: entry('sample').url, distribution: 'remote', execution: 'sandboxed'}]);
    await fetching.promise;
    await assert.rejects(controller.inspect(), {code: 'PROJECT_BUSY'});
    resume.resolve();
    await pending;
    const serialized = deferred();
    vm.saveProjectSb3 = () => serialized.promise;
    const inspecting = controller.inspect();
    vm.emit('PROJECT_CHANGED');
    serialized.resolve(current);
    await assert.rejects(inspecting, {code: 'PROJECT_CHANGED'});
    controller.dispose();
});
