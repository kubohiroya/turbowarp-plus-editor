require('../extension-library/harness.cts');
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const {createProjectDialogs} = require('../../site/project-tools/dialog.ts');
const {createAuthorHistory} = require('../../site/project-tools/history.ts');
const {createProjectDiagnostics} = require('../../site/project-tools/diagnostics.ts');

test('the Editor connects package dialog styles and its shared cancellation classifier', t => {
    const dom = new JSDOM('<button id="origin">File</button>', {url: 'https://example.test/'});
    const document = dom.window.document;
    dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    const properties = {
        snapshot: () => ({title: 'Title', description: '', author: '', contact: '', createdAt: null, updatedAt: null}),
        subscribe: () => () => {},
        loadState: () => ({phase: 'loaded'}),
        apply() { throw new Error('A wiring check must not edit project properties'); }
    };
    const history = createAuthorHistory(dom.window.localStorage);
    const diagnostics = createProjectDiagnostics();
    const dialogs = createProjectDialogs(document, properties, history, diagnostics, {locale: 'en'});
    t.after(() => { dialogs.dispose(); diagnostics.dispose(); dom.window.close(); });

    dialogs.showProperties('en');
    assert.equal(document.querySelector('[data-testid="project-properties"]').className, 'dialog');
    diagnostics.begin('Extension failure');
    diagnostics.record({type: 'error', code: 'LOAD_FAILED', message: 'Extension failed'});
    assert.equal(document.querySelector('[data-testid="project-diagnostics-snackbar"]').className, 'snackbar');

    diagnostics.begin('Project failure');
    diagnostics.record({type: 'project-error', code: 'LOAD_FAILED', message: 'Project failed'});
    const failure = document.querySelector('[data-testid="project-load-failure"]');
    assert.equal(failure.querySelector('h1').textContent, 'The project could not be opened');

    diagnostics.begin('Cancelled project');
    diagnostics.record({type: 'project-error', code: 'CANCELLED', message: 'Declined'});
    assert.equal(document.querySelector('[data-testid="project-load-failure"]').dataset.outcome, 'cancelled');
    assert.equal(document.querySelector('[data-testid="project-diagnostics-snackbar"]'), null);
});
