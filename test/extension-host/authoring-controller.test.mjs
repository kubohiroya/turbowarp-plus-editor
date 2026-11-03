import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createExtensionAuthoringController} from '../../site/extension-host/authoring.js';
const spec = {id: 'example', sha256: 'a'.repeat(64)};
const prepared = {spec, projectBytes: new Uint8Array([2])};
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return {promise, resolve, reject};
};
function fixture(prepareAddition = async () => prepared, loadResult = async () => {}) {
    const vm = new EventEmitter();
    const original = new Uint8Array([1]);
    const loads = [];
    let controller;
    vm.saveProjectSb3 = async () => original;
    vm.loadProject = bytes => {
        controller.projectLoadStarted();
        loads.push(bytes);
        return loadResult(bytes, loads.length);
    };
    controller = createExtensionAuthoringController(vm, {prepareAddition, ports: {}, zip: {}});
    return {vm, original, loads, controller};
}

test('authoring applies only the core-approved candidate and marks the project dirty', async () => {
    const stage = deferred();
    const {vm, loads, controller} = fixture(() => stage.promise);
    let dirty = 0;
    vm.on('PROJECT_CHANGED', () => dirty++);
    const adding = controller.add({id: 'example'});
    await Promise.resolve();
    assert.equal(loads.length, 0);
    await assert.rejects(controller.add({id: 'other'}), {code: 'PROJECT_BUSY'});
    stage.resolve(prepared);
    assert.equal(await adding, spec);
    assert.deepEqual(loads, [prepared.projectBytes]);
    assert.equal(dirty, 1);
    controller.dispose();
});

test('denied approval never mutates the VM', async () => {
    const {loads, controller} = fixture(async () => { throw Object.assign(new Error('Denied'), {code: 'TRUST_DENIED'}); });
    await assert.rejects(controller.add({id: 'example'}), {code: 'TRUST_DENIED'});
    assert.equal(loads.length, 0);
    controller.dispose();
});

test('registration failure restores the original SB3', async () => {
    const {original, loads, controller} = fixture(undefined, async (bytes, count) => {
        if (count === 1) throw Object.assign(new Error('Wrong ID'), {code: 'REGISTRATION_ID_MISMATCH'});
    });
    await assert.rejects(controller.add({id: 'example'}), {code: 'REGISTRATION_ID_MISMATCH'});
    assert.deepEqual(loads, [prepared.projectBytes, original]);
    controller.dispose();
});

test('failed recovery retains the original SB3 for explicit download', async () => {
    const {original, controller} = fixture(undefined, async () => { throw new Error('Registration failed'); });
    await assert.rejects(controller.add({id: 'example'}), error => {
        assert.equal(error.code, 'PROJECT_RECOVERY_REQUIRED');
        assert.equal(error.originalProject, original);
        return true;
    });
    controller.dispose();
});

test('project edits and project switches cancel pending preparation without restoring stale data', async () => {
    for (const change of ['edit', 'switch']) {
        const stage = deferred();
        const {vm, loads, controller} = fixture(() => stage.promise);
        const adding = controller.add({id: 'example'});
        await Promise.resolve();
        if (change === 'edit') vm.emit('PROJECT_CHANGED');
        else await vm.loadProject(new Uint8Array([9]));
        stage.resolve(prepared);
        await assert.rejects(adding, {code: 'PROJECT_CHANGED'});
        assert.equal(loads.length, change === 'edit' ? 0 : 1);
        controller.dispose();
    }
});

test('a newer queued project is not overwritten after candidate loading fails', async () => {
    const loading = deferred();
    const {vm, loads, controller} = fixture(undefined, async (bytes, count) => {
        if (count === 1) return loading.promise;
    });
    const adding = controller.add({id: 'example'});
    while (loads.length === 0) await Promise.resolve();
    await vm.loadProject(new Uint8Array([9]));
    loading.reject(new Error('Registration failed'));
    await assert.rejects(adding);
    assert.equal(loads.length, 2);
    assert.deepEqual(loads[1], new Uint8Array([9]));
    controller.dispose();
});

test('abort and disposal invalidate prepared candidates', async () => {
    for (const action of ['abort', 'dispose']) {
        const stage = deferred();
        const {loads, controller} = fixture(() => stage.promise);
        const signal = new AbortController();
        const adding = controller.add({id: 'example'}, {signal: signal.signal});
        await Promise.resolve();
        if (action === 'abort') signal.abort();
        else controller.dispose();
        stage.resolve(prepared);
        await assert.rejects(adding, {code: 'PROJECT_CHANGED'});
        assert.equal(loads.length, 0);
        controller.dispose();
    }
});


test('a change the Loader could not prepare is reported, so a waiting indicator comes down', async () => {
    const events = [];
    const vm = new EventEmitter();
    vm.saveProjectSb3 = async () => new Uint8Array([1]);
    vm.loadProject = async () => assert.fail('nothing is loaded');
    const failed = Object.assign(new Error('Catalog extension could not be fetched'),
        {code: 'LOAD_FAILED', extensionId: 'example'});
    const controller = createExtensionAuthoringController(vm, {ports: {}, zip: {},
        prepareAddition: async () => { throw failed; }, diagnostics: event => events.push(event)});
    await assert.rejects(controller.add({id: 'example'}), error => error === failed);
    assert.deepEqual(events, [{type: 'error', code: 'LOAD_FAILED', id: 'example',
        message: 'Catalog extension could not be fetched'}]);
    controller.dispose();
    // Showing it cannot change the outcome.
    const quiet = createExtensionAuthoringController(vm, {ports: {}, zip: {},
        prepareAddition: async () => { throw failed; }, diagnostics: () => { throw new Error('presentation'); }});
    await assert.rejects(quiet.add({id: 'example'}), error => error === failed);
    quiet.dispose();
});
