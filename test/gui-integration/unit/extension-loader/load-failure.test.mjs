/* global AggregateError */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    describeExtensionLoadFailure, isExtensionLoadFailure, markExtensionLoadFailure
} from '../../../../site/gui-integration/lib/tw-plus-extension-load-failure.js';

test('marking keeps the original error and wraps values that are not objects', () => {
    const error = new Error('failed');
    assert.equal(markExtensionLoadFailure(error), error);
    assert.equal(isExtensionLoadFailure(error), true);
    assert.equal(isExtensionLoadFailure(new Error('other')), false);
    assert.equal(isExtensionLoadFailure(null), false);
    const wrapped = markExtensionLoadFailure('worker failed');
    assert.equal(wrapped.message, 'worker failed');
    assert.equal(isExtensionLoadFailure(wrapped), true);
});

test('host formatting preserves error identity when absent or broken', () => {
    const error = markExtensionLoadFailure(new Error('load failed'));
    assert.equal(describeExtensionLoadFailure(error, null), error);
    const integration = {extensionLoadErrors: {describe: () => {throw new Error('formatting failed');}}};
    assert.equal(describeExtensionLoadFailure(error, integration), error);
    assert.equal(isExtensionLoadFailure(error), true);
    const message = new Error('Host explanation');
    assert.equal(describeExtensionLoadFailure(error, {extensionLoadErrors: {describe: () => message}}), message);
});
