/**
 * The dialog as the editor actually mounts it.
 *
 * Moved from the fork's `test/unit/block-editor/modal.test.mjs`. It compiles the GUI's own wrapper
 * from the pinned checkout and renders it through this host's messages, styles and real package.
 *
 * React has to be the one the GUI mounts with: `test/asset-hooks.ts` resolves it to the pinned
 * checkout's copy, the way the site build's alias does. Without that, this repository's own React
 * 18 would load beside the GUI's 16 and the two break each other.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test, after} from 'node:test';
import * as core from '@kubohiroya/turbowarp-extension-data-editor';
import * as sharedUI from '@kubohiroya/turbowarp-extension-data-editor/react';

import {createPlusBlockEditor, plusBlockEditorClassNames} from '@kubohiroya/turbowarp-extension-data-editor/plus';
import blockEditorStyles from '@kubohiroya/turbowarp-extension-data-editor/react/styles.css';
import {guiRequire} from '../extension-host/pinned-host.ts';

import {JSDOM} from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/', pretendToBeVisual: true
});
for (const name of [
    'window', 'document', 'DOMParser', 'XMLSerializer', 'Element', 'HTMLElement',
    'HTMLCollection', 'NodeList', 'Node', 'navigator'
]) Object.defineProperty(globalThis, name, {value: dom.window[name], configurable: true});
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
// React 16's scheduler must use its timer fallback in this Node/jsdom test.
Object.defineProperty(globalThis, 'MessageChannel', {value: undefined, configurable: true});
after(() => dom.window.close());
const React = guiRequire('react');
const ReactDOM = guiRequire('react-dom');
const ReactModal = guiRequire('react-modal');
const {act} = guiRequire('react-dom/test-utils');
const intl = guiRequire('react-intl');
const babel = guiRequire('@babel/core');
const filename = path.resolve('site/gui-integration/containers/tw-block-editor-modal.tsx');
// Reuse the project's JSX compiler. Keep the real ReactModal portal, replacing only its GUI/Redux wrapper.
const {code} = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false,
    presets: [[guiRequire.resolve('@babel/preset-env'), {targets: {node: 'current'}}],
        guiRequire.resolve('@babel/preset-react')]
});
const imports = {
    'prop-types': guiRequire('prop-types'), react: React, 'react-intl': intl,
    'react-redux': {connect: () => component => component},
    '@kubohiroya/turbowarp-extension-data-editor/plus': {plusBlockEditorClassNames},
    // The wrapper reaches the dialog through the integration: the host supplies it, and what this
    // file is about is the wrapper's own messages and props.
    '../lib/tw-plus-integration-points.ts': {
        // As in plus-integration: the host hands the data editor the dialog stylesheet it bundles.
        hostIntegration: () => ({blockEditor: createPlusBlockEditor({styles: blockEditorStyles, dialog: sharedUI.BlockEditorDialog})}),
        hostBlockEditor: integration => integration?.blockEditor || null
    },
    './modal.jsx': props => React.createElement(ReactModal, {
        isOpen: true, ariaHideApp: false, contentLabel: props.contentLabel,
        onRequestClose: props.onRequestClose
    }, props.children),
    '../lib/log.js': {error: () => {}},
};
const wrapper: {exports: {default?: typeof import('../../site/gui-integration/containers/tw-block-editor-modal.tsx').default}} = {exports: {}};
new Function('require', 'module', 'exports', code)(name => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected component dependency: ${name}`);
    return imports[name];
}, wrapper, wrapper.exports);
const NativeComponent = wrapper.exports.default;
const Component = props => React.createElement(NativeComponent, {...props,
    ModalComponent: imports['./modal.jsx'], onError: imports['../lib/log.js'].error});

function textValue(value: core.JsonValue): string {
    assert.equal(typeof value, 'string');
    return value as string;
}

async function fixture(t, {validate = () => []}: {validate?: core.EditorDefinition['validate']} = {}) {
    const registry = new core.EditorRegistry();
    let mounts = 0;
    let cleanups = 0;
    let commits = 0;
    let closes = 0;
    const block: core.BlockSnapshot = {
        targetId: 'sprite', blockId: 'scene', opcode: 'story_scene', revision: '1',
        arguments: {PROPERTIES: {kind: 'literal' as const, value: '{}'}}
    };
    registry.register({
        apiVersion: 1, extensionId: 'story', editorId: 'properties', opcodes: ['story_scene'],
        editableArguments: ['PROPERTIES'],
        read: () => ({properties: '{}'}), validate,
        createPatch: draft => [{argument: 'PROPERTIES', value: textValue(draft.properties)}],
        mount: (container, context) => {
            assert.ok(container instanceof dom.window.HTMLElement);
            mounts++;
            const input = document.createElement('textarea');
            input.value = textValue(context.getDraft().properties);
            container.appendChild(input);
            const onInput = () => context.setDraft({properties: input.value});
            input.addEventListener('input', onInput);
            return () => {
                cleanups++;
                input.removeEventListener('input', onInput);
                input.remove();
            };
        }
    });
    const session = registry.open(block, {readBlock: () => block, commit: () => { commits++; }});
    const root = document.createElement('div');
    document.body.appendChild(root);
    await act(async () => {
        ReactDOM.render(React.createElement(intl.IntlProvider, {locale: 'en'},
            React.createElement(Component, {session, onClose: () => { closes++; }})
        ), root);
        await new Promise(resolve => setTimeout(resolve, 0));
    });
    t.after(() => {
        act(() => { ReactDOM.unmountComponentAtNode(root); });
        root.remove();
    });
    const input = document.querySelector('textarea');
    assert.ok(input, 'The editor body mounts after the real ReactModal portal becomes available.');
    return {
        session, input,
        mounts: () => mounts, cleanups: () => cleanups,
        commits: () => commits, closes: () => closes,
        edit: value => act(() => {
            input.value = value;
            input.dispatchEvent(new dom.window.Event('input', {bubbles: true}));
        }),
        save: () => document.querySelector<HTMLButtonElement>('[data-block-editor-save]')
    };
}

test('the body mounts exactly once after ReactModal creates its portal', async t => {
    const f = await fixture(t);
    assert.equal(f.mounts(), 1);
    f.edit('{"duration":2}');
    assert.equal(f.mounts(), 1);
    assert.equal(f.commits(), 0);
    assert.equal(f.closes(), 0);
});
