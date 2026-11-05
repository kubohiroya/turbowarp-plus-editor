import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {after, test} from 'node:test';
import {JSDOM} from 'jsdom';
import {transformSync} from 'esbuild';
import * as integration from '../../../../site/plus-integration.ts';
import * as points from '../../../../site/gui-integration/lib/tw-plus-integration-points.ts';
import afterNativeFieldStartup from '../../../../site/gui-integration/lib/tw-block-editor-startup.ts';
import getBlockEditorService from '../../../../site/gui-integration/lib/tw-block-editor-service.ts';
import {guiImport, guiRequire} from '../../../extension-host/pinned-host.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {url: 'http://localhost/'});
for (const name of ['window', 'document', 'navigator', 'HTMLElement']) {
    Object.defineProperty(globalThis, name, {value: dom.window[name], configurable: true});
}
after(() => dom.window.close());
const React = guiRequire('react');
const {MessageChannel} = globalThis;
globalThis.MessageChannel = undefined;
const ReactDOM = guiRequire('react-dom');
globalThis.MessageChannel = MessageChannel;
const reactRedux = guiRequire('react-redux');
const {createStore} = guiRequire('redux');

globalThis.__TW_GUI_HOST__ = points;
const {default: modals, openHostModal, closeHostModal} = await guiImport('src/reducers/modals.js');
delete globalThis.__TW_GUI_HOST__;

const babel = guiRequire('@babel/core');
const filename = new URL('../../../../site/gui-integration/containers/tw-plus-blocks.tsx', import.meta.url);
const {code: source} = transformSync(readFileSync(filename, 'utf8'), {loader: 'tsx'});
const {code} = babel.transformSync(source, {
    babelrc: false,
    configFile: false,
    presets: [[guiRequire.resolve('@babel/preset-env'), {targets: {node: 'current'}}],
        guiRequire.resolve('@babel/preset-react')]
});
const modal = integration.BLOCK_EDITOR_MODAL;
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture (t) {
    const attachments = [];
    const rendered = [];
    const disposed = [];
    const minimap = {attached: [], disposed: []};
    const installed = points.hostIntegration() as {
        blockEditor: {createService(): object; attach(context: {workspace: object}): {dispose(): void}};
        attachWorkspaceMinimap(workspace: object): {dispose(): void};
    };
    const original = installed.blockEditor;
    t.mock.method(installed, 'attachWorkspaceMinimap', workspace => {
        minimap.attached.push(workspace);
        return {dispose: () => minimap.disposed.push(workspace)};
    });
    installed.blockEditor = {
        createService: () => ({}),
        attach: context => {
            attachments.push(context);
            return {dispose: () => disposed.push(context.workspace)};
        }
    };

    const imports = {
        react: React,
        'react-redux': reactRedux,
        '../../plus-integration.ts': integration,
        '../lib/tw-plus-integration-points.ts': points,
        '../lib/tw-block-editor-startup.ts': afterNativeFieldStartup,
        '../lib/tw-block-editor-service.ts': getBlockEditorService,
        './tw-block-editor-modal.tsx': props => {
            rendered.push(props);
            return React.createElement('div', {role: 'dialog'}, props.nodeLabels.root);
        }
    };
    const module: {exports: {default?: typeof import('../../../../site/gui-integration/containers/tw-plus-blocks.tsx').default}} = {exports: {}};
    new Function('require', 'module', 'exports', code)(name => {
        assert.ok(Object.hasOwn(imports, name), name);
        return imports[name];
    }, module, module.exports);
    class NativeBlocks extends React.Component {
        componentDidMount () {
            this.props.onWorkspaceReady(this.props.workspace, this.props.ScratchBlocks, this.props.startupReady);
        }
        componentDidUpdate (previous) {
            if (previous.workspace !== this.props.workspace) {
                this.props.onWorkspaceWillDispose();
                this.componentDidMount();
            }
        }
        componentWillUnmount () {
            this.props.onWorkspaceWillDispose();
        }
        render () {
            return null;
        }
    }
    const Workspace = reactRedux.connect(state => ({
        anyModalVisible: Object.values(state).some(Boolean)
    }))(module.exports.default({ModalComponent: undefined, openHostModal, closeHostModal, onError: assert.fail})(NativeBlocks));
    const store = createStore(modals);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const unmount = () => ReactDOM.unmountComponentAtNode(container);
    t.after(() => {
        unmount();
        container.remove();
        installed.blockEditor = original;
    });
    let props = {workspace: {}, vm: {}, ScratchBlocks: {}, isVisible: true,
        intl: {formatMessage: ({defaultMessage}) => defaultMessage}};
    const render = update => {
        props = {...props, ...update};
        ReactDOM.render(React.createElement(reactRedux.Provider, {store}, React.createElement(Workspace, props)),
            container);
    };
    return {attachments, rendered, disposed, minimap, store, container, render, unmount};
}

test('workspace readiness and native modal state gate the host editor, including repeated opens', async t => {
    const f = fixture(t);
    let ready;
    f.render({startupReady: new Promise(resolve => { ready = resolve; })});
    assert.equal(f.attachments.length, 0);
    ready();
    await tick();
    const [bridge] = f.attachments;
    assert.equal(f.minimap.attached.length, 1);
    assert.equal(f.minimap.attached[0], bridge.workspace);
    assert.equal(bridge.fixedInputs, true);
    assert.equal(bridge.canOpen(), true);
    f.render({isVisible: false});
    assert.equal(bridge.canOpen(), false);
    f.render({isVisible: true});
    const session = {};
    bridge.onOpen(session, {root: 'First'}, {root: {colour: '#090'}});
    assert.equal(f.store.getState()[modal], true);
    assert.equal(bridge.canOpen(), false);
    assert.equal(f.container.querySelector('[role="dialog"]').textContent, 'First');
    const first = f.rendered.at(-1);
    assert.equal(first.session, session);
    assert.deepEqual(first.nodeAppearances, {root: {colour: '#090'}});
    first.onClose();
    assert.equal(f.store.getState()[modal], false);
    assert.equal(bridge.canOpen(), true);
    bridge.onOpen({}, {root: 'Second'});
    first.onClose();
    assert.equal(f.store.getState()[modal], true, 'an old save or close cannot dismiss a newer session');
    assert.equal(f.container.querySelector('[role="dialog"]').textContent, 'Second');
    f.unmount();
    assert.deepEqual(f.disposed, [bridge.workspace]);
    assert.equal(f.minimap.disposed.length, 1);
    assert.equal(f.minimap.disposed[0], bridge.workspace);
    assert.equal(f.store.getState()[modal], false);
});

test('a VM replacement invalidates pending startup and disposes a running attachment on departure', async t => {
    const f = fixture(t);
    let ready;
    const oldVM = {};
    const nextVM = {};
    const nextWorkspace = {};
    f.render({vm: oldVM, startupReady: new Promise(resolve => { ready = resolve; })});
    f.render({vm: nextVM});
    ready();
    await tick();
    assert.equal(f.attachments.length, 0, 'the previous workspace cannot attach to a replacement VM');
    f.render({workspace: nextWorkspace, startupReady: Promise.resolve()});
    await tick();
    const [bridge] = f.attachments;
    assert.equal(bridge.workspace, nextWorkspace);
    assert.equal(bridge.vm, nextVM);
    bridge.onOpen({}, {root: 'Active'});
    f.render({vm: {}});
    assert.deepEqual(f.disposed, [nextWorkspace]);
    assert.equal(f.store.getState()[modal], false);
    assert.equal(bridge.canOpen(), false);
});
