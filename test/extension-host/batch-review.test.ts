import assert from 'node:assert/strict';
import {test} from 'node:test';

import {createSecurityReview} from '../../site/extension-host/review.ts';
import {guiRequire} from './pinned-host.ts';

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
    const review = createSecurityReview({trusted: {listedDigests: new Set(), ready: async () => {}, isTrustedCode: async () => false, isTrustedURL: () => Promise.resolve(false)}});
    const restore = review.installBatchLoader({
        vm,
        defaultURLs: {},
        isTrusted: () => false,
        bannerFor: () => undefined,
        showReview: entries => new Map(entries.map(entry => [entry.key, {execution: 'deny'}]))
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
        assert.ok(Object.values<{opcode: string}>(saved.targets[0].blocks).some(block => block.opcode === 'refused_test'));
    } finally {
        restore();
        vm.quit();
        vm.clear();
    }
});

test('the GUI modal frames the screen under its own prop names, as one stable component', async () => {
    const {frameFor} = await import('../../site/extension-host/review.ts');
    const received = [];
    const Modal = props => { received.push(props); return null; };
    const Frame = frameFor(Modal);
    assert.equal(frameFor(Modal), Frame, 'the same adapter on every render');
    const cancel = () => {};
    Frame({title: '拡張機能の確認', onCancel: cancel, children: 'body'});
    assert.equal(received.length, 0, 'the adapter returns an element; React renders the modal');
    const element = Frame({title: '拡張機能の確認', onCancel: cancel, children: 'body'});
    assert.equal(element.type, Modal);
    assert.equal(element.props.contentLabel, '拡張機能の確認');
    assert.equal(element.props.onRequestClose, cancel);
    // Whatever class names the stylesheet resolves to — a test stub answers with its own — the
    // frame and its body are the ones `review.css` defines.
    const {default: styles} = await import('@kubohiroya/turbowarp-extension-security-dialog/project-review.css');
    assert.equal(element.props.className, styles.frame);
    assert.equal(element.props.children.props.className, styles.body);
    assert.equal(element.props.children.props.children, 'body');
});
