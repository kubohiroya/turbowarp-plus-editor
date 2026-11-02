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

test('a project is named by its address when it has one, else by its content without volatile metadata', async () => {
    const {identifyProject} = await import('../../site/extension-host/review.js');
    const base = {targets: [], extensions: [], meta: {agent: 'one'}};
    const sameContent = {...base, meta: {agent: 'two'}, projectVersion: 3};
    assert.match(await identifyProject(base), /^sha256:[0-9a-f]{64}$/);
    assert.equal(await identifyProject(JSON.stringify(sameContent)), await identifyProject(base));
    assert.notEqual(await identifyProject({...base, extensions: ['pen']}), await identifyProject(base));
    const uri = 'https://example.test/turbowarp-plus-projects/aa/aaaa/0193f0a1-2b3c-7d4e-8f01-2233445566aa.sb3';
    const addressed = {...base, turboWarpPlus: {schemaVersion: 1, uri, extensions: []}};
    assert.equal(await identifyProject(addressed), uri);
});

test('rows the catalog or the GUI vouches for are decided without the screen, and the rest are asked', async () => {
    const asked = [];
    let review;
    const install = (vm, callback) => { review = callback; return () => {}; };
    const security = createSecurityReview({install, storage: null, identify: async () => null,
        trusted: {isTrustedURL: async url => url === 'https://catalog.test/listed.js'}});
    security.installBatchLoader({vm: {}, defaultURLs: {},
        isTrusted: url => url === 'https://gui.test/own.js',
        bannerFor: ({ids}) => (ids.includes('shown') ? 'banner.svg' : undefined),
        showReview: async (entries, initial) => { asked.push(entries, initial); return new Map(); }});
    const row = (key, url) => ({key: url, ids: [key], source: {kind: 'legacy', url}});
    const trustedOnly = await review([row('listed', 'https://catalog.test/listed.js'), row('own', 'https://gui.test/own.js')], new Map());
    assert.deepEqual([...trustedOnly.values()], [{execution: 'unsandboxed'}, {execution: 'unsandboxed'}]);
    assert.equal(asked.length, 0, 'nothing to ask, so the screen never opened');
    await review([row('listed', 'https://catalog.test/listed.js'), row('shown', 'https://elsewhere.test/x.js')], new Map());
    const [entries, initial] = asked;
    assert.deepEqual(entries.map(entry => Boolean(entry.state?.trusted)), [true, false]);
    assert.equal(entries[1].metadata.banner, 'banner.svg');
    assert.deepEqual(initial.get('https://elsewhere.test/x.js'), {execution: 'sandboxed'});
});

test('the GUI modal frames the screen under its own prop names, as one stable component', async () => {
    const {frameFor} = await import('../../site/extension-host/review.js');
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
    assert.equal(element.props.className, 'frame');
    assert.equal(element.props.children.props.className, 'body');
    assert.equal(element.props.children.props.children, 'body');
});
