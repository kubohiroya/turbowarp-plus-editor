import assert from 'node:assert/strict';
import test from 'node:test';
import {JSDOM} from 'jsdom';
import {createTargetSwitchFeedback, withWaitCursor, withoutWaitCursor} from '../packages/editor-ui/src/busy-cursor.ts';

const waiting = (document: Document) => document.querySelectorAll('style[data-tw-plus-wait-cursor]').length;
const deferred = () => {
    let resolve: () => void;
    const promise = new Promise<void>(done => { resolve = done; });
    return {promise, resolve};
};

test('overlapping operations keep the wait cursor until the final operation settles', async () => {
    const dom = new JSDOM('');
    const {document} = dom.window;
    try {
        const {promise, resolve} = deferred();
        const first = withWaitCursor([document, document], () => promise);
        const second = withWaitCursor([document], () => { throw new Error('failed'); });
        assert.equal(waiting(document), 1);
        await assert.rejects(second, /failed/);
        assert.equal(waiting(document), 1);
        resolve();
        await first;
        assert.equal(waiting(document), 0);
    } finally {
        dom.window.close();
    }
});

test('large target switches yield for a paint and small target switches stay synchronous', async () => {
    const dom = new JSDOM('', {pretendToBeVisual: true});
    const {document} = dom.window;
    const sprite = {id: 'sprite'};
    const stage = {id: 'stage', blocks: {_blocks: Object.fromEntries(Array.from({length: 235}, (_, index) => [index, {}]))}};
    const vm = {editingTarget: sprite, runtime: {
        getTargetById: (id: string) => id === sprite.id ? sprite : stage,
        getTargetForStage: () => stage
    }};
    const selection = createTargetSwitchFeedback(vm, document);
    try {
        const {promise, resolve} = deferred();
        const states: number[] = [];
        const released = new Promise<void>(resolve => {
            const observer = new dom.window.MutationObserver(() => {
                if (waiting(document)) return;
                observer.disconnect();
                resolve();
            });
            observer.observe(document.head, {childList: true});
        });
        selection.select(undefined, () => {
            states.push(waiting(document));
            vm.editingTarget = stage;
            resolve();
        });
        assert.equal(waiting(document), 1);
        assert.equal(vm.editingTarget, sprite);
        await promise;
        assert.equal(waiting(document), 1);
        await released;
        selection.select(sprite.id, () => states.push(waiting(document)));
        assert.deepEqual(states, [1, 0]);
    } finally {
        dom.window.close();
    }
});

test('input prompts suspend the wait cursor and restore it before processing the answer', async () => {
    const dom = new JSDOM('');
    const {document} = dom.window;
    try {
        await withWaitCursor([document], async () => {
            const style = document.querySelector<HTMLStyleElement>('style[data-tw-plus-wait-cursor]');
            assert.equal(style.media, '');
            const answer = await withoutWaitCursor(document, () => {
                assert.equal(style.media, 'not all');
                return 'approved';
            });
            assert.equal(answer, 'approved');
            assert.equal(style.media, '');
        });
        assert.equal(waiting(document), 0);
    } finally {
        dom.window.close();
    }
});

test('a more recent selection supersedes a queued target switch', async () => {
    const dom = new JSDOM('');
    const {document} = dom.window;
    const sprite = {id: 'sprite'};
    const stage = {id: 'stage', blocks: {_blocks: Object.fromEntries(Array.from({length: 235}, (_, index) => [index, {}]))}};
    const vm = {editingTarget: sprite, runtime: {
        getTargetById: (id: string) => id === sprite.id ? sprite : stage,
        getTargetForStage: () => stage
    }};
    const selection = createTargetSwitchFeedback(vm, document);
    try {
        const calls: string[] = [];
        selection.select(undefined, () => calls.push('stage'));
        selection.select(sprite.id, () => calls.push('sprite'));
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(calls, ['sprite']);
        assert.equal(waiting(document), 0);
    } finally {
        dom.window.close();
    }
});
