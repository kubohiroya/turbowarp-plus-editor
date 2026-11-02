import assert from 'node:assert/strict';
import test from 'node:test';

import {createPlusIntegration, plusIntegration} from '../site/plus-integration.js';

const fixture = (flags: {embeddedYamlEditor: boolean; documentSources?: boolean}) => {
    const mounted: Record<string, unknown>[] = [];
    const disposals: string[] = [];
    const integration = createPlusIntegration({
        flags,
        mountEditor: (options: Record<string, unknown>) => {
            mounted.push(options);
            return {dispose: () => disposals.push('dispose')};
        }
    });
    return {integration, mounted, disposals};
};

const context = (vm: object = {}) => ({
    vm,
    locale: 'ja',
    document: {} as unknown as Document,
    getBlockly: async () => ({blockly: true})
});

// The flag is read once when the bundle starts, so a project cannot enable document editing by
// being opened. With it off nothing is mounted and there is nothing to dispose.
test('document editing stays off unless the startup flag enabled it', () => {
    const {integration, mounted} = fixture({embeddedYamlEditor: false});
    assert.equal(integration.attachToWorkspace(context()), null);
    assert.deepEqual(mounted, []);
});

test('the editor is mounted with the VM, the locale and the document the fork passed', async () => {
    const {integration, mounted, disposals} = fixture({embeddedYamlEditor: true, documentSources: true});
    const vm = {};
    const attachment = integration.attachToWorkspace(context(vm));
    assert.equal(mounted.length, 1);
    assert.equal(mounted[0]!.vm, vm);
    assert.equal(mounted[0]!.language, 'ja');
    assert.equal(mounted[0]!.documentSources, true);
    const getScratch = mounted[0]!.getScratch as () => {vm: object; gui: {getBlockly: () => Promise<unknown>}};
    assert.equal(getScratch().vm, vm);
    assert.deepEqual(await getScratch().gui.getBlockly(), {blockly: true});
    attachment!.dispose();
    assert.deepEqual(disposals, ['dispose']);
});

test('the source data forms follow their own flag', () => {
    const {integration, mounted} = fixture({embeddedYamlEditor: true, documentSources: false});
    integration.attachToWorkspace(context());
    assert.equal(mounted[0]!.documentSources, false);
});

// The real integration is the same shape, built from the package and the startup flags.
test('this distribution supplies the workspace attachment point', () => {
    const supplied = plusIntegration();
    assert.equal(typeof supplied, 'object');
    assert.equal(typeof supplied.attachToWorkspace, 'function');
});
