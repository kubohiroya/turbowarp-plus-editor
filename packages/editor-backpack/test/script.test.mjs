import assert from 'node:assert/strict';
import {test} from 'node:test';
import {jsonDataUrl, readBackpackScript} from '../script.js';

const itemUrl = blocks => jsonDataUrl + Buffer.from(JSON.stringify(blocks)).toString('base64');
const block = {
    id: 'sample', opcode: 'looks_show', parent: null, next: null, topLevel: true,
    shadow: false, fields: {}, inputs: {}, x: 5, y: 10
};

test('reads a locally stored script without changing the item', async () => {
    const url = itemUrl([block]);
    const script = await readBackpackScript(url);
    assert.deepEqual(script.blocks, [block]);
    assert.deepEqual(script.variables, []);
});

test('rejects external, malformed and unsupported Backpack data', async () => {
    for (const url of [
        'https://example.invalid/script',
        jsonDataUrl + 'bm90LWpzb24=',
        itemUrl([]),
        itemUrl([{...block, opcode: 'customExample_do'}]),
        itemUrl([{...block, comment: 'unavailable'}])
    ]) {
        await assert.rejects(readBackpackScript(url));
    }
    await assert.rejects(readBackpackScript(itemUrl([block]), AbortSignal.abort()), {name: 'AbortError'});
});
