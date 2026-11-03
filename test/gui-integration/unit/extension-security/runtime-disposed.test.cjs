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
    const {showModal} = await manager.acquireModalLock();
    const review = showModal(SecurityModals.LoadExtensions, {entries: [], initialChoices: new Map()});
    await settle();
    assert.equal(manager.state.type, SecurityModals.LoadExtensions);
    runtime.emit('RUNTIME_DISPOSED');
    assert.equal(await review, null);

    // A review that was queued for the closed project is not shown at all.
    const stale = await manager.acquireModalLock();
    runtime.emit('RUNTIME_DISPOSED');
    assert.equal(await stale.showModal(SecurityModals.LoadExtensions, {entries: []}), null);

    // Choices made for the current project still come back unchanged.
    const current = await manager.acquireModalLock();
    const choices = new Map([['https://example.test/a.js', 'sandboxed']]);
    const answered = current.showModal(SecurityModals.LoadExtensions, {entries: []});
    await settle();
    manager.handleBatchComplete(choices);
    assert.equal(await answered, choices);
});
