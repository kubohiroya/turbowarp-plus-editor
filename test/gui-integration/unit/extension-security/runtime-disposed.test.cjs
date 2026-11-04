require('./helpers.cjs');
const {test} = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const SecurityManager = require('../../../src/containers/tw-security-manager.jsx').default.WrappedComponent;
const SecurityModals = require('../../../src/lib/tw-security-manager-constants').default;

function fixture() {
    const runtime = new EventEmitter();
    const manager = new SecurityManager({vm: {runtime}, securityManager: {}});
    // Apply state synchronously instead of mounting the component.
    manager.setState = update => {
        manager.state = {...manager.state, ...(typeof update === 'function' ? update(manager.state) : update)};
    };
    runtime.on('RUNTIME_DISPOSED', manager.handleRuntimeDisposed);
    const settle = () => new Promise(resolve => setImmediate(resolve));
    return {runtime, manager, settle};
}

test('closing the project denies an open permission prompt and forgets earlier grants', async () => {
    const {runtime, manager, settle} = fixture();
    const granted = manager.canRecordAudio();
    await settle();
    assert.equal(manager.state.type, SecurityModals.RecordAudio);
    manager.handleAllowed();
    assert.equal(await granted, true);
    assert.equal(await manager.canRecordAudio(), true);

    runtime.emit('RUNTIME_DISPOSED');
    const asked = manager.canRecordAudio();
    await settle();
    assert.equal(manager.state.type, SecurityModals.RecordAudio);
    runtime.emit('RUNTIME_DISPOSED');
    assert.equal(await asked, false);
});

test('closing the project cancels an open extension review with null instead of a boolean', async () => {
    const {runtime, manager, settle} = fixture();
    const render = callback => callback(new Map([['https://example.test/a.js', 'sandboxed']]));
    const {showModal} = await manager.acquireModalLock();
    const review = showModal(render, undefined, null);
    await settle();
    assert.equal(manager.state.type, render);
    runtime.emit('RUNTIME_DISPOSED');
    assert.equal(await review, null);

    // A review that was queued for the closed project is not shown at all.
    const stale = await manager.acquireModalLock();
    runtime.emit('RUNTIME_DISPOSED');
    assert.equal(await stale.showModal(render, undefined, null), null);

    // Choices made for the current project still come back unchanged.
    const current = await manager.acquireModalLock();
    const choices = new Map([['https://example.test/a.js', 'sandboxed']]);
    const answered = current.showModal(callback => callback(choices), undefined, null);
    await settle();
    manager.render();
    assert.equal(await answered, choices);
});

test('unmount cancels queued reviews and releases the VM that installed them after a props change', async () => {
    const {runtime, manager, settle} = fixture();
    runtime.off('RUNTIME_DISPOSED', manager.handleRuntimeDisposed);
    const oldVM = manager.props.vm;
    oldVM.extensionManager = {securityManager: {}};
    let requestModal;
    const released = [];
    const previous = globalThis.__TW_GUI_HOST__;
    globalThis.__TW_GUI_HOST__ = {installSecurityHost: (vm, options) => {
        requestModal = options.requestModal;
        return async () => { released.push(vm); };
    }};
    try {
        manager.componentDidMount();
        const render = () => 'review';
        const shown = requestModal(render, null);
        await settle();
        assert.equal(manager.render(), 'review');
        const queued = requestModal(() => assert.fail('Stale review was shown'), null);
        manager.props = {...manager.props, vm: {runtime: new EventEmitter()}};
        manager.componentWillUnmount();
        assert.equal(await shown, null);
        assert.equal(await queued, null);
        assert.equal(await requestModal(render, null), null);
        assert.equal(runtime.listenerCount('RUNTIME_DISPOSED'), 0);
        assert.deepEqual(released, [oldVM]);
    } finally {
        globalThis.__TW_GUI_HOST__ = previous;
    }
});
