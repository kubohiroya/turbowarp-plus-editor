/**
 * What the authoring path actually fails with, and what the Loader says about asking again.
 *
 * The retry affordance (kubohiroya/turbowarp-plus-editor#88) is only allowed to ask one question —
 * `isWorthAskingAgain(error)` — because the first attempt at it wrote a table of 29 error codes
 * into the host and had to be removed (kubohiroya/scratch-gui#108). This pins the answer for every
 * failure the library's own path can produce, so the screen that grows a button can rely on the
 * judgement instead of reading codes.
 *
 * `LOAD_FAILED` appears twice below with opposite answers: an offline fetch and a registration that
 * declared the wrong ID both carry it, and only the first is worth asking about. That is the case
 * that makes branching on the code wrong.
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import Zip from '@turbowarp/jszip';
import {isWorthAskingAgain} from '@kubohiroya/turbowarp-extension-loader';
import {installEditorExtensionHost} from '../../site/extension-host/editor-host.js';

import {guiRequire, vmModules} from './pinned-host.mjs';

const VM = guiRequire('scratch-vm');
const Storage = guiRequire('@turbowarp/scratch-storage');

const URL_UNDER_TEST = 'https://example.test/code.js';
const register = id => `Scratch.extensions.register({getInfo(){return {id:"${id}",name:"Sample",blocks:[]}}});`;
// The fetch port refuses a response whose URL is not the one it asked for, which is how it rejects
// a redirect; a constructed Response has no URL, so every acceptable one is given the asked URL.
const respond = (url, body) => Object.defineProperty(
    new Response(body, {status: 200, headers: {'content-type': 'text/javascript'}}), 'url', {value: url});
const served = async url => respond(url, register('sample'));

const emptyProject = async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"></svg>';
    const assetId = createHash('md5').update(svg).digest('hex');
    const project = {targets: [{isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {},
        blocks: {}, comments: {}, currentCostume: 0, sounds: [], volume: 100, layerOrder: 0, tempo: 60,
        costumes: [{name: 'Blank', assetId, dataFormat: 'svg', md5ext: `${assetId}.svg`,
            rotationCenterX: 240, rotationCenterY: 180}],
        videoTransparency: 50, videoState: 'off', textToSpeechLanguage: null}],
    monitors: [], extensions: [], meta: {semver: '3.0.0', vm: '2.0.0', agent: 'Retry classification fixture'}};
    return await new Zip().file('project.json', JSON.stringify(project)).file(`${assetId}.svg`, svg)
        .generateAsync({type: 'uint8array'});
};

/**
 * Run one catalog change against a real VM and a real host, and report how it ended.
 * @param {object} host How this attempt fails: the fetch, the approval, the signal, the settings.
 * @param {Uint8Array} project The project to change.
 * @returns {Promise<object>} `{code, worth}`, or `{resolved: true}`.
 */
async function configure ({fetchImpl, requestApproval = async () => true, loaderOptions, retries = 0,
    aborted = false}, project) {
    const vm = new VM();
    vm.attachStorage(new Storage());
    const host = installEditorExtensionHost(vm, {enabled: true, document: undefined, vmModules,
        fetchImpl, fetchRetry: {retries}, loaderOptions, requestApproval});
    try {
        await vm.loadProject(project);
        const controller = new AbortController();
        if (aborted) controller.abort();
        await host.authoring.configure([{id: 'sample', url: URL_UNDER_TEST, execution: 'unsandboxed',
            distribution: 'remote-cacheable', dependencies: []}], {signal: controller.signal});
        return {resolved: true};
    } catch (error) {
        return {code: error.code, worth: isWorthAskingAgain(error)};
    } finally {
        await host.dispose();
        vm.runtime.dispose();
    }
}

test('the library\'s own failures split into the ones a person could answer differently', async () => {
    const project = await emptyProject();
    assert.deepEqual(await configure({fetchImpl: served}, project), {resolved: true});
    for (const [name, attempt, expected] of [
        // Offline, CORS and CSP all reach the page as a bare TypeError from fetch.
        ['offline', {fetchImpl: async () => { throw new TypeError('Failed to fetch'); }},
            {code: 'LOAD_FAILED', worth: true}],
        ['timed out', {fetchImpl: () => new Promise(() => {}), loaderOptions: {timeoutMs: 60}},
            {code: 'TIMEOUT', worth: true}],
        ['missing', {fetchImpl: async () => new Response('nope', {status: 404})},
            {code: 'FETCH_FAILED', worth: false}],
        // The port already retried this one and gave up; the operation still calls it permanent.
        ['server error', {fetchImpl: async () => new Response('busy', {status: 503}), retries: 2},
            {code: 'FETCH_FAILED', worth: false}],
        // A denied redirect is not its own code: the port refuses the response it did not ask for.
        ['redirected', {fetchImpl: async () => new Response(null,
            {status: 302, headers: {location: 'https://elsewhere.test/code.js'}})},
        {code: 'FETCH_FAILED', worth: false}],
        ['not approved', {fetchImpl: served, requestApproval: async () => false},
            {code: 'TRUST_DENIED', worth: false}],
        ['cancelled', {fetchImpl: served, aborted: true}, {code: 'CANCELLED', worth: false}],
        // Same code as being offline, opposite answer: the cause is a permanent rejection.
        ['wrong ID', {fetchImpl: async url => respond(url, register('other'))},
            {code: 'LOAD_FAILED', worth: false}]
    ]) {
        assert.deepEqual(await configure(attempt, project), expected, name);
    }
});
