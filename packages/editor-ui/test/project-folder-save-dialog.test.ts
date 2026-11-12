import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import {test, type TestContext} from 'node:test';
import {JSDOM} from 'jsdom';
import {renderSaveAsForm, type GitHubCreationAccount, type ProjectFileStorage, type SaveAsFormOptions,
    type SaveAsRequest} from '../src/project-file-dialogs.ts';

const account: GitHubCreationAccount = {
    account: {login: 'octocat'},
    owners: [
        {login: 'octocat', type: 'User', canCreate: {private: true, public: true}},
        {login: 'Team', type: 'Organization', canCreate: {private: false, public: true}}
    ]
};

function fixture(t: TestContext, options: SaveAsFormOptions = {}, hasPicker = true) {
    const dom = new JSDOM('<body></body>');
    t.after(() => dom.window.close());
    if (hasPicker) Object.assign(dom.window, {showDirectoryPicker() {throw new Error('Only the host opens the picker');}});
    const {document} = dom.window;
    const requests: SaveAsRequest[] = [];
    const storage: ProjectFileStorage = {
        filename: 'Project.sb3', canSave: true,
        async write() {throw new Error('unused');}, async download() {throw new Error('unused');},
        finish() {throw new Error('unused');}, fail() {throw new Error('unused');}
    };
    const form = renderSaveAsForm(document, 'en', storage, async (request, open) => {
        assert.ok(open());
        requests.push(request);
        return true;
    }, () => form.remove(), options);
    document.body.append(form);
    const field = <T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(name: string) =>
        form.querySelector<T>(`[name="${name}"]`);
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const change = (element: HTMLElement) => element.dispatchEvent(new dom.window.Event('change'));
    const chooseFormat = (value: string) => {
        const format = field<HTMLSelectElement>('format');
        format.value = value;
        change(format);
    };
    const enableGit = () => {
        chooseFormat('folder');
        const git = field<HTMLInputElement>('git');
        git.checked = true;
        change(git);
    };
    const next = async () => {submit.click(); await setImmediate();};
    return {form, requests, field, chooseFormat, enableGit, next, submit,
        message: () => form.querySelector('[role="alert"]').textContent};
}

test('folder format requires both the host and picker, and the current SB3 form keeps its save request', async t => {
    const withoutPicker = fixture(t, {folder: {}}, false);
    const withoutHost = fixture(t);
    for (const dialog of [withoutPicker, withoutHost]) {
        assert.deepEqual([...dialog.field<HTMLSelectElement>('format').options].map(option => option.value), ['current', 'embedded']);
        assert.equal(dialog.field('git'), null);
    }
    await withoutPicker.next();
    assert.deepEqual(withoutPicker.requests, [{name: 'Project', format: 'current'}]);
    withoutHost.chooseFormat('embedded');
    withoutHost.field('title').value = ' Renamed.sb3 ';
    await withoutHost.next();
    assert.deepEqual(withoutHost.requests, [{name: 'Renamed', format: 'embedded'}]);
});

test('saving a local folder has no authentication step', async t => {
    let auth = 0;
    const dialog = fixture(t, {folder: {github: {async connectForCreation() {auth++; return account;}}}});
    assert.equal(dialog.field('git').closest('div').hidden, true);
    dialog.chooseFormat('folder');
    assert.equal(dialog.field('git').closest('div').hidden, false);
    assert.equal(dialog.field<HTMLInputElement>('git').checked, false);
    assert.equal(dialog.field('github-name').closest('fieldset').disabled, true);
    await dialog.next();
    assert.deepEqual(dialog.requests, [{name: 'Project', format: 'folder'}]);
    assert.equal(auth, 0);
});

test('keeps the draft across GitHub sign-in and creates only on confirmed submit', async t => {
    let attempts = 0;
    const dialog = fixture(t, {folder: {github: {
        async connectForCreation() {return attempts++ ? account : null;}, licenses: [{id: 'MIT', label: 'MIT'}]
    }}});
    dialog.enableGit();
    dialog.field('title').value = 'My Project';
    dialog.field('github-url').value = 'https://github.com/OCTOCAT/my-project.git';
    dialog.field('github-description').value = 'A demo';
    dialog.field('github-topics').value = 'scratch, app-2, scratch';
    dialog.field('github-license').value = 'MIT';
    await dialog.next();
    assert.equal(dialog.submit.textContent, 'Connect to GitHub…');
    assert.equal(dialog.field('github-name').value, 'my-project');
    assert.equal(dialog.field('github-description').value, 'A demo');
    await dialog.next();
    assert.equal(dialog.submit.textContent, 'Review Repository');
    assert.match(dialog.form.textContent, /GitHub account octocat/);
    assert.equal(dialog.field('github-visibility').value, 'private');
    await dialog.next();
    assert.equal(dialog.submit.textContent, 'Create Repository');
    assert.match(dialog.form.querySelector('dl').textContent, /https:\/\/github\.com\/octocat\/my-project/);
    assert.match(dialog.form.querySelector('dl').textContent, /Private/);
    assert.deepEqual(dialog.requests, []);
    await dialog.next();
    assert.deepEqual(dialog.requests, [{name: 'My Project', format: 'folder', git: {
        account: 'octocat', owner: 'octocat', name: 'my-project', title: 'My Project', description: 'A demo',
        topics: ['scratch', 'app-2'], license: 'MIT', visibility: 'private'
    }}]);
});

test('rejects unsafe URLs, unavailable owners, and invalid topics before confirmation', async t => {
    let auth = 0;
    const dialog = fixture(t, {folder: {github: {async connectForCreation() {auth++; return account;}}}});
    dialog.enableGit();
    for (const value of ['https://github.com@evil.test/octocat/app', 'https://github.com/octocat/../app',
        'https://github.com/octocat/app/issues', 'http://github.com/octocat/app', 'https://github.com/octocat/app?new=1']) {
        dialog.field('github-url').value = value;
        await dialog.next();
        assert.match(dialog.message(), /Enter a URL/);
    }
    assert.equal(auth, 0);
    dialog.field('github-url').value = 'https://github.com/elsewhere/app';
    await dialog.next();
    assert.equal(auth, 1);
    await dialog.next();
    assert.match(dialog.message(), /Choose an owner/);
    dialog.field('github-url').value = 'https://github.com/Team/app/';
    await dialog.next();
    assert.match(dialog.message(), /visibility is unavailable/);
    dialog.field('github-visibility').value = 'public';
    for (const value of ['Uppercase', 'a'.repeat(51), Array.from({length: 21}, (_, i) => `topic-${i}`).join(',')]) {
        dialog.field('github-topics').value = value;
        await dialog.next();
        assert.match(dialog.message(), /at most 20 topics/);
    }
    assert.equal(dialog.submit.textContent, 'Review Repository');
    assert.deepEqual(dialog.requests, []);
    dialog.field('github-topics').value = 'project';
    await dialog.next();
    assert.match(dialog.form.querySelector('dl').textContent, /https:\/\/github\.com\/Team\/app/);
    assert.match(dialog.form.querySelector('dl').textContent, /Public/);
});
