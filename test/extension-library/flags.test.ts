import assert from 'node:assert/strict';
import {test} from 'node:test';

import {PLUS_EXTENSION_LOADER_ENABLED, PLUS_LIBRARY_ENABLED, readPlusFlags} from '../../site/extension-library/flags.ts';

test('extension loading is on unless this build is explicitly told otherwise', () => {
    for (const search of ['', '?lang=ja', '?twPlusExtensions=1', '?twPlusExtensionLoader=1']) {
        assert.equal(readPlusFlags(search).loader, true, search);
    }
    for (const value of ['0', 'true', 'false', '', '2']) {
        assert.equal(readPlusFlags(`?twPlusExtensionLoader=${value}`).loader, false, value);
    }
});

test('the library tab is offered when asked for, and whenever extension loading is on', () => {
    assert.equal(readPlusFlags('').library, true);
    assert.equal(readPlusFlags('?twPlusExtensionLoader=0').library, false);
    // Asked for on its own: the catalog can be browsed without the loader being on.
    assert.equal(readPlusFlags('?twPlusExtensionLoader=0&twPlusExtensions=1').library, true);
    assert.equal(readPlusFlags('?twPlusExtensionLoader=0&twPlusExtensions=0').library, false);
});

test('a build with no window reads an empty query rather than failing to start', () => {
    assert.equal(PLUS_EXTENSION_LOADER_ENABLED, true);
    assert.equal(PLUS_LIBRARY_ENABLED, true);
});
