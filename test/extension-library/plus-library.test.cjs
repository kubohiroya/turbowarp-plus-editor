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

/**
 * A view on the given authoring host, with state updates applied in place as the tests above do.
 * @param {object} vm The fixture VM.
 * @param {string} [locale] The screen's language.
 * @returns {object} The view and what it told its parent.
 */
function retryView(vm, locale = 'en') {
    const PlusLibrary = require('../../site/extension-library/plus-library.jsx').default;
    const callbacks = [];
    const view = new PlusLibrary({vm, locale, permissions,
        onCategorySelected: id => callbacks.push(['category', id]),
        onRequestClose: () => callbacks.push('close'),
        onBusyChange: () => {}});
    view.alive = true;
    view.controller = new AbortController();
    view.state.entries = entries;
    view.setState = update => Object.assign(view.state, update);
    return {view, callbacks};
}

/**
 * The `ExtensionReview` element a render produced.
 * @param {object} node A rendered element.
 * @returns {object|null} The review element.
 */
function findReview(node) {
    const {ExtensionReview} = require('@kubohiroya/turbowarp-extension-security-dialog/react');
    if (!node || typeof node !== 'object') return null;
    if (node.type === ExtensionReview) return node;
    for (const child of [].concat(node.props?.children ?? [])) {
        const found = findReview(child);
        if (found) return found;
    }
    return null;
}

const markup = view => require('react-dom/server').renderToStaticMarkup(view.render());

test('a failure worth asking again offers to try again, and trying again repeats the same answer', async () => {
    const {setExtensionAuthoringHost} = require('../../site/extension-host/authoring.js');
    const {LoaderError} = require('@kubohiroya/turbowarp-extension-loader');
    const {vm} = fixture();
    const attempts = [];
    setExtensionAuthoringHost(vm, {configure: async received => {
        attempts.push(received.map(request => [request.id, request.execution, request.distribution]));
        if (attempts.length === 1) throw new LoaderError('TIMEOUT', 'The operation timed out');
    }});
    const {view, callbacks} = retryView(vm, 'ja');
    await view.handleComplete(new Map([['base', {execution: 'unsandboxed', loading: 'remote-cacheable'}]]));
    assert.deepEqual(view.state.failure, {code: 'TIMEOUT', message: 'The operation timed out', retryable: true});
    assert.deepEqual(callbacks, []);
    const review = findReview(view.render());
    assert.equal(review.props.failure, view.state.failure);
    assert.equal(review.props.onRetry, view.handleRetry);
    // The words and the button are the screen's own; this side only hands them the judgement.
    assert.match(markup(view), /もう一度試す/u);
    await review.props.onRetry();
    assert.deepEqual(attempts, [[['base', 'unsandboxed', 'remote-cacheable']], [['base', 'unsandboxed', 'remote-cacheable']]]);
    assert.equal(view.state.failure, null);
    assert.deepEqual(callbacks, [['category', 'base'], 'close']);
    setExtensionAuthoringHost(vm, null);
});

test('a refusal is stated with its code and message, and nothing offers to repeat it', async () => {
    const {setExtensionAuthoringHost} = require('../../site/extension-host/authoring.js');
    const {LoaderError} = require('@kubohiroya/turbowarp-extension-loader');
    for (const error of [
        new LoaderError('DIGEST_MISMATCH', 'Digest mismatch', 'base'),
        new LoaderError('CANCELLED', 'Cancelled'),
        // An offline fetch and a wrong registered ID share this code; only what it wraps decides.
        new LoaderError('LOAD_FAILED', 'Registered a different ID', 'base', new Error('catalog ID')),
        // What the VM's own loading throws with the Loader switched off: no fetch port of the Loader
        // produced it, so the Loader cannot vouch for asking again.
        new Error('network')
    ]) {
        const {vm} = fixture();
        let calls = 0;
        setExtensionAuthoringHost(vm, {configure: async () => { calls++; throw error; }});
        const {view, callbacks} = retryView(vm);
        await view.handleComplete(new Map([['base', {execution: 'unsandboxed', loading: 'embedded-data'}]]));
        assert.deepEqual(view.state.failure, {code: error.code || 'LOAD_FAILED', message: error.message,
            retryable: false});
        const html = markup(view);
        assert.ok(html.includes(error.code || 'LOAD_FAILED') && html.includes(error.message));
        assert.doesNotMatch(html, /twextsec-retry/u);
        assert.deepEqual(callbacks, []);
        assert.equal(calls, 1);
        setExtensionAuthoringHost(vm, null);
    }
});

test('this side writes no failure wording of its own and passes no failure before one happens', () => {
    const {vm} = fixture();
    const {view} = retryView(vm);
    assert.equal(findReview(view.render()).props.failure, null);
    const source = require('node:fs').readFileSync(require.resolve('../../site/extension-library/plus-library.jsx'), 'utf8');
    assert.doesNotMatch(source, /loadFailed|applyFailed|再試行してください/u);
});
