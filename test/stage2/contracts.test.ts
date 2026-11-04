import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createSurface, type SurfaceState} from '../../packages/editor-surfaces/index.ts';
import {createTransferSession, readReference} from '../../packages/editor-transfer/index.ts';

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((ok, fail) => {resolve = ok; reject = fail;});
    return {promise, resolve, reject};
}

test('a surface keeps its dock until ready and disconnect releases once', async () => {
    const connected = deferred<string>();
    const disconnected = new AbortController();
    const states: SurfaceState<string>[] = [];
    let closes = 0;
    const view = createSurface({open: () => ({
        ready: connected.promise, disconnected: disconnected.signal, close() {closes++;}
    })}, state => states.push(state));
    view.undock(undefined);
    view.undock(undefined);
    assert.deepEqual(states, [{kind: 'opening'}]);
    connected.resolve('external');
    await connected.promise;
    disconnected.abort();
    view.dock();
    assert.deepEqual(states, [{kind: 'opening'}, {kind: 'external', target: 'external'},
        {kind: 'docked', reason: 'disconnected'}]);
    assert.equal(closes, 1);
});

test('refusal, failure and a stale readiness result retain the dock', async () => {
    const states: SurfaceState<string>[] = [];
    const first = deferred<string>();
    const second = deferred<string>();
    const attempts = [null, first, second];
    let closes = 0;
    const view = createSurface({open: () => {
        const attempt = attempts.shift();
        return attempt ? {ready: attempt.promise, disconnected: new AbortController().signal,
            close() {closes++;}} : null;
    }}, state => states.push(state));
    view.undock(undefined);
    view.undock(undefined);
    view.dock();
    view.undock(undefined);
    first.resolve('stale');
    second.reject(new Error('init failed'));
    await Promise.allSettled([first.promise, second.promise]);
    assert.deepEqual(states, [{kind: 'docked', reason: 'blocked'}, {kind: 'opening'},
        {kind: 'docked', reason: 'returned'}, {kind: 'opening'}, {kind: 'docked', reason: 'failed'}]);
    assert.equal(closes, 2);
});

test('transfer pins the target before async read and claims a token once', async () => {
    const session = createTransferSession<string>('session');
    const value = deferred<string>();
    const target = {session: 'session', id: 'old'};
    const ref = JSON.stringify(session.offer('code', () => value.promise));
    const seen: string[] = [];
    const apply = (to: Readonly<typeof target>, payload: string) => {
        seen.push(to.id, payload);
        return true;
    };
    const first = session.receive(ref, target, apply);
    target.id = 'new';
    assert.equal(await session.receive(ref, target, apply), 'rejected');
    value.resolve('copy');
    assert.equal(await first, 'applied');
    assert.deepEqual(seen, ['old', 'copy']);
});

test('transfer rejects invalid, wrong-session, expired and no-longer-valid destinations', async () => {
    let clock = 10;
    const session = createTransferSession('session', {now: () => clock, lifetimeMs: 20});
    const reference = session.offer('code', () => 'copy');
    const ref = JSON.stringify(reference);
    assert.equal(readReference('not JSON'), null);
    assert.equal(readReference(JSON.stringify({...reference, version: 2})), null);
    assert.equal(await session.receive(ref, {session: 'another', id: 'a'}, () => true), 'rejected');
    assert.equal(await session.receive(JSON.stringify({...reference, kind: 'different'}),
        {session: 'session', id: 'a'}, () => true), 'rejected');
    clock = 30;
    assert.equal(await session.receive(ref, {session: 'session', id: 'a'}, () => true), 'rejected');
    const next = JSON.stringify(session.offer('code', () => 'copy'));
    assert.equal(await session.receive(next, {session: 'session', id: 'deleted'}, () => false), 'rejected');
    assert.equal(await session.receive(next, {session: 'session', id: 'a'}, () => true), 'rejected');
});

test('close or cancel prevents pending application; reader failure consumes the reference', async () => {
    const session = createTransferSession<string>('session');
    const target = {session: 'session', id: 'a'};
    const apply = () => {throw new Error('must not apply');};
    const value = deferred<string>();
    const ref = session.offer('code', () => value.promise);
    const pending = session.receive(JSON.stringify(ref), target, apply);
    session.cancel(ref.id);
    assert.equal(await pending, 'cancelled');
    value.resolve('copy');
    const failed = JSON.stringify(session.offer('code', () => {throw new Error('read failed');}));
    assert.equal(await session.receive(failed, target, apply), 'failed');
    assert.equal(await session.receive(failed, target, apply), 'rejected');
    const last = deferred<string>();
    const job = session.receive(JSON.stringify(session.offer('code', () => last.promise)), target, apply);
    session.close();
    last.resolve('copy');
    assert.equal(await job, 'cancelled');
});

test('a view mount error returns to the dock and releases the connection', async () => {
    const ready = deferred<string>();
    const states: SurfaceState<string>[] = [];
    let closes = 0;
    const view = createSurface({open: () => ({ready: ready.promise,
        disconnected: new AbortController().signal, close() {closes++;}})}, state => {
        if (state.kind === 'external') throw new Error('mount failed');
        states.push(state);
    });
    view.undock(undefined);
    ready.resolve('external');
    await ready.promise;
    assert.deepEqual(states, [{kind: 'opening'}, {kind: 'docked', reason: 'failed'}]);
    assert.equal(closes, 1);
});
