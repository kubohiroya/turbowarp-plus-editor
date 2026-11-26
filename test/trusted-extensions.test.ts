import assert from 'node:assert/strict';
import test from 'node:test';
import {plusTrustedExtensions} from '../site/trusted-extensions.ts';

test('the integration answers the socket with both trust decisions', () => {
    // Only the shape, and only these two: the GUI asks what this distribution trusts and which
    // digests a built HTML carries. Calling either here would reach the published catalog, so the
    // behaviour behind them is tested in Loader through supplied catalogs.
    assert.deepEqual(Object.keys(plusTrustedExtensions).sort(), ['catalog', 'listDigests']);
    assert.equal(typeof plusTrustedExtensions.catalog.isTrustedURL, 'function');
    assert.equal(typeof plusTrustedExtensions.catalog.isTrustedCode, 'function');
    assert.equal(typeof plusTrustedExtensions.listDigests, 'function');
});
