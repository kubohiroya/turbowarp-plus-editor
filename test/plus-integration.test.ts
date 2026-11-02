import assert from 'node:assert/strict';
import test from 'node:test';

import {plusIntegration} from '../site/plus-integration.js';

// This step opens the boundary without moving anything across it. The fork's own module returns
// null and every hook falls back to what the GUI does today, so this file must return null too:
// if it ever supplies something by accident, the build stops behaving as it did before and the
// integration E2E can no longer tell us the boundary itself is sound.
test('this distribution supplies no integration yet, so the GUI behaves as before', () => {
    assert.equal(typeof plusIntegration, 'function');
    assert.equal(plusIntegration(), null);
});

test('it is called without arguments and stays independent of call order', () => {
    assert.equal(plusIntegration.length, 0);
    assert.equal(plusIntegration(), plusIntegration());
});
