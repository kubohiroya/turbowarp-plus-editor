import assert from 'node:assert/strict';
import test from 'node:test';

import {createPlusIntegration, plusIntegration} from '../site/plus-integration.ts';

const service = () => ({
    api: {addButton() {throw new Error('Unexpected control registration');}},
    setDebuggerButton: () => {},
    debuggerButton: () => null,
    setRecordButton: () => {},
    recordButton: () => null,
    placePanel: () => {},
    panel: () => null,
    snapshot: () => [],
    subscribe: () => () => true,
    clear: () => {}
});

const fixture = () => {
    const mounted: Record<string, unknown>[] = [];
    const disposals: string[] = [];
    const integration = createPlusIntegration({
        mountEditor: (options: Record<string, unknown>) => {
            mounted.push(options);
            return {dispose: () => disposals.push('editor')};
        },
        stageControls: () => service()
    });
    return {integration, mounted, disposals};
};

const DOCK = Symbol.for('@kubohiroya/turbowarp-app-shell/runtime-controls-dock/v1');
const hostDocument = () => ({} as unknown as Document & Record<symbol, unknown>);

const context = (vm: object = {}, doc = hostDocument()) => ({
    vm,
    locale: 'ja',
    document: doc as unknown as Document,
    getBlockly: async () => ({blockly: true}),
    getMessages: () => ({})
});

// There is no startup switch: the editor is always mounted, next to the dock. Whether a hat gets
// its file icon is decided inside the document editor by whether a registered provider owns its
// document, so a project without one still looks like upstream TurboWarp.
test('the document editor is always mounted, with the dock', () => {
    const {integration, mounted, disposals} = fixture();
    const doc = hostDocument();
    const attachment = integration.attachToWorkspace(context({}, doc));
    assert.equal(mounted.length, 1);
    assert.equal(typeof doc[DOCK], 'object');
    attachment.dispose();
    assert.deepEqual(disposals, ['editor']);
    assert.equal(doc[DOCK], undefined);
});

test('the editor is mounted with the VM, the locale and the document the fork passed', async () => {
    const {integration, mounted, disposals} = fixture();
    const vm = {};
    const attachment = integration.attachToWorkspace(context(vm));
    assert.equal(mounted.length, 1);
    assert.equal(mounted[0]!.vm, vm);
    assert.equal(mounted[0]!.language, 'ja');
    const getScratch = mounted[0]!.getScratch as () => {vm: object; gui: {getBlockly: () => Promise<unknown>}};
    assert.equal(getScratch().vm, vm);
    assert.deepEqual(await getScratch().gui.getBlockly(), {blockly: true});
    attachment!.dispose();
    assert.deepEqual(disposals, ['editor']);
});

// Whether a document's source location can be changed is the provider's decision, made inside the
// document editor; the Editor passes no flag of its own for it.
test('the editor is mounted without a source-location flag', () => {
    const {integration, mounted} = fixture();
    integration.attachToWorkspace(context());
    assert.equal('documentSources' in mounted[0]!, false);
});

// The real integration is the same shape, built from the package.
test('this distribution supplies the workspace attachment point', () => {
    const supplied = plusIntegration();
    assert.equal(typeof supplied, 'object');
    assert.equal(typeof supplied.attachToWorkspace, 'function');
});

// The runner waits only for the addons named here, so this list is what keeps the block editor
// from attaching to FieldDropdown methods that are about to be replaced.
test('this distribution names the addon whose startup the block editor depends on', () => {
    assert.deepEqual(plusIntegration().awaitStartupAddons, ['editor-searchable-dropdowns']);
    const built = createPlusIntegration({mountEditor: () => ({dispose () {}})});
    assert.deepEqual(built.awaitStartupAddons, ['editor-searchable-dropdowns']);
});

// app-shell shares one dock per document. The Editor says "use mine" before any extension asks,
// and must leave an existing one alone rather than stranding the controls already on it.
test('the dock is installed for the document and removed again on dispose', () => {
    const {integration} = fixture();
    const doc = hostDocument();
    const attachment = integration.attachToWorkspace(context({}, doc));
    const dock = doc[DOCK] as {stageControls: unknown; placePanel: unknown; subscribe: unknown};
    assert.equal(typeof dock.placePanel, 'function');
    assert.equal(typeof dock.subscribe, 'function');
    assert.ok(dock.stageControls);
    attachment.dispose();
    assert.equal(doc[DOCK], undefined);
});

test('a dock already on the document is left as it is', () => {
    const {integration} = fixture();
    const doc = hostDocument();
    const existing = {marker: true};
    doc[DOCK] = existing;
    const attachment = integration.attachToWorkspace(context({}, doc));
    assert.equal(doc[DOCK], existing);
    attachment.dispose();
    assert.equal(doc[DOCK], existing, 'disposing must not remove a dock it did not install');
});

// One attachment failing must not keep the others from being released.
test('every attachment is released even when one throws', () => {
    const released: string[] = [];
    const integration = createPlusIntegration({
        mountEditor: () => ({dispose () {
            released.push('editor');
            throw new Error('editor dispose failed');
        }}),
        stageControls: () => service()
    });
    const doc = hostDocument();
    const attachment = integration.attachToWorkspace(context({}, doc));
    assert.throws(() => attachment.dispose(), /editor dispose failed/);
    assert.deepEqual(released, ['editor']);
    assert.equal(doc[DOCK], undefined, 'the dock was still removed');
});

test('this distribution supplies the extension host and the library tab the GUI renders', async () => {
    const {plusIntegration} = await import('../site/plus-integration.ts');
    const supplied = plusIntegration() as Record<string, unknown>;
    // The GUI installs loading through this and renders the tab; what either does is decided here,
    // so a build that supplies neither leaves the editor with upstream's own library.
    assert.equal(typeof supplied.installExtensionHost, 'function');
    const tab = supplied.libraryTab as {tagProps: {tag: string; intlLabel: string}; render: unknown};
    assert.equal(tab.tagProps.tag, 'twplus');
    assert.equal(tab.tagProps.intlLabel, 'TurboWarp Plus');
    assert.equal(typeof tab.render, 'function');
    // Nothing is offered when this build says so, and the GUI then adds no tag at all.
    const {createPlusLibraryTab} = await import('../site/extension-library/tab.ts');
    assert.equal(createPlusLibraryTab({enabled: false}), null);
});


test('script transfer is always supplied and a host can supply its own entry points', () => {
    const supplied = plusIntegration().scriptTransfer as Record<string, unknown>;
    for (const name of ['attach', 'stageMenu', 'finalizeMenu']) assert.equal(typeof supplied[name], 'function');
    const scriptTransfer = {attach: () => null, stageMenu: () => null, finalizeMenu: items => items};
    const integration = createPlusIntegration({mountEditor: () => null, scriptTransfer});
    assert.equal(integration.scriptTransfer, scriptTransfer);
});
