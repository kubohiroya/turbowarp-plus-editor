import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {installPlusExtensionHost} from '../../site/extension-host/host.js';

import {guiRequire, vmModules} from './pinned-host.mjs';

const require = guiRequire;
const VM = require('scratch-vm');
const {JSDOM} = require('jsdom');

const bytes = new TextEncoder().encode('Scratch.vm.reviewExecuted=true;Scratch.extensions.register({getInfo(){return {id:"reviewfixture",blocks:[]}}});');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const project = {
    targets: [{isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {},
        comments: {}, currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0, tempo: 60,
        videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null}],
    monitors: [], extensions: ['reviewfixture'],
    extensionURLs: {reviewfixture: 'data:text/javascript,Scratch.vm.legacyBypass=true'},
    meta: {semver: '3.0.0', vm: '0.2.0', agent: 'independent security review'},
    turboWarpPlus: {schemaVersion: 1, extensions: [{id: 'reviewfixture', execution: 'unsandboxed', sha256,
        source: {type: 'remote', url: 'https://example.org/review.js'}}]},
    trusted: true,
    approval: {allowed: true, scope: 'digest', sha256},
    turboWarpPlusLock: {approved: true, sha256}
};

const fetchImpl = async url => {
    const response = new Response(bytes);
    Object.defineProperty(response, 'url', {value: url});
    return response;
};

test('project-supplied trust and legacy Data URL cannot bypass missing host approval UI', async () => {
    const vm = new VM();
    let legacyLoads = 0;
    vm.extensionManager.loadExtensionURL = async () => { legacyLoads++; };
    const host = installPlusExtensionHost(vm, {enabled: true, document: null, fetchImpl, vmModules});
    try {
        await assert.rejects(vm.loadProject(JSON.stringify(project)), {code: 'TRUST_DENIED'});
        assert.equal(vm.reviewExecuted, undefined);
        assert.equal(vm.legacyBypass, undefined);
        assert.equal(legacyLoads, 0);
        assert.equal(vm.extensionManager.isExtensionLoaded('reviewfixture'), false);
    } finally {
        await host.dispose();
        vm.runtime.dispose();
    }
});

test('closing a host during real VM consent cannot leave approved code or a legacy fallback behind', async () => {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
    dom.window.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
    const vm = new VM();
    let legacyLoads = 0;
    vm.extensionManager.loadExtensionURL = async () => { legacyLoads++; };
    const host = installPlusExtensionHost(vm, {enabled: true, document: dom.window.document, fetchImpl, vmModules});
    let observed;
    try {
        const loading = vm.loadProject(JSON.stringify(project));
        observed = loading.catch(error => error);
        let dialog;
        for (let i = 0; i < 100 && !dialog; i++) {
            await new Promise(resolve => setTimeout(resolve, 5));
            dialog = dom.window.document.querySelector('[data-testid="tw-plus-permission"]');
        }
        assert.ok(dialog);
        assert.equal(vm.reviewExecuted, undefined);
        await host.dispose();
        const failure = await observed;
        assert.ok(['TRUST_DENIED', 'CANCELLED', 'LOADER_DISPOSED'].includes(failure.code));
        assert.equal(vm.reviewExecuted, undefined);
        assert.equal(vm.legacyBypass, undefined);
        assert.equal(legacyLoads, 0);
        assert.equal(vm.extensionManager.isExtensionLoaded('reviewfixture'), false);
        assert.equal(dom.window.document.querySelector('dialog'), null);
    } finally {
        await host.dispose();
        if (observed) await observed;
        vm.runtime.dispose();
        dom.window.close();
    }
});
