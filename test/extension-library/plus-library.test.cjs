/**
 * Loading a reviewed selection uses the same host-owned permission registry that the GUI calls.
 * The VM and rendering dependencies still come from the prepared GUI checkout.
 */

const {guiRequire} = require('./harness.cjs');
const {test} = require('node:test');
const assert = require('node:assert/strict');
const load = require('../../site/extension-library/load-extensions.js').default;
const {beginPlusReview, canLoadPlusExtension, getPlusReviewedMode, setPlusHostPolicy} =
    require('../../site/gui-integration/lib/tw-plus-extension-permissions.js');
const permissions = {beginReview: beginPlusReview, canLoad: canLoadPlusExtension};

const entries = [
    {id: 'base', url: 'https://example.test/base.js', dependencies: []},
    {id: 'middle', url: 'https://example.test/middle.js', dependencies: ['base']},
    {id: 'app', url: 'https://example.test/app.js', dependencies: ['middle']}
];
const decisions = (...modes) => new Map(entries.map((entry, index) => [entry.url, modes[index] || 'sandboxed']));
function fixture() {
    const loaded = new Set();
    const calls = [];
    const security = {getSandboxMode(url) { return getPlusReviewedMode(security, url) || 'worker'; }};
    const vm = {extensionManager: {
        securityManager: security,
        isExtensionLoaded: id => loaded.has(id),
        async loadExtensionURL(url) {
            calls.push([url, await security.getSandboxMode(url)]);
            loaded.add(entries.find(entry => entry.url === url).id);
        }
    }};
    return {vm, security, loaded, calls};
}

test('Plus loads in dependency order, skips existing IDs and scopes reviewed modes to the batch', async () => {
    const {vm, security, loaded, calls} = fixture();
    const original = security.getSandboxMode;
    loaded.add('base');
    assert.deepEqual(await load(vm, entries, decisions('deny', 'unsandboxed', 'sandboxed'), permissions),
        ['base', 'middle', 'app']);
    assert.deepEqual(calls, [[entries[1].url, 'unsandboxed'], [entries[2].url, 'iframe']]);
    assert.equal(security.getSandboxMode, original);
    assert.equal(security.getSandboxMode(entries[1].url), 'worker');
});

test('denying a transitive dependency prevents all dependents from executing', async () => {
    const {vm, calls} = fixture();
    assert.deepEqual(await load(vm, entries, decisions('deny'), permissions), []);
    assert.deepEqual(calls, []);
});

test('failures clear reviewed decisions and retain successfully loaded dependencies', async () => {
    const {vm, security, loaded} = fixture();
    const original = vm.extensionManager.loadExtensionURL;
    vm.extensionManager.loadExtensionURL = async url => {
        if (url === entries[1].url) throw new Error('network');
        await original(url);
    };
    await assert.rejects(load(vm, entries, decisions(), permissions), /network/);
    assert.deepEqual([...loaded], ['base']);
    assert.equal(getPlusReviewedMode(security, entries[1].url), undefined);
    vm.extensionManager.loadExtensionURL = original;
    assert.deepEqual(await load(vm, entries, decisions(), permissions), ['base', 'middle', 'app']);
});

test('host policies retain control of custom permission and sandbox methods', async () => {
    const {vm, security, calls} = fixture();
    security.getSandboxMode = () => 'worker';
    setPlusHostPolicy(security, url => url !== entries[2].url);
    assert.deepEqual(await load(vm, entries, decisions('unsandboxed', 'unsandboxed', 'unsandboxed'), permissions),
        ['base', 'middle']);
    assert.deepEqual(calls.map(call => call[1]), ['worker', 'worker']);
    setPlusHostPolicy(security, null);
});

test('missing decisions and incorrect registered IDs fail before a dependent loads', async () => {
    const {vm, calls} = fixture();
    await assert.rejects(load(vm, entries, new Map(), permissions), /Missing permission/);
    assert.deepEqual(calls, []);
    vm.extensionManager.loadExtensionURL = async url => calls.push(url);
    await assert.rejects(load(vm, entries, decisions(), permissions), /catalog ID/);
    assert.deepEqual(calls, [entries[0].url]);
});

test('a disposed Plus view does not navigate or update its parent after a delayed apply finishes', async () => {
    const PlusLibrary = require('../../site/extension-library/plus-library.jsx').default;
    const {setExtensionAuthoringHost} = require('../../site/extension-host/authoring.js');
    const {vm} = fixture();
    let finish;
    setExtensionAuthoringHost(vm, {configure: () => new Promise(resolve => { finish = resolve; })});
    const callbacks = [];
    const view = new PlusLibrary({vm, locale: 'en', permissions,
        onCategorySelected: () => callbacks.push('category'),
        onRequestClose: () => callbacks.push('close'),
        onBusyChange: () => callbacks.push('busy')});
    view.alive = true;
    view.controller = new AbortController();
    view.state.entries = [entries[0]];
    view.setState = update => Object.assign(view.state, update);
    const pending = view.handleComplete(new Map([['base', {execution: 'unsandboxed', loading: 'remote-cacheable'}]]));
    await new Promise(resolve => setImmediate(resolve));
    view.componentWillUnmount();
    finish();
    await pending;
    // Only the busy flag went up before the view went away; nothing after it reached the parent.
    assert.deepEqual(callbacks, ['busy']);
    setExtensionAuthoringHost(vm, null);
});

test('saying no on the screen closes the library and loads nothing', async () => {
    const PlusLibrary = require('../../site/extension-library/plus-library.jsx').default;
    const {vm, calls} = fixture();
    const callbacks = [];
    const view = new PlusLibrary({vm, locale: 'ja', permissions,
        onCategorySelected: () => callbacks.push('category'),
        onRequestClose: () => callbacks.push('close'),
        onBusyChange: () => callbacks.push('busy')});
    view.alive = true;
    view.state.entries = entries;
    await view.handleComplete(null);
    assert.deepEqual(callbacks, ['close']);
    assert.deepEqual(calls, []);
});

test('the screen\'s answer configures exactly the chosen rows, with the form it chose, in dependency order', async () => {
    const PlusLibrary = require('../../site/extension-library/plus-library.jsx').default;
    const {setExtensionAuthoringHost} = require('../../site/extension-host/authoring.js');
    const {vm} = fixture();
    const requests = [];
    setExtensionAuthoringHost(vm, {configure: async received => { requests.push(...received); }});
    const callbacks = [];
    const view = new PlusLibrary({vm, locale: 'en', permissions,
        onCategorySelected: id => callbacks.push(['category', id]),
        onRequestClose: () => callbacks.push('close'),
        onBusyChange: () => {}});
    view.alive = true;
    view.controller = new AbortController();
    view.state.entries = entries;
    view.setState = update => Object.assign(view.state, update);
    // `app` is not chosen, so it is not in the answer and is not configured.
    await view.handleComplete(new Map([['base', {execution: 'unsandboxed', loading: 'embedded-data'}],
        ['middle', {execution: 'unsandboxed', loading: 'remote-non-cacheable'}]]));
    assert.deepEqual(requests.map(request => [request.id, request.execution, request.distribution]),
        [['base', 'unsandboxed', 'embedded-data'], ['middle', 'unsandboxed', 'remote-non-cacheable']]);
    assert.deepEqual(callbacks, [['category', 'middle'], 'close']);
    setExtensionAuthoringHost(vm, null);
});

test('with the Loader on the screen offers the four forms; with it off it offers none', () => {
    const {reviewRows} = require('../../site/extension-library/plus-library.jsx');
    const {executionChoices, loadingChoices} = require('@kubohiroya/turbowarp-extension-security-dialog');
    const {vm} = fixture();
    const on = reviewRows([entries[0]], vm, true)[0];
    const off = reviewRows([entries[0]], vm, false)[0];
    assert.deepEqual(loadingChoices(on), ['remote-cacheable', 'remote-non-cacheable', 'embedded-file', 'embedded-data']);
    assert.deepEqual(loadingChoices(off), []);
    // Either way a catalog row is trusted: how it runs is stated, not asked.
    assert.deepEqual(executionChoices(on, 'add'), []);
    assert.deepEqual(executionChoices(off, 'add'), []);
});
