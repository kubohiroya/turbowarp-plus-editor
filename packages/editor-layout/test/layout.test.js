import assert from 'node:assert/strict';
import test from 'node:test';
import {fitStage, readRatios, splitAxis, writeRatios} from '../src/index.js';

test('clamps splits as the viewport changes and retains the requested ratio', () => {
    const ratio = 0.75;
    const wide = splitAxis(1608, ratio, 0, 510, 330);
    assert.deepEqual(wide, {available: 1600, minimum: 510, maximum: 1270, first: 1200, second: 400});
    const narrow = splitAxis(1024, ratio, 0, 510, 330);
    assert.equal(narrow.first, 686);
    assert.equal(narrow.second, 330);
    assert.deepEqual(splitAxis(1608, ratio, 0, 510, 330), wide);
});

test('the stage fits both pane boundaries', () => {
    assert.equal(fitStage(500, 246, 4 / 3, 18, 46), 266);
    assert.equal(fitStage(500, 500, 4 / 3, 18, 46), 482);
});

test('saves versioned ratios and resets invalid or unavailable settings', () => {
    const values = new Map();
    const storage = {getItem: key => values.get(key), setItem: (key, value) => values.set(key, value)};
    writeRatios(storage, 'layout', {columns: 0.55, rows: null});
    assert.deepEqual(readRatios(storage, 'layout'), {columns: 0.55, rows: null});
    values.set('layout', '{"version":1,"columns":2,"rows":0.42}');
    assert.deepEqual(readRatios(storage, 'layout'), {columns: null, rows: 0.42});
    values.set('layout', '{');
    assert.deepEqual(readRatios(storage, 'layout'), {columns: null, rows: null});
    assert.doesNotThrow(() => writeRatios({setItem () { throw new Error('denied'); }}, 'layout', {}));
});
