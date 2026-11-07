import {hostError} from './test-errors.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {installPlusExtensionHost} from '../../site/extension-host/host.ts';
import {createSecurityReview} from '../../site/extension-host/review.ts';

import {guiRequire, vmModules} from './pinned-host.ts';

const VM = guiRequire('scratch-vm');

/**
 * One screen for a whole project.
 *
 * A project's Plus extensions and its ordinary custom ones are asked about together, before the
 * Loader fetches or registers anything, and the Loader then acts on that answer instead of asking
 * again. These run the review and the Plus host on the pinned VM, installed in the order the GUI
 * installs them, with no document: a row the review did not answer would reach the per-extension
 * dialog, which without a document refuses — so a load that succeeds proves the answer was used.
 */

const bytes = new TextEncoder().encode('Scratch.vm.unifiedExecuted=(Scratch.vm.unifiedExecuted||0)+1;' +
    'Scratch.extensions.register({getInfo(){return {id:"unifiedfixture",blocks:[]}}});');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const pluxURL = 'https://example.org/unified.js';
const legacyURL = 'https://example.org/legacy.js';

const project = (execution = 'unsandboxed', type = 'remote-cacheable') => ({
    targets: [{isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, comments: {},
        blocks: {uses: {opcode: 'legacyfixture_doThing', next: null, parent: null, inputs: {}, fields: {},
            shadow: false, topLevel: true, x: 0, y: 0}},
        currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0, tempo: 60,
        videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null}],
    monitors: [], extensions: ['unifiedfixture', 'legacyfixture'],
    extensionURLs: {legacyfixture: legacyURL},
    meta: {semver: '3.0.0', vm: '0.2.0', agent: 'unified review'},
    turboWarpPlus: {schemaVersion: 1, extensions: [{id: 'unifiedfixture', execution, sha256,
        source: {type, url: pluxURL}}]}
});

const fetchImpl = async url => {
    const response = new Response(bytes);
    Object.defineProperty(response, 'url', {value: url});
    return response;
};

/** The two installations the GUI makes, with the review answering through `answer`. */
function install (answer) {
    const vm = new VM();
    const legacyLoads = [];
    vm.extensionManager.loadExtensionURL = async url => { legacyLoads.push(url); };
    const asked = [];
    const writes = [];
    const review = createSecurityReview({storage: null, identify: async () => null,
        trusted: {listedDigests: new Set(), ready: async () => {}, isTrustedURL: async () => false, isTrustedCode: async () => false}});
    const restore = review.installBatchLoader({vm, defaultURLs: {}, isTrusted: () => false,
        bannerFor: () => undefined,
        showReview: async (entries, initial) => {
            asked.push({entries, initial});
            return answer(entries, initial);
        }});
    const cache = {
        async get () { return null; },
        async put (key) { writes.push(key); }
    };
    const fetched = [];
    const events = [];
    const host = installPlusExtensionHost(vm, {enabled: true, document: null, cache, vmModules,
        fetchImpl: url => {
            fetched.push(url);
            return fetchImpl(url);
        },
        diagnostics: event => events.push(event.type)});
    return {vm, host, restore, asked, writes, legacyLoads, events, fetched,
        async dispose () {
            await host.dispose();
            restore();
            vm.runtime.dispose();
        }};
}

const keyed = (entries, decide) => new Map(entries.map(entry => [entry.key, decide(entry)]));

test('a Plus row and an ordinary custom one are asked about on one screen, and the Loader acts on that answer', async () => {
    const fixture = install(entries => keyed(entries, entry => (entry.source.kind === 'legacy' ?
        {execution: 'deny'} : {execution: 'unsandboxed', loading: 'remote-cacheable'})));
    try {
        await fixture.vm.loadProject(JSON.stringify(project()));
        assert.equal(fixture.asked.length, 1, 'one screen for the whole project');
        const [plus, legacy] = fixture.asked[0].entries;
        assert.deepEqual([plus.key, plus.source.kind, plus.source.url, plus.requestedExecution],
            ['unifiedfixture', 'remote-cacheable', pluxURL, 'unsandboxed']);
        assert.deepEqual([legacy.source.kind, legacy.source.url], ['legacy', legacyURL]);
        assert.equal(fixture.vm.extensionManager.isExtensionLoaded('unifiedfixture'), true);
        assert.equal(fixture.vm.unifiedExecuted, 1);
        assert.deepEqual(fixture.legacyLoads, [], 'the declined custom extension did not load');
        assert.deepEqual(fixture.writes, [sha256], 'the author allowed a copy and the opener kept it');
    } finally {
        await fixture.dispose();
    }
});

test('an opener who declines the copy of a remote-cacheable row loads it without one being kept', async () => {
    const fixture = install(entries => keyed(entries, entry => (entry.source.kind === 'legacy' ?
        {execution: 'deny'} : {execution: 'unsandboxed', loading: 'remote-non-cacheable'})));
    try {
        await fixture.vm.loadProject(JSON.stringify(project()));
        assert.equal(fixture.vm.extensionManager.isExtensionLoaded('unifiedfixture'), true);
        assert.deepEqual(fixture.writes, [], 'nothing was written to the cache');
    } finally {
        await fixture.dispose();
    }
});

test('an explicit refusal stops the whole batch before fetching or starting extensions', async () => {
    const fixture = install(entries => keyed(entries, entry => ({
        execution: entry.source.kind === 'legacy' ? 'unsandboxed' : 'deny',
        loading: 'remote-cacheable'
    })));
    try {
        await assert.rejects(fixture.vm.loadProject(JSON.stringify(project())),
            {code: 'TRUST_DENIED', extensionId: 'unifiedfixture'});
        assert.deepEqual(fixture.fetched, []);
        assert.deepEqual(fixture.legacyLoads, []);
        assert.deepEqual(fixture.writes, []);
        assert.equal(fixture.vm.unifiedExecuted, undefined);
    } finally {
        await fixture.dispose();
    }
});

test('a declined Plus row, or the sandbox chosen for a row its author runs outside it, stops the load before any code runs', async () => {
    for (const decision of [{execution: 'deny', loading: 'remote-cacheable'},
        {execution: 'sandboxed', loading: 'remote-cacheable'}]) {
        const fixture = install(entries => keyed(entries, entry => (entry.source.kind === 'legacy' ?
            {execution: 'deny'} : decision)));
        try {
            await assert.rejects(fixture.vm.loadProject(JSON.stringify(project())), {code: 'TRUST_DENIED'},
                decision.execution);
            assert.equal(fixture.vm.unifiedExecuted, undefined);
            assert.equal(fixture.vm.extensionManager.isExtensionLoaded('unifiedfixture'), false);
        } finally {
            await fixture.dispose();
        }
    }
});

test('a refusal on this load\'s review outweighs an approval the session remembers from an earlier one', async () => {
    let decision = {execution: 'unsandboxed', loading: 'remote-cacheable'};
    const fixture = install(entries => keyed(entries, entry => (entry.source.kind === 'legacy' ?
        {execution: 'deny'} : decision)));
    try {
        await fixture.vm.loadProject(JSON.stringify(project()));
        assert.equal(fixture.vm.unifiedExecuted, 1);
        decision = {execution: 'sandboxed', loading: 'remote-cacheable'};
        await assert.rejects(fixture.vm.loadProject(JSON.stringify(project())), {code: 'TRUST_DENIED'});
        assert.equal(fixture.vm.unifiedExecuted, 1, 'the second load did not run it again');
    } finally {
        await fixture.dispose();
    }
});

test('choosing no sandbox for a row its author runs in the sandbox still runs it in the sandbox', async () => {
    const fixture = install(entries => keyed(entries, entry => (entry.source.kind === 'legacy' ?
        {execution: 'deny'} : {execution: 'unsandboxed', loading: 'remote-cacheable'})));
    try {
        // The pinned VM has no sandboxed runner here, so registration fails — after approval, which
        // is what this checks: the answer was within what the author asked, so it was not refused.
        await assert.rejects(fixture.vm.loadProject(JSON.stringify(project('sandboxed'))),
            error => hostError(error).code !== 'TRUST_DENIED');
        assert.ok(fixture.events.includes('authorized'), fixture.events.join(' '));
    } finally {
        await fixture.dispose();
    }
});

test('saying no on the screen cancels the whole load before the Loader fetches anything', async () => {
    let fetched = 0;
    const vm = new VM();
    const review = createSecurityReview({storage: null, identify: async () => null,
        trusted: {listedDigests: new Set(), ready: async () => {}, isTrustedURL: async () => false, isTrustedCode: async () => false}});
    const restore = review.installBatchLoader({vm, defaultURLs: {}, isTrusted: () => false,
        bannerFor: () => undefined, showReview: async () => null});
    const host = installPlusExtensionHost(vm, {enabled: true, document: null, vmModules,
        fetchImpl: async url => { fetched++; return fetchImpl(url); }});
    try {
        await assert.rejects(vm.loadProject(JSON.stringify(project())), error => review.isCancelled(error));
        assert.equal(fetched, 0);
        assert.equal(vm.unifiedExecuted, undefined);
    } finally {
        await host.dispose();
        restore();
        vm.runtime.dispose();
    }
});
