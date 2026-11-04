import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readStartupFeatureFlags} from '../config/feature-flags.ts';
import {readWebStartupFeatureFlags} from '../config/web-startup-feature-flags.ts';
import {bootstrapExtensionLoader} from '../src/extension-loader.ts';

test('startup defaults on, supports explicit opt-in/out, rejects invalid values and is immutable', () => {
    for (const search of ['', '?lang=ja', '?twPlusExtensions=1', '?twPlusExtensionLoader=1']) {
        const flags = readWebStartupFeatureFlags(search);
        assert.equal(flags.extensionLoader, true);
        assert.equal(Object.isFrozen(flags), true);
    }
    for (const search of ['?twPlusExtensionLoader=true', '?twPlusExtensionLoader=false',
        '?twPlusExtensionLoader=0', '?twPlusExtensionLoader=']) {
        assert.equal(readWebStartupFeatureFlags(search).extensionLoader, false);
    }
});

test('disabled bootstrap never accesses host modules or project data', async () => {
    const forbidden = new Proxy({createExtensionLoader: undefined, installExtensionLoader: undefined}, {get() { throw new Error('accessed'); }});
    const result = await bootstrapExtensionLoader({startupSearch: '?twPlusExtensionLoader=0',
        loaderModule: forbidden, integration: forbidden});
    assert.equal(result.enabled, false);
    await result.dispose();
});

test('enabled bootstrap requires trusted host modules', async () => {
    await assert.rejects(bootstrapExtensionLoader({startupSearch: ''}), TypeError);
});

function fixture(install = undefined) {
    const calls = [];
    const ports = {hostOwned: true};
    const loaderOptions = {maxBytes: 123};
    const loader = {async unload() { calls.push('unload'); }};
    const host = {};
    return {calls, options: {
        startupSearch: '', host, ports, loaderOptions,
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
    await assert.rejects(bootstrapExtensionLoader(options), (error: Error & {code?: string; status?: number; errors?: Error[]}) => {
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
        startupSearch: '',
        loaderModule: {createExtensionLoader: () => ({
            async unload() { throw new Error('host recovery required'); }
        })},
        integration: {installExtensionLoader: () => async () => {
            throw new Error('registration unload failed');
        }}
    });
    await assert.rejects(result.dispose(), (error: Error & {code?: string; status?: number; errors?: Error[]}) => {
        assert.equal(error instanceof AggregateError, true);
        assert.deepEqual(error.errors.map(item => item.message),
            ['registration unload failed', 'host recovery required']);
        return true;
    });
});


test('startup flags carry the extension loader and default-on project tools switches', () => {
    for (const query of ['', '?twPlusExtensionLoader=1', '?twPlusScriptTransfer=0', '?twPlusScriptTransfer=1']) {
        assert.deepEqual(Object.keys(readWebStartupFeatureFlags(query)), ['extensionLoader', 'projectTools', 'spriteProperties', 'splitter', 'windowLayout', 'backpackPopout', 'internalWindows', 'stagePanel', 'targetList', 'paletteDeletePreview', 'horizontalBlockPalette']);
        assert.equal(readWebStartupFeatureFlags(query).projectTools, true);
    }
});

test('splitter opt-in does not change other startup flag defaults', () => {
    for (const search of ['', '?twPlusWindowLayout=0', '?twPlusWindowLayout=', '?twPlusWindowLayout=true']) {
        assert.equal(readWebStartupFeatureFlags(search).windowLayout, false);
    }
    assert.deepEqual(readWebStartupFeatureFlags('?twPlusWindowLayout=1&twPlusExtensionLoader=0'),
        {extensionLoader: false, projectTools: true, spriteProperties: false, splitter: true, windowLayout: true, backpackPopout: false, internalWindows: false, stagePanel: false, targetList: false, paletteDeletePreview: false, horizontalBlockPalette: false});
    assert.equal(readStartupFeatureFlags({twPlusWindowLayout: '1'}).windowLayout, true);
});

test('Backpack popout requires both startup opt-ins', () => {
    for (const query of ['', '?twPlusBackpackPopout=1', '?twPlusWindowLayout=0&twPlusBackpackPopout=1',
        '?twPlusWindowLayout=1&twPlusBackpackPopout=true']) {
        assert.equal(readWebStartupFeatureFlags(query).backpackPopout, false);
    }
    assert.equal(readWebStartupFeatureFlags('?twPlusWindowLayout=1&twPlusBackpackPopout=1').backpackPopout, true);
});

test('in-app windows require flexible layout and are independent of Backpack popouts', () => {
    for (const query of ['', '?twPlusInternalWindows=1', '?twPlusWindowLayout=1&twPlusInternalWindows=0',
        '?twPlusWindowLayout=1&twPlusInternalWindows=true', '?twPlusWindowLayout=1&twPlusBackpackPopout=1']) {
        assert.equal(readWebStartupFeatureFlags(query).internalWindows, false);
    }
    const flags = readWebStartupFeatureFlags('?twPlusWindowLayout=1&twPlusInternalWindows=1');
    assert.equal(flags.internalWindows, true);
    assert.equal(flags.backpackPopout, false);
});

test('sprite properties requires a separate explicit startup opt-in', () => {
    for (const search of ['', '?twPlusSpriteProperties=0', '?twPlusSpriteProperties=', '?twPlusSpriteProperties=true']) {
        assert.equal(readWebStartupFeatureFlags(search).spriteProperties, false);
    }
    assert.deepEqual(readWebStartupFeatureFlags('?twPlusSpriteProperties=1'),
        {extensionLoader: true, projectTools: true, spriteProperties: true, splitter: true, windowLayout: false, backpackPopout: false, internalWindows: false, stagePanel: false, targetList: false, paletteDeletePreview: false, horizontalBlockPalette: false});
});

test('the stage panel opt-in depends on flexible layout and internal windows', () => {
    const layout = '?twPlusWindowLayout=1&twPlusInternalWindows=1';
    for (const search of [layout, layout + '&twPlusStagePanel=0', '?twPlusStagePanel=1',
        '?twPlusWindowLayout=1&twPlusStagePanel=1']) {
        assert.equal(readWebStartupFeatureFlags(search).stagePanel, false);
    }
    assert.equal(readWebStartupFeatureFlags(layout + '&twPlusStagePanel=1').stagePanel, true);
});

test('the target list opt-in is independent of the stage panel and requires internal windows', () => {
    const query = '?twPlusWindowLayout=1&twPlusTargetList=1';
    assert.equal(readWebStartupFeatureFlags(query).targetList, false);
    const flags = readWebStartupFeatureFlags(query + '&twPlusInternalWindows=1');
    assert.equal(flags.targetList, true);
    assert.equal(flags.stagePanel, false);
});

test('splitters default on independently of undocking and support explicit rollback', () => {
    assert.equal(readWebStartupFeatureFlags().splitter, true);
    assert.equal(readWebStartupFeatureFlags('?twPlusWindowLayout=0').splitter, true);
    const flags = readWebStartupFeatureFlags('?twPlusSplitter=0&twPlusWindowLayout=1&twPlusInternalWindows=1');
    assert.equal(flags.splitter, false);
    assert.equal(flags.internalWindows, true);
});

test('the palette delete preview requires explicit startup opt-in', () => {
    for (const search of ['', '?twPlusPaletteDeletePreview=0', '?twPlusPaletteDeletePreview=', '?twPlusPaletteDeletePreview=true']) {
        assert.equal(readWebStartupFeatureFlags(search).paletteDeletePreview, false);
    }
    assert.equal(readWebStartupFeatureFlags('?twPlusPaletteDeletePreview=1').paletteDeletePreview, true);
});

test('the horizontal block palette is opt-in at startup', () => {
    for (const search of ['', '?twPlusHorizontalBlockPalette=0', '?twPlusHorizontalBlockPalette=true']) {
        assert.equal(readWebStartupFeatureFlags(search).horizontalBlockPalette, false);
    }
    assert.equal(readWebStartupFeatureFlags('?twPlusHorizontalBlockPalette=1').horizontalBlockPalette, true);
});
