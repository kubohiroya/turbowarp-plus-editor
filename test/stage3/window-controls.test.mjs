import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createElement as h} from 'react';
import {flushSync} from 'react-dom';
import {createRoot} from 'react-dom/client';

const {outputFiles: [bundle]} = await build({
    entryPoints: [fileURLToPath(new URL('../../packages/editor-windows/index.jsx', import.meta.url))],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    external: ['react']
});
const compiled = {exports: {}};
new Function('require', 'module', 'exports', bundle.text)(createRequire(import.meta.url), compiled, compiled.exports);
const {WindowTitleBar, WindowTargetSelector, OpenWindowButton,
    MinimizeWindowButton, MaximizeWindowButton, DockWindowButton} = compiled.exports;

test('window controls render the active target and delegate the requested actions', () => {
    const {window} = new JSDOM('<div id="root"></div>');
    globalThis.window = window;
    globalThis.document = window.document;
    const container = document.getElementById('root');
    const root = createRoot(container);
    const calls = [];
    const targets = [
        {id: 'a', name: 'Sprite A', kind: 'sprite'},
        {id: 'b', name: 'Sprite B', kind: 'sprite', disabled: true},
        {id: 'stage', name: 'Stage', kind: 'stage'}
    ];
    const render = (value, maximized, openDisabled) => flushSync(() => root.render(h(WindowTitleBar, {
        title: 'Code',
        target: h(WindowTargetSelector, {targets, value, onChange: id => calls.push(id)})
    },
    h(OpenWindowButton, {onOpen: () => calls.push('open'), disabled: openDisabled}),
    h(MinimizeWindowButton, {onMinimize: () => calls.push('minimize')}),
    h(MaximizeWindowButton, {maximized, onChange: next => calls.push(next)}),
    h(DockWindowButton, {onDock: () => calls.push('dock')}))));
    const press = label => [...container.querySelectorAll('button')].find(button => button.textContent === label).click();
    try {
        render('a', false, false);
        const select = container.querySelector('header select');
        assert.equal(container.querySelector('header').getAttribute('aria-label'), 'Code');
        assert.equal(select.value, 'a');
        assert.deepEqual([...select.querySelectorAll('optgroup')].map(group => group.label), ['Sprites', 'Stage']);
        assert.equal(select.querySelector('option[value="b"]').disabled, true);
        select.value = 'stage';
        select.dispatchEvent(new window.Event('change', {bubbles: true}));
        assert.equal(select.value, 'a');
        press('Open in another window');
        press('Minimize window');
        press('Maximize window');
        render('stage', true, true);
        assert.equal(select.value, 'stage');
        press('Open in another window');
        press('Restore window');
        press('Close and dock');
        render('deleted-target', false, false);
        assert.equal(select.value, '');
        assert.deepEqual(calls, ['stage', 'open', 'minimize', true, false, 'dock']);
    } finally {
        flushSync(() => root.unmount());
        window.close();
        delete globalThis.window;
        delete globalThis.document;
    }
});
