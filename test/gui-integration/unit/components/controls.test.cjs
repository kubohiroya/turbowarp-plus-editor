require('../extension-security/helpers.cjs');
const {after, test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');

// react-dom decides whether it can use the DOM when it is first loaded.
const dom = new JSDOM('<!doctype html><html><body></body></html>', {url: 'http://localhost/'});
for (const name of ['window', 'document', 'navigator', 'HTMLElement']) {
    Object.defineProperty(globalThis, name, {value: dom.window[name], configurable: true});
}
after(() => dom.window.close());
const React = require('react');
// Without MessageChannel React's scheduler falls back to timers, whose port would keep Node running.
const {MessageChannel} = globalThis;
globalThis.MessageChannel = undefined;
const ReactDOM = require('react-dom');
globalThis.MessageChannel = MessageChannel;
const {IntlProvider} = require('react-intl');
const Controls = require('../../../src/components/controls/controls.jsx').default;

test('renders visible extension controls after stop with native click and accessibility state', t => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    t.after(() => {
        ReactDOM.unmountComponentAtNode(container);
        container.remove();
    });
    let clicks = 0;
    const render = props => ReactDOM.render(React.createElement(IntlProvider, {locale: 'en'},
        React.createElement(Controls, {
            active: false,
            turbo: false,
            onGreenFlagClick: () => {},
            onStopAllClick: () => {},
            extensionControls: [
                {id: 'hidden', label: '待機', visible: false},
                {id: 'reload', label: '自動リロードの設定', text: '監視中', icon: '↻',
                    visible: true, expanded: false, onClick: () => clicks++}
            ],
            ...props
        })), container);
    render({});
    const button = () => container.querySelector('button[data-extension-stage-control="reload"]');
    assert.equal(container.querySelector('[data-extension-stage-control="hidden"]'), null);
    assert.equal(button().getAttribute('aria-expanded'), 'false');
    button().dispatchEvent(new dom.window.MouseEvent('click', {bubbles: true}));
    assert.equal(clicks, 1);
    assert.equal(container.querySelector('img[title="Stop"]').nextElementSibling, button());
    render({isSmall: true});
    assert.equal(button().textContent, '↻');
    assert.equal(button().getAttribute('aria-label'), '自動リロードの設定');
});
