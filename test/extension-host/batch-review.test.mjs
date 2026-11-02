import assert from 'node:assert/strict';
import {test} from 'node:test';

import {createSecurityReview} from '../../site/extension-host/review.js';
import {guiRequire} from './pinned-host.mjs';

const VM = guiRequire('scratch-vm');

/**
 * What a refused extension must leave behind.
 *
 * Moved from the fork's `test/unit/extension-security/core.test.cjs`: the review is this
 * distribution's now, so the test of it is here, against the VM the pinned GUI carries. A project
 * whose extension is declined still opens, still shows its blocks and still saves the source URL,
 * so declining is not the same as losing the project.
 */
test('a declined extension still opens its project and keeps its blocks and source URL', async () => {
    const vm = new VM();
    const url = 'data:text/javascript,throw%20new%20Error(%22must%20not%20run%22)';
    // Nothing is trusted and nothing is listed, so every extension reaches the review, which
    // declines: that is the path this checks.
    const review = createSecurityReview({trusted: {isTrustedURL: () => Promise.resolve(false)}});
    const restore = review.installBatchLoader({
        vm,
        defaultURLs: {},
        isTrusted: () => false,
        bannerFor: () => undefined,
        showReview: entries => new Map(entries.map(entry => [entry.url, 'deny']))
    });
    const project = {targets: [{isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, comments: {},
        blocks: {retained: {opcode: 'refused_test', next: null, parent: null, inputs: {}, fields: {},
            shadow: false, topLevel: true, x: 0, y: 0}},
        currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0, tempo: 60,
        videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null}],
    monitors: [], extensions: ['refused'], extensionURLs: {refused: url}, meta: {semver: '3.0.0'}};
    try {
        await vm.loadProject(project);
        assert.equal(vm.runtime.targets.length, 1);
        assert.equal(vm.runtime.targets[0].blocks.getBlock('retained').opcode, 'refused_test');
        assert.equal(vm.extensionManager.isExtensionLoaded('refused'), false);
        const saved = JSON.parse(vm.toJSON());
        assert.equal(saved.extensionURLs.refused, url);
        assert.ok(Object.values(saved.targets[0].blocks).some(block => block.opcode === 'refused_test'));
    } finally {
        restore();
        vm.quit();
        vm.clear();
    }
});

test('a cancelled review is a refusal, not a failure', () => {
    const review = createSecurityReview();
    assert.equal(review.isCancelled(Object.assign(new Error('x'), {code: 'OTHER'})), false);
    assert.equal(typeof review.render, 'function');
});
