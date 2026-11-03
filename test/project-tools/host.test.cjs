const {guiRequire} = require('../extension-library/harness.cjs');
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {JSDOM} = require('jsdom');
const VM = guiRequire('scratch-vm');
const JSZip = guiRequire('@turbowarp/jszip');
const {installProjectToolsHost, renderFileMenu, loadedProjectTitle} = require('../../site/project-tools/index.js');
const {PROJECT_INFO_KEY} = require('../../site/project-tools/properties.js');
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
        assert.equal(menu.props.children.length, 2);
        menu.props.children[1].props.onClick();
        assert.match(dom.window.document.querySelector('dialog').textContent, /https:\/\/|extensions\/test.js/);
        assert.match(dom.window.document.querySelector('dialog').textContent, /Execution approved/);
        await host.dispose();
        assert.equal(vm.toJSON, native);
        assert.equal(dom.window.document.querySelector('dialog'), null);
        assert.equal(renderFileMenu({vm}), null);
    } finally { await host.dispose(); vm.runtime.dispose(); dom.window.close(); }
});
test('with project tools off the legacy diagnostic panel and serializers remain, even when a project requests tools', async () => {
    const vm = new VM();
    const dom = new JSDOM('<html><head></head><body></body></html>');
    const host = installProjectToolsHost(vm, {enabled: true, document: dom.window.document, vmModules,
        cache: {async get() {}, async put() {}}}, false);
    try {
        assert.ok(dom.window.document.querySelector('[data-testid="tw-plus-extension-status"]'));
        assert.equal(renderFileMenu({vm}), null);
    } finally { await host.dispose(); vm.runtime.dispose(); dom.window.close(); }
});
