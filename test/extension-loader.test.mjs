import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readStartupFeatureFlags} from '../config/feature-flags.js';
import {bootstrapExtensionLoader} from '../src/extension-loader.js';

test('startup opt-in is exact, immutable and defaults off', () => {
    for (const search of ['', '?twPlusExtensions=1', '?twPlusExtensionLoader=true', '?twPlusExtensionLoader=0']) {
        assert.equal(readStartupFeatureFlags(search).extensionLoader, false);
    }
    const flags = readStartupFeatureFlags('?twPlusExtensionLoader=1');
    assert.equal(flags.extensionLoader, true);
    assert.equal(Object.isFrozen(flags), true);
});

test('disabled bootstrap never accesses host modules or project data', async () => {
    const forbidden = new Proxy({}, {get() { throw new Error('accessed'); }});
    const result = await bootstrapExtensionLoader({loaderModule: forbidden, integration: forbidden});
    assert.equal(result.enabled, false);
    await result.dispose();
});

test('enabled bootstrap requires trusted host modules', async () => {
    await assert.rejects(bootstrapExtensionLoader({startupSearch: '?twPlusExtensionLoader=1'}), TypeError);
});

function fixture(install) {
    const calls = [];
    const ports = {hostOwned: true};
    const loaderOptions = {maxBytes: 123};
    const loader = {async unload() { calls.push('unload'); }};
    const host = {};
    return {calls, options: {
        startupSearch: '?twPlusExtensionLoader=1', host, ports, loaderOptions,
        loaderModule: {createExtensionLoader(actualPorts, actualOptions) {
            assert.equal(actualPorts, ports);
            assert.equal(actualOptions, loaderOptions);
            calls.push('create');
            return loader;
        }},
        integration: {async installExtensionLoader(actualHost, actualLoader) {
            assert.equal(actualHost, host);
            assert.equal(actualLoader, loader);
            calls.push('install');
            if (install) return install(calls);
            return async () => { calls.push('uninstall'); };
        }}
    }};
}

test('host modules receive ports unchanged and disposal restores once before unloading', async () => {
    const {calls, options} = fixture();
    const result = await bootstrapExtensionLoader(options);
    assert.equal(result.enabled, true);
    const first = result.dispose();
    assert.equal(first, result.dispose());
    await first;
    assert.deepEqual(calls, ['create', 'install', 'uninstall', 'unload']);
});

test('failed installation unloads the core', async () => {
    const {calls, options} = fixture(() => { throw new Error('installation failed'); });
    await assert.rejects(bootstrapExtensionLoader(options), /installation failed/);
    assert.deepEqual(calls, ['create', 'install', 'unload']);
});

test('missing uninstall is an integration error and unloads the core', async () => {
    const {calls, options} = fixture(() => null);
    await assert.rejects(bootstrapExtensionLoader(options), /uninstall function/);
    assert.deepEqual(calls, ['create', 'install', 'unload']);
});

test('installation and cleanup failures are both retained', async () => {
    const {options} = fixture(() => { throw new Error('installation failed'); });
    options.loaderModule.createExtensionLoader = () => ({
        async unload() { throw new Error('cleanup failed'); }
    });
    options.integration.installExtensionLoader = async () => { throw new Error('installation failed'); };
    await assert.rejects(bootstrapExtensionLoader(options), error => {
        assert.equal(error instanceof AggregateError, true);
        assert.deepEqual(error.errors.map(item => item.message), ['installation failed', 'cleanup failed']);
        return true;
    });
});

test('uninstall failure still unloads and repeated disposal preserves the failure', async () => {
    const {calls, options} = fixture(() => async () => {
        calls.push('uninstall');
        throw new Error('restore failed');
    });
    const result = await bootstrapExtensionLoader(options);
    await assert.rejects(result.dispose(), /restore failed/);
    await assert.rejects(result.dispose(), /restore failed/);
    assert.deepEqual(calls, ['create', 'install', 'uninstall', 'unload']);
});

test('teardown retains the first unload failure when host recovery also fails', async () => {
    const result = await bootstrapExtensionLoader({
        startupSearch: '?twPlusExtensionLoader=1',
        loaderModule: {createExtensionLoader: () => ({
            async unload() { throw new Error('host recovery required'); }
        })},
        integration: {installExtensionLoader: () => async () => {
            throw new Error('registration unload failed');
        }}
    });
    await assert.rejects(result.dispose(), error => {
        assert.equal(error instanceof AggregateError, true);
        assert.deepEqual(error.errors.map(item => item.message),
            ['registration unload failed', 'host recovery required']);
        return true;
    });
});
