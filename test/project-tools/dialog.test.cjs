require('../extension-library/harness.cjs');
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const {createProjectDialogs} = require('../../site/project-tools/dialog.js');
const {createAuthorHistory} = require('../../site/project-tools/history.js');

const fixture = () => {
    const dom = new JSDOM('<button id="origin">File</button>', {url: 'https://example.test/'});
    const document = dom.window.document;
    dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    const changes = [];
    let listener;
    let phase = 'loaded';
    const properties = {snapshot: () => ({title: 'Title', description: '<img onerror=bad> https://example.test/',
        author: '', contact: 'mailto:a@example.test', createdAt: null, updatedAt: null}),
        subscribe(fn) { listener = fn; return () => { listener = null; }; }, loadState: () => ({phase}),
        apply(value) { changes.push(value); }};
    const history = createAuthorHistory(dom.window.localStorage);
    history.remember('Recent author', 'https://contact.test');
    document.querySelector('button').focus();
    const dialogs = createProjectDialogs(document, properties, history);
    return {dom, document, dialogs, history, changes, load() { phase = 'loading'; listener(); }};
};
test('properties has editable recent combobox values, plain-text link preview and cancel without storing', () => {
    const f = fixture(); f.dialogs.showProperties('en');
    const dialog = f.document.querySelector('dialog');
    assert.equal(dialog.querySelector('img'), null);
    assert.equal(dialog.querySelector('a[href="https://example.test/"]').rel, 'noopener noreferrer');
    assert.equal(dialog.querySelector('a[href="mailto:a@example.test"]').target, '');
    const author = dialog.querySelector('[name="author"]');
    assert.ok(author.hasAttribute('list'));
    assert.equal(f.document.getElementById(author.getAttribute('list')).children[0].value, 'Recent author');
    author.value = 'Cancelled';
    dialog.querySelector('button[type="button"]').click();
    assert.equal(f.document.querySelector('dialog'), null);
    assert.equal(f.document.activeElement.id, 'origin');
    assert.equal(f.history.snapshot().names.includes('Cancelled'), false);
    assert.deepEqual(f.changes, []);
    f.dialogs.dispose();
});
test('apply submits new values and remembers them; project loading discards a stale form', () => {
    const f = fixture(); f.dialogs.showProperties('ja');
    const dialog = f.document.querySelector('dialog');
    dialog.querySelector('[name="author"]').value = 'New author';
    dialog.querySelector('form').dispatchEvent(new f.dom.window.Event('submit', {cancelable: true}));
    assert.equal(f.changes[0].author, 'New author');
    assert.equal(f.history.snapshot().names[0], 'New author');
    assert.equal(f.document.querySelector('dialog'), null);
    f.dialogs.showProperties('en'); f.load();
    assert.equal(f.document.querySelector('dialog'), null);
    f.dialogs.dispose();
});
