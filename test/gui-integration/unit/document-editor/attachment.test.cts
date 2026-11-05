const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const guiRequire = createRequire(path.join(
    require('../../../pinned-gui.ts').default('This test needs the pinned GUI'), 'package.json'));
const babel = guiRequire('@babel/core');
const {transformSync} = require('esbuild');

const filename = path.resolve(__dirname, '../../../../site/gui-integration/containers/tw-plus-workspace-attachment.tsx');
const {code: source} = transformSync(fs.readFileSync(filename, 'utf8'), {loader: 'tsx'});
const {code} = babel.transformSync(source, {
    babelrc: false, presets: [[guiRequire.resolve('@babel/preset-env'), {targets: {node: 'current'}}], guiRequire.resolve('@babel/preset-react')]
});

function fixture (integration) {
    const contexts = [], disposals = [], errors = [];
    const blockly = {};
    const module: {exports: {default?: typeof import('../../../../site/gui-integration/containers/tw-plus-workspace-attachment.tsx').default}} = {exports: {}};
    const mocks = {
        react: require('react'),
        'prop-types': require('prop-types'),
        'react-redux': {connect: () => value => value},
        '../lib/tw-lazy-scratch-blocks': {load: async () => {}, get: () => blockly},
        '../lib/log': {error: (...args) => errors.push(args)},
        '../lib/tw-plus-integration-points.ts': {
            hostIntegration: () => integration || {},
            attachHostToWorkspace: (context, supplied) => {
                contexts.push(context);
                return supplied?.attachToWorkspace?.(context) || null;
            }
        }
    };
    new Function('require', 'module', 'exports', 'document', code)(name => {
        assert(name in mocks, name);
        return mocks[name];
    }, module, module.exports, {});
    return {Attachment: module.exports.default({LazyScratchBlocks: mocks['../lib/tw-lazy-scratch-blocks'], log: mocks['../lib/log']}), contexts, disposals, errors, blockly};
}

const attaching = disposals => ({attachToWorkspace: () => ({dispose: () => disposals.push('dispose')})});

// With no host supplying anything the GUI must behave as it did before this point existed.
test('a host that attached nothing leaves nothing to dispose and logs nothing', () => {
    const f = fixture(null);
    const component = new f.Attachment({vm: {}, locale: 'ja'});
    component.componentDidMount();
    component.componentWillUnmount();
    assert.equal(f.contexts.length, 1);
    assert.deepEqual(f.errors, []);
});

test('the host receives the VM, locale, document, Blockly and current translations', async () => {
    const disposals = [];
    const f = fixture(attaching(disposals));
    const vm = {};
    const initialMessages = {example: '複製'};
    const component = new f.Attachment({vm, locale: 'ja', messages: initialMessages});
    component.componentDidMount();
    assert.equal(f.contexts[0].vm, vm);
    assert.equal(f.contexts[0].locale, 'ja');
    assert.equal(typeof f.contexts[0].getBlockly, 'function');
    assert.equal(await f.contexts[0].getBlockly(), f.blockly);
    assert.equal(f.contexts[0].getMessages(), initialMessages);
    const nextMessages = {example: 'duplicate'};
    component.props = {vm, locale: 'en', messages: nextMessages};
    component.componentDidUpdate({vm});
    assert.equal(f.contexts.length, 1);
    assert.equal(f.contexts[0].getMessages(), nextMessages);
    assert.deepEqual(f.errors, []);
});

// Replacing the VM must dispose before attaching again, or two attachments would run at once.
test('a new VM disposes the old attachment first, and the same VM changes nothing', () => {
    const disposals = [];
    const f = fixture(attaching(disposals));
    const vm = {};
    const component = new f.Attachment({vm, locale: 'ja'});
    component.componentDidMount();
    component.componentDidUpdate({vm});
    assert.equal(f.contexts.length, 1);
    assert.deepEqual(disposals, []);
    const next = {};
    component.props = {vm: next, locale: 'ja'};
    component.componentDidUpdate({vm});
    assert.deepEqual(disposals, ['dispose']);
    assert.equal(f.contexts[1].vm, next);
    component.componentWillUnmount();
    assert.deepEqual(disposals, ['dispose', 'dispose']);
    assert.deepEqual(f.errors, []);
});

// A host that throws must not keep the editor from opening, in either direction.
test('a host that throws while attaching or disposing is logged and does not propagate', () => {
    const throwing = {attachToWorkspace: () => { throw new Error('attach failed'); }};
    const f = fixture(throwing);
    const component = new f.Attachment({vm: {}, locale: 'ja'});
    component.componentDidMount();
    assert.equal(f.errors.length, 1);
    assert.match(f.errors[0][0], /could not attach/);
    component.componentWillUnmount();
    assert.equal(f.errors.length, 1);

    const badDispose = {attachToWorkspace: () => ({dispose: () => { throw new Error('dispose failed'); }})};
    const g = fixture(badDispose);
    const other = new g.Attachment({vm: {}, locale: 'ja'});
    other.componentDidMount();
    other.componentWillUnmount();
    assert.equal(g.errors.length, 1);
    assert.match(g.errors[0][0], /could not be detached/);
});
