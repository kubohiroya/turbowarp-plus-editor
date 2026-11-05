require('./helpers.cts');
const {test} = require('node:test');
const assert = require('node:assert/strict');

// What stays here is the library's own behaviour: it makes room for one tag it does not own, and a
// search inside that tag must not drop out of it. What the tab offers, and loading a reviewed
// selection, moved with the tab itself to the distributing host's suite:
// turbowarp-plus-editor's `test/extension-library/plus-library.test.cts`.

const loadLibrary = () => {
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
    return LibraryComponent;
};

test('library search stays in the Plus category and ordinary tag searches retain their existing behavior', () => {
    const LibraryComponent = loadLibrary();
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


test('library layout classes are supplied by the host and custom content is scoped to its active tab', () => {
    const LibraryComponent = loadLibrary();
    const library = new LibraryComponent({id: 'extensionLibrary', title: 'Extensions', data: [], tags: [],
        customTag: 'twplus', customClasses: {library: 'host-library', content: 'host-content', tags: 'host-tags'},
        renderCustomContent: () => null, intl: {formatMessage: message => message.defaultMessage}});
    library.state.canDisplay = true;
    const walk = node => !node || typeof node !== 'object' ? [] :
        [node, ...[node.props?.children].flat(Infinity).flatMap(walk)];
    library.state.selectedTag = 'twplus';
    const custom = library.render();
    assert.equal(custom.props.className, 'host-library');
    assert.ok(walk(custom).some(node => node.props?.className?.includes('host-tags')));
    assert.ok(walk(custom).some(node => node.props?.className?.includes('host-content')));
    library.state.selectedTag = 'all';
    assert.ok(!walk(library.render()).some(node => node.props?.className?.includes('host-content')));
    library.props.customTag = null;
    assert.ok(!walk(library.render()).some(node => node.props?.className?.includes('host-')));
});

test('busy library operations retain the selected tag and query until the operation finishes', () => {
    const LibraryComponent = loadLibrary();
    let closes = 0;
    const library = new LibraryComponent({id: 'extensionLibrary', customTag: 'twplus', busy: true,
        onRequestClose: () => closes++});
    library.setState = update => Object.assign(library.state, update);
    library.state.selectedTag = 'twplus';
    library.state.filterQuery = 'kept';
    library.handleFilterChange({target: {value: 'changed'}});
    library.handleFilterClear();
    library.handleTagClick('all');
    library.handleClose();
    assert.equal(library.state.selectedTag, 'twplus');
    assert.equal(library.state.filterQuery, 'kept');
    assert.equal(closes, 0);
    library.props.busy = false;
    library.handleClose();
    assert.equal(closes, 1);
});
