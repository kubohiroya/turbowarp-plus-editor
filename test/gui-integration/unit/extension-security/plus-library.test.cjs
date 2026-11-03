require('./helpers.cjs');
const {test} = require('node:test');
const assert = require('node:assert/strict');

// What stays here is the library's own behaviour: it makes room for one tag it does not own, and a
// search inside that tag must not drop out of it. What the tab offers, and loading a reviewed
// selection, moved with the tab itself to the distributing host's suite:
// turbowarp-plus-editor's `test/extension-library/plus-library.test.cjs`.

test('library search stays in the Plus category and ordinary tag searches retain their existing behavior', () => {
    const Module = require('node:module');
    const originalLoad = Module._load;
    let LibraryComponent;
    Module._load = function(request, ...args) {
        if (request.startsWith('!')) return 'mock-asset.svg';
        return originalLoad.call(this, request, ...args);
    };
    try {
        ({LibraryComponent} = require('../../../src/components/library/library.jsx'));
    } finally {
        Module._load = originalLoad;
    }
    const library = new LibraryComponent({id: 'extensionLibrary', customTag: 'twplus'});
    library.setState = update => Object.assign(library.state, update);
    library.state.selectedTag = 'twplus';
    library.handleFilterChange({target: {value: 'text'}});
    assert.equal(library.state.selectedTag, 'twplus');
    assert.equal(library.state.filterQuery, 'text');
    library.state.selectedTag = 'scratch';
    library.handleFilterChange({target: {value: 'music'}});
    assert.equal(library.state.selectedTag, 'all');
    assert.equal(library.state.filterQuery, 'music');
});
