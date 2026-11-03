import assert from 'node:assert/strict';
import {test} from 'node:test';
import afterNativeFieldStartup from '../../../../site/gui-integration/lib/tw-block-editor-startup.js';

test('the initial fixed host waits for the known startup patch instead of taking an early native baseline', async () => {
    let finish;
    const ready = new Promise(resolve => {finish = resolve;});
    const events = [];
    const waiting = afterNativeFieldStartup(ready, fixedInputs => events.push(`attach:${fixedInputs}`), () => false, error => {throw error;});
    await Promise.resolve();assert.deepEqual(events, []);
    events.push('native-patch');finish();await waiting;
    assert.deepEqual(events, ['native-patch', 'attach:true']);
});

test('an unmounted or replaced host is never attached after its pending startup resolves', async () => {
    let finish;
    let disposed = false;
    let attached = 0;
    const waiting = afterNativeFieldStartup(new Promise(resolve => {finish = resolve;}), () => attached++, () => disposed, assert.fail);
    disposed = true;finish();await waiting;assert.equal(attached, 0);
});

test('a failed known startup patch disables fixed hosting while attaching the legacy SOURCE bridge', async () => {
    const error = new Error('known startup patch failed');
    const capabilities = [];
    const reported = [];
    await afterNativeFieldStartup(Promise.reject(error), fixedInputs => capabilities.push(fixedInputs), () => false, value => reported.push(value));
    assert.deepEqual(capabilities, [false]);assert.deepEqual(reported, [error]);
});

test('a late startup failure is ignored after disposal', async () => {
    let fail;
    const waiting = afterNativeFieldStartup(new Promise((_, reject) => {fail = reject;}), assert.fail, () => true, assert.fail);
    fail(new Error('disposed'));await waiting;
});
