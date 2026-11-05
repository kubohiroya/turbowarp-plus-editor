const {guiRequire} = require('../extension-library/harness.cjs');
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {JSDOM} = require('jsdom');
const VM = guiRequire('scratch-vm');
const JSZip = guiRequire('@turbowarp/jszip');
const {installProjectToolsHost, renderFileMenu, loadedProjectTitle} = require('../../site/project-tools/index.js');
const {PROJECT_INFO_KEY} = require('../../site/project-tools/properties.js');
const {getExtensionAuthoringHost} = require('../../site/extension-host/authoring.js');
const vmModules = {
    ScratchCommon: guiRequire('scratch-vm/src/extension-support/tw-extension-api-common.js'),
    createTranslate: guiRequire('scratch-vm/src/extension-support/tw-l10n.js'),
    staticFetch: guiRequire('scratch-vm/src/util/tw-static-fetch.js'),
    dispatch: guiRequire('scratch-vm/src/dispatch/central-dispatch.js')
};
const bytes = new TextEncoder().encode('(function(Scratch){Scratch.extensions.register({getInfo(){return {id:"propertiestest",name:"Properties test",blocks:[]}}});})(Scratch);');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const manifest = {schemaVersion: 1, extensions: [{id: 'propertiestest', execution: 'unsandboxed',
    source: {type: 'embedded-file', path: 'extensions/test.js'}, sha256}]};
const project = {targets: [{isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {},
    comments: {}, currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0, tempo: 60,
    videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null}], monitors: [], extensions: [],
    meta: {semver: '3.0.0', vm: '0.2.0'}, turboWarpPlus: manifest,
    [PROJECT_INFO_KEY]: {schemaVersion: 1, title: 'Title from metadata', author: 'Author', description: '', contact: '',
        createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z'}};

test('real VM and extension codec preserve project properties and embedded code through zipped and unzipped saves', async () => {
    const vm = new VM();
    const native = vm.toJSON;
    const dom = new JSDOM('<html lang="en"><head></head><body></body></html>', {url: 'https://example.test'});
    dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    let title = 'Native'; let approvals = 0;
    const host = installProjectToolsHost(vm, {enabled: true, document: dom.window.document, vmModules,
        projectState: {getTitle: () => title, setTitle: value => { title = value; }},
        cache: {async get() {}, async put() {}}, requestApproval: async () => { approvals++; return true; }}, true);
    const zip = new JSZip(); zip.file('project.json', JSON.stringify(project)); zip.file('extensions/test.js', bytes);
    try {
        await vm.loadProject(await zip.generateAsync({type: 'uint8array'}));
        assert.equal(approvals, 1);
        assert.equal(title, 'Title from metadata');
        assert.equal(loadedProjectTitle(vm), title);
        assert.equal(dom.window.document.querySelector('[data-testid="tw-plus-extension-status"]'), null);
        const files = vm.saveProjectSb3DontZip();
        assert.equal(JSON.parse(new TextDecoder().decode(files['project.json']))[PROJECT_INFO_KEY].author, 'Author');
        assert.deepEqual(Array.from(files['extensions/test.js']), Array.from(bytes));
        const saved = await JSZip.loadAsync(await vm.saveProjectSb3('uint8array'));
        const json = JSON.parse(await saved.file('project.json').async('string'));
        assert.equal(json[PROJECT_INFO_KEY].title, title);
        assert.equal(json.turboWarpPlus.extensions[0].sha256, sha256);
        assert.equal(json[PROJECT_INFO_KEY].updatedAt, project[PROJECT_INFO_KEY].updatedAt);
        title = 'Stream title';
        const streamBytes = await vm.saveProjectSb3Stream('uint8array').accumulate();
        const streamZip = await JSZip.loadAsync(streamBytes);
        const streamInfo = JSON.parse(await streamZip.file('project.json').async('string'))[PROJECT_INFO_KEY];
        assert.equal(streamInfo.title, 'Stream title');
        assert.notEqual(streamInfo.updatedAt, project[PROJECT_INFO_KEY].updatedAt);
        const MenuItem = () => null; const MenuSection = () => null;
        const menu = renderFileMenu({vm, MenuItem, MenuSection, locale: 'en', onRequestClose() {}});
        assert.deepEqual(menu.props.children.map(item => item.key), ['properties', 'payloads', 'diagnostics']);
        menu.props.children.find(item => item.key === 'diagnostics').props.onClick();
        assert.match(dom.window.document.querySelector('dialog').textContent, /https:\/\/|extensions\/test.js/);
        assert.match(dom.window.document.querySelector('dialog').textContent, /Execution approved/);
        await host.dispose();
        assert.equal(vm.toJSON, native);
        assert.equal(dom.window.document.querySelector('dialog'), null);
        assert.equal(renderFileMenu({vm}), null);
    } finally { await host.dispose(); vm.runtime.dispose(); dom.window.close(); }
});
test('normal startup removes the corner log and opens failed-load diagnostics with metadata editing disabled', async () => {
    const vm = new VM();
    const dom = new JSDOM('<html><head></head><body></body></html>');
    dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    let title = 'Native title';
    const host = installProjectToolsHost(vm, {enabled: true, document: dom.window.document, vmModules,
        projectState: {getTitle: () => title, setTitle: value => { title = value; }},
        fetchImpl: async () => new Response('Not found', {status: 404}),
        cache: {async get() {}, async put() {}}}, false);
    try {
        assert.equal(dom.window.document.querySelector('[data-testid="tw-plus-extension-status"]'), null);
        const MenuItem = () => null; const MenuSection = () => null;
        const menu = renderFileMenu({vm, MenuItem, MenuSection, onRequestClose() {}});
        assert.deepEqual(menu.props.children.map(item => item.key), ['properties', 'payloads', 'diagnostics']);
        const plain = {...project, turboWarpPlus: undefined, extensions: []};
        await vm.loadProject(JSON.stringify(plain));
        assert.equal(title, 'Native title');
        assert.equal(loadedProjectTitle(vm), undefined);
        assert.equal(JSON.parse(vm.toJSON())[PROJECT_INFO_KEY], undefined);
        assert.equal(dom.window.document.querySelector('aside'), null);
        let prepareFailure;
        await assert.rejects(getExtensionAuthoringHost(vm).configure([{id: 'unavailable',
            url: 'https://example.test/missing.js', execution: 'unsandboxed', distribution: 'embedded-file'}]),
        error => { prepareFailure = error; return true; });
        const preparationNotice = dom.window.document.querySelector('[data-testid="project-diagnostics-snackbar"]');
        assert.match(preparationNotice.textContent, /Could not load the extension/);
        preparationNotice.querySelector('button').click();
        const preparationDialog = dom.window.document.querySelector('[data-testid="project-diagnostics"]');
        assert.ok(preparationDialog.textContent.includes(prepareFailure.message));
        preparationDialog.dispatchEvent(new dom.window.Event('cancel', {cancelable: true}));
        const bad = {...project, turboWarpPlus: {schemaVersion: 1,
            extensions: [{...manifest.extensions[0], sha256: 'b'.repeat(64)}]}};
        const zip = new JSZip(); zip.file('project.json', JSON.stringify(bad)); zip.file('extensions/test.js', bytes);
        await assert.rejects(vm.loadProject(await zip.generateAsync({type: 'uint8array'})));
        const notice = dom.window.document.querySelector('[data-testid="project-diagnostics-snackbar"]');
        assert.ok(notice);
        assert.equal(dom.window.document.querySelector('[data-testid="tw-plus-extension-status"]'), null);
        [...notice.querySelectorAll('button')].find(button => button.textContent === 'View detailed log').click();
        const dialog = dom.window.document.querySelector('[data-testid="project-diagnostics"]');
        assert.match(dialog.textContent, /DIGEST_MISMATCH/);
        assert.equal(dom.window.document.querySelector('aside'), null);
        assert.equal(title, 'Native title');
    } finally { await host.dispose(); vm.runtime.dispose(); dom.window.close(); }
});

for (const metadata of [false, true]) {
    test(`catalog additions complete through diagnostic load monitoring with project properties ${metadata ? 'on' : 'off'}`, async () => {
        const vm = new VM();
        const dom = new JSDOM('<html lang="en"><head></head><body></body></html>');
        const host = installProjectToolsHost(vm, {enabled: true, document: dom.window.document, vmModules,
            fetchImpl: async url => Object.defineProperty(new Response(bytes), 'url', {value: url}),
            requestApproval: async () => true,
            cache: {async get() {}, async put() {}}}, metadata);
        try {
            await vm.loadProject(JSON.stringify({...project, turboWarpPlus: undefined, extensions: []}));
            const controller = getExtensionAuthoringHost(vm);
            await controller.configure([{id: 'propertiestest', url: 'https://example.test/test.js',
                execution: 'unsandboxed', distribution: 'embedded-file'}]);
            assert.equal(vm.extensionManager.isExtensionLoaded('propertiestest'), true);
            assert.equal(dom.window.document.querySelector('[data-testid="project-diagnostics-snackbar"]'), null);
        } finally { await host.dispose(); vm.runtime.dispose(); dom.window.close(); }
    });
}

test('project properties preserve authoring load ownership when an extension is added', async () => {
    const vm = new VM();
    const host = installProjectToolsHost(vm, {enabled: true, vmModules,
        cache: {async get() {}, async put() {}}, requestApproval: async () => true}, true);
    try {
        const input = {...project, turboWarpPlus: undefined};
        await vm.loadProject(JSON.stringify(input));
        const before = JSON.parse(vm.toJSON());
        await host.authoring.add({id: 'propertiestest', execution: 'unsandboxed',
            source: {type: 'embedded-file'}, bytes});
        const after = JSON.parse(vm.toJSON());
        assert.equal(vm.extensionManager.isExtensionLoaded('propertiestest'), true);
        assert.deepEqual(after.targets, before.targets);
        assert.equal(after[PROJECT_INFO_KEY].author, before[PROJECT_INFO_KEY].author);
        assert.equal(after.turboWarpPlus.extensions[0].id, 'propertiestest');
    } finally { await host.dispose(); vm.runtime.dispose(); }
});
