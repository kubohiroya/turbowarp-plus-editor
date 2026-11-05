import assert from 'node:assert/strict';
import {test} from 'node:test';
import VirtualMachine from 'scratch-vm';
import centralDispatch from 'scratch-vm/src/dispatch/central-dispatch.js';
import createPreviewVm, {createPreviewVmWithDispatch} from '../../../../site/gui-integration/lib/tw-preview-vm.ts';

const entries = services => ['runtime', 'extensions'].map(key => Object.getOwnPropertyDescriptor(services, key));
class EmptyVm {
    securityManager: {canLoadExtensionFromProject?(): boolean} = {};
    extensionManager: {loadExtensionURL?(url: string): Promise<void>; loadExtensionIdSync?(id: string): void} = {};
}

test('preview construction restores exact prior service descriptors without touching unrelated services', async () => {
    const services: Record<string, {owner: string}> = {unrelated: {owner: 'editor'}};
    Object.defineProperty(services, 'runtime', {value: {owner: 'runtime'}, writable: false, enumerable: false, configurable: true});
    Object.defineProperty(services, 'extensions', {value: {owner: 'extensions'}, writable: true, enumerable: true, configurable: true});
    const before = entries(services);const unrelated = services.unrelated;
    class Preview extends EmptyVm {
        constructor() {
            super();assert.equal(Object.hasOwn(services, 'runtime'), false);assert.equal(Object.hasOwn(services, 'extensions'), false);
            services.runtime = {owner: 'preview'};services.extensions = {owner: 'preview'};
        }
    }
    const vm = createPreviewVmWithDispatch(Preview, {services});assert(vm instanceof Preview);
    assert.deepEqual(entries(services), before);assert.equal(services.unrelated, unrelated);
    assert.equal(vm.securityManager.canLoadExtensionFromProject(), false);
    await assert.rejects(vm.extensionManager.loadExtensionURL('https://invalid.test/extension.js'), /cannot load extensions/);
    assert.throws(() => vm.extensionManager.loadExtensionIdSync('pen'), /cannot load extensions/);
});

test('preview construction deletes services that were originally absent', () => {
    const services: Record<string, object> = {};
    class Preview extends EmptyVm {constructor() {super();services.runtime = {};services.extensions = {};}}
    createPreviewVmWithDispatch(Preview, {services});assert.deepEqual(entries(services), [undefined, undefined]);
});

test('a throwing VM constructor restores editor services exactly', () => {
    const runtime = {};const extensions = {};const services = {runtime, extensions};const before = entries(services);
    class Broken {constructor() {services.runtime = {};services.extensions = {};throw new Error('constructor failed');}}
    assert.throws(() => createPreviewVmWithDispatch(Broken, {services}), /constructor failed/);
    assert.deepEqual(entries(services), before);assert.equal(services.runtime, runtime);assert.equal(services.extensions, extensions);
});

test('an unsupported service table is rejected before deleting anything or invoking the constructor', () => {
    let called = false;class Preview {constructor() {called = true;}}
    const services: Record<string, object> = {};Object.defineProperty(services, 'runtime', {value: {}, configurable: false});
    const before = entries(services);assert.throws(() => createPreviewVmWithDispatch(Preview, {services}), /temporarily isolated/);
    assert.deepEqual(entries(services), before);assert.equal(called, false);
});

test('the native editor extension manager still registers and refreshes its own primitives after previews', async t => {
    const original = entries(centralDispatch.services);const main = new VirtualMachine();
    const before = entries(centralDispatch.services);const previews = [];
    t.after(() => {
        for (const vm of [...previews, main]) vm.quit();
        ['runtime', 'extensions'].forEach((key, index) => {
            if (original[index]) Object.defineProperty(centralDispatch.services, key, original[index]);
            else delete centralDispatch.services[key];
        });
        for (const key of Object.keys(centralDispatch.services)) {
            if (key.endsWith('_previewisolationfixture')) delete centralDispatch.services[key];
        }
    });
    for (let index = 0; index < 3; index++) {
        const preview = createPreviewVm();previews.push(preview);
        assert.notEqual(preview.runtime, main.runtime);assert.deepEqual(entries(centralDispatch.services), before);
    }
    let label = 'first report';
    main.extensionManager.builtinExtensions.previewisolationfixture = () => class {
        getInfo() {return {id: 'previewisolationfixture', name: 'Preview isolation fixture', blocks: [
            {opcode: 'report', blockType: 'reporter', text: label}
        ]};}
        report() {return 'editor-owned';}
    };
    main.extensionManager.loadExtensionIdSync('previewisolationfixture');
    await Promise.resolve();await Promise.resolve();
    assert.equal(typeof main.runtime._primitives.previewisolationfixture_report, 'function');
    for (const vm of previews) assert.equal(vm.runtime._primitives.previewisolationfixture_report, undefined);
    label = 'refreshed report';await main.extensionManager.refreshBlocks('previewisolationfixture');await Promise.resolve();
    const category = main.runtime._blockInfo.find(info => info.id === 'previewisolationfixture');
    assert(category);assert.equal(category.blocks[0].info.text, label);assert.deepEqual(entries(centralDispatch.services), before);
});
