import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeEmbeddedYamlRootShape} from '../site/yaml-editor/root-shape-bootstrap.ts';

function createBlocks() {
    const calls = [];
    const shape: {previous?: boolean; next?: boolean} = {};
    const blocks = {Extensions: {register(name, callback) {
        calls.push(name);
        callback.call({setPreviousStatement(value) { shape.previous = value; },
            setNextStatement(value) { shape.next = value; }});
    }}};
    return {blocks, calls, shape};
}

test('published ScratchBlocks initializes before security approval without creating Scratch', async () => {
    const {blocks, calls, shape} = createBlocks();
    const win = {ScratchBlocks: blocks, setTimeout() { throw new Error('No approval wait is needed.'); }};
    await initializeEmbeddedYamlRootShape({window: win, timeoutMs: 0});
    await initializeEmbeddedYamlRootShape({window: win, timeoutMs: 0});
    assert.equal(calls.length, 1);
    assert.deepEqual(shape, {previous: false, next: false});
    assert.equal(Object.hasOwn(win, 'Scratch'), false);
});

test('a published block instance arriving while approval is pending ends the bounded wait', async () => {
    const {blocks, calls} = createBlocks();
    let polls = 0;
    const win: {ScratchBlocks?: unknown; setTimeout(callback: () => void): void} = {setTimeout(callback) { polls++; win.ScratchBlocks = blocks; queueMicrotask(callback); }};
    await initializeEmbeddedYamlRootShape({window: win, timeoutMs: 1000});
    assert.equal(polls, 1);
    assert.equal(calls.length, 1);
    assert.equal(Object.hasOwn(win, 'Scratch'), false);
});

test('the existing GUI eager block API remains available when no block instance is published', async () => {
    const {blocks, calls} = createBlocks();
    let eager = 0;
    const win = {Scratch: {gui: {async getBlocklyEagerly() { eager++; return blocks; },
        async getBlockly() { throw new Error('The eager instance should be used.'); }}}};
    await initializeEmbeddedYamlRootShape({window: win, timeoutMs: 0});
    assert.equal(eager, 1);
    assert.equal(calls.length, 1);
});

test('a partial global block value falls back to the GUI lazy API when eager returns null', async () => {
    const {blocks, calls} = createBlocks();
    let lazy = 0;
    const win = {ScratchBlocks: {}, Scratch: {gui: {async getBlocklyEagerly() { return null; },
        async getBlockly() { lazy++; return blocks; }}}};
    await initializeEmbeddedYamlRootShape({window: win, timeoutMs: 0});
    assert.equal(lazy, 1);
    assert.equal(calls.length, 1);
});

test('missing block APIs still reject at the deadline without polling indefinitely or creating globals', async () => {
    let polls = 0;
    const win = {setTimeout() { polls++; throw new Error('The deadline has already expired.'); }};
    await assert.rejects(initializeEmbeddedYamlRootShape({window: win, timeoutMs: 0}),
        /The Editor block API did not become available/u);
    assert.equal(polls, 0);
    assert.equal(Object.hasOwn(win, 'Scratch'), false);
    assert.equal(Object.hasOwn(win, 'ScratchBlocks'), false);
});
