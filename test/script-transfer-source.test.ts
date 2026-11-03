import test from 'node:test';
import assert from 'node:assert/strict';
import {readPins, root, validatePins, verifyScriptTransferDependency} from '../scripts/site/source.ts';

test('the independent transfer package is locked to its repository, revision and version', async () => {
    const pins = await readPins();
    await verifyScriptTransferDependency(root, pins);
    assert.equal(pins.scriptTransferRepository, 'kubohiroya/turbowarp-script-transfer');
    assert.throws(() => validatePins({...pins, scriptTransferRevision: 'main'}), /full script transfer revision/);
    await assert.rejects(verifyScriptTransferDependency(root, {...pins, scriptTransferRevision: 'f'.repeat(40)}),
        /source differs from the pin/);
    await assert.rejects(verifyScriptTransferDependency(root, {...pins, scriptTransferVersion: '9.9.9'}),
        /lock version differs from the pin/);
});
