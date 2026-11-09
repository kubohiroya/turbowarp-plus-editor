import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createPendingEdits, createSurface, createSurfaceRecovery, recordSurface, type SurfaceState} from '../index.ts';

function memoryStorage(initial?: string) {
    const values = new Map<string, string>(initial === undefined ? [] : [['tw-plus:external-surfaces', initial]]);
    return {
        values,
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {values.set(key, value);}
    };
}

function manualTimers() {
    const queue = new Map<number, () => void>();
    let next = 0;
    return {
        schedule: (run: () => void) => {queue.set(++next, run); return next;},
        cancel: (handle: unknown) => {queue.delete(handle as number);},
        runAll() {
            const runs = [...queue.values()];
            queue.clear();
            for (const run of runs) run();
        }
    };
}

const stored = (storage: ReturnType<typeof memoryStorage>) =>
    JSON.parse(storage.values.get('tw-plus:external-surfaces') ?? 'null')?.ids;

function externalSurface(recovery: ReturnType<typeof createSurfaceRecovery>, id: string) {
    let disconnected = new AbortController();
    const states: SurfaceState<string>[] = [];
    const surface = createSurface({open: () => {
        disconnected = new AbortController();
        return {ready: Promise.resolve('window'), disconnected: disconnected.signal, close() {}};
    }}, state => {
        states.push(state);
        recordSurface(recovery, id, state, () => true);
    });
    return {surface, states, disconnect: (cause?: string) => disconnected.abort(cause)};
}

test('a window open when the editor closes is offered again after restart, one panel at a time', async () => {
    const storage = memoryStorage();
    const first = createSurfaceRecovery(storage);
    const stage = externalSurface(first, 'stage');
    const list = externalSurface(first, 'sprite-list');
    stage.surface.undock(undefined);
    list.surface.undock(undefined);
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(stored(storage), ['stage', 'sprite-list']);

    // The editor page goes away: hosts report the parent closing, not the user closing the windows.
    stage.disconnect('parent-closed');
    list.disconnect('parent-closed');
    assert.deepEqual(stage.states.at(-1), {kind: 'docked', reason: 'disconnected', cause: 'parent-closed'});
    assert.deepEqual(stored(storage), ['stage', 'sprite-list']);

    const restarted = createSurfaceRecovery(storage);
    assert.deepEqual(restarted.lost(), ['stage', 'sprite-list']);
    let notified = 0;
    restarted.subscribe(() => notified++);
    const reopened = externalSurface(restarted, 'stage');
    reopened.surface.undock(undefined);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(restarted.isLost('stage'), false);
    assert.equal(restarted.isLost('sprite-list'), true);
    assert.ok(notified > 0);

    // Returning the window by hand forgets it; an unopened panel stays offered until dismissed.
    reopened.surface.dock();
    assert.deepEqual(stored(storage), ['sprite-list']);
    restarted.dismiss('sprite-list');
    assert.deepEqual(stored(storage), []);
    assert.deepEqual(createSurfaceRecovery(storage).lost(), []);
});

test('a window the user closes is forgotten unless the editor closes within the grace period', () => {
    const storage = memoryStorage();
    const timers = manualTimers();
    const recovery = createSurfaceRecovery(storage, timers);
    recovery.opened('stage');
    recovery.opened('backpack');
    recovery.closed('stage', 'child-closed');
    assert.deepEqual(stored(storage), ['stage', 'backpack']);
    timers.runAll();
    assert.deepEqual(stored(storage), ['backpack']);

    // Quitting can close the child first. The parent closing right after keeps both windows.
    recovery.opened('stage');
    recovery.closed('stage', 'child-closed');
    recovery.closed('backpack', 'parent-closed');
    timers.runAll();
    assert.deepEqual(stored(storage), ['backpack', 'stage']);
});

test('a returned, failed or navigated window is forgotten at once', () => {
    const storage = memoryStorage();
    const recovery = createSurfaceRecovery(storage);
    for (const cause of [undefined, 'navigated', 'peer-disconnected'] as const) {
        recovery.opened('stage');
        recovery.closed('stage', cause);
        assert.deepEqual(stored(storage), []);
    }
});

test('damaged, foreign or unavailable storage only loses the reopen hints', () => {
    for (const raw of ['{', '{"version":2,"ids":["stage"]}', '{"version":1,"ids":"stage"}',
        '{"version":1,"ids":["../stage", 3, "stage"]}']) {
        const lost = createSurfaceRecovery(memoryStorage(raw)).lost();
        assert.deepEqual(lost, raw.includes('"../stage"') ? ['stage'] : []);
    }
    const throwing = {getItem() {throw new Error('denied');}, setItem() {throw new Error('full');}};
    const recovery = createSurfaceRecovery(throwing);
    recovery.opened('stage');
    assert.equal(recovery.isLost('stage'), false);
    assert.deepEqual(createSurfaceRecovery(null).lost(), []);
});

test('collecting pending edits waits for every view and keeps a failed collector for a retry', async () => {
    const pending = createPendingEdits();
    const collected: string[] = [];
    let ready = false;
    const unregisterSync = pending.register(() => {collected.push('sync');});
    pending.register(async () => {
        await Promise.resolve();
        if (!ready) throw new Error('child busy');
        collected.push('async');
    });
    await assert.rejects(pending.flush(), (error: AggregateError) => error.errors.length === 1 &&
        error.errors[0].message === 'child busy');
    assert.equal(pending.size, 2);
    ready = true;
    await pending.flush();
    assert.deepEqual(collected, ['sync', 'sync', 'async']);

    unregisterSync();
    pending.register(() => new Promise(() => {}));
    await assert.rejects(pending.flush({timeoutMs: 5}), (error: AggregateError) =>
        /not collected in time/.test(error.errors[0].message));
});
