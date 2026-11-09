import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTransferSession} from '../index.ts';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(ok => {resolve = ok;});
    return {promise, resolve};
}

test('closing the source window collects a claimed drop and refuses new ones', async () => {
    const session = createTransferSession<string>('backpack');
    const script = deferred<string>();
    const first = JSON.stringify(session.offer('script', () => script.promise));
    const second = JSON.stringify(session.offer('script', () => 'late'));
    const applied: string[] = [];
    const apply = (_target: unknown, payload: string) => {
        applied.push(payload);
        return true;
    };
    const claimed = session.receive(first, {session: 'backpack', id: 'sprite'}, apply);
    let retired = false;
    const retiring = session.retire().then(() => {retired = true;});
    assert.equal(await session.receive(second, {session: 'backpack', id: 'sprite'}, apply), 'rejected');
    assert.throws(() => session.offer('script', () => 'new'));
    await Promise.resolve();
    assert.equal(retired, false);

    script.resolve('dropped');
    assert.equal(await claimed, 'applied');
    await retiring;
    assert.deepEqual(applied, ['dropped']);
    await session.settled();
});
