require('../extension-security/helpers.cts');
const {after, test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {url: 'http://localhost/'});
for (const name of ['window', 'document', 'navigator', 'HTMLElement']) {
    Object.defineProperty(globalThis, name, {value: dom.window[name], configurable: true});
}
after(() => dom.window.close());
const React = require('react');
const {MessageChannel} = globalThis;
globalThis.MessageChannel = undefined;
const ReactDOM = require('react-dom');
globalThis.MessageChannel = MessageChannel;
const {IntlProvider} = require('react-intl');
const Controls = require('../../../src/components/controls/controls.jsx').default;
const StageControlsView = require('../../../../packages/editor-ui/src/stage-controls-view.tsx').default;
const {createStageControlsService} = require('../../../../packages/editor-ui/src/stage-controls.ts');

const trackedService = () => {
    const service = createStageControlsService();
    let subscriptions = 0;
    const subscribe = service.subscribe;
    service.subscribe = listener => {
        subscriptions++;
        const release = subscribe(listener);
        return () => { subscriptions--; release(); };
    };
    return {service, subscriptions: () => subscriptions};
};
const fixture = t => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const unmount = () => ReactDOM.unmountComponentAtNode(container);
    t.after(() => { unmount(); container.remove(); });
    const renderNode = node => ReactDOM.render(React.createElement(IntlProvider, {locale: 'en'}, node), container);
    const render = (service, isSmall = false) => renderNode(React.createElement(Controls, {
        active: false, turbo: false, onGreenFlagClick: () => {}, onStopAllClick: () => {},
        afterStop: service ? React.createElement(StageControlsView, {service, isSmall}) : null
    }));
    return {container, render, renderNode, unmount};
};

test('the host renders visible controls in the GUI slot with click, focus and accessibility state', t => {
    const f = fixture(t);
    const {service} = trackedService();
    let clicks = 0;
    service.api.addButton({id: 'hidden', label: '待機', onClick: () => {}});
    const handle = service.api.addButton({id: 'reload', label: '自動リロードの設定', text: '監視中',
        icon: '↻', onClick: () => clicks++});
    handle.update({visible: true});
    f.render(service);
    const button = () => (f.container as HTMLElement).querySelector<HTMLButtonElement>('[data-extension-stage-control="reload"]');
    assert.equal(f.container.querySelector('[data-extension-stage-control="hidden"]'), null);
    assert.equal(button().getAttribute('aria-expanded'), 'false');
    assert.equal(f.container.querySelector('img[title="Stop"]').nextElementSibling, button());
    button().click();
    assert.equal(clicks, 1);
    handle.focus();
    assert.equal(document.activeElement, button());
    handle.update({expanded: true, label: '設定を閉じる'});
    assert.equal(button().getAttribute('aria-expanded'), 'true');
    assert.equal(button().getAttribute('aria-label'), '設定を閉じる');
    f.render(service, true);
    assert.equal(button().textContent, '↻');
    assert.equal(button().getAttribute('title'), '設定を閉じる');
    handle.update({visible: false});
    assert.equal(button(), null);
});

test('the host preserves the panel node and detaches it when replaced or unmounted', t => {
    const f = fixture(t);
    const tracked = trackedService();
    const panel = document.createElement('input');
    panel.value = 'retained draft';
    tracked.service.placePanel(panel);
    f.render(tracked.service);
    assert.equal(tracked.subscriptions(), 1);
    assert.equal(f.container.querySelector('input'), panel);
    f.render(tracked.service, true);
    assert.equal(f.container.querySelector('input'), panel);
    assert.equal(panel.value, 'retained draft');
    const next = document.createElement('input');
    tracked.service.placePanel(next);
    assert.equal(f.container.querySelectorAll('input').length, 1);
    assert.equal(f.container.querySelector('input'), next);
    assert.equal(panel.parentNode, null);
    f.unmount();
    assert.equal(tracked.subscriptions(), 0);
    assert.equal(next.parentNode, null);
    assert.equal(tracked.service.panel(), next, 'the service retains ownership of its panel');
});

test('switching VM services releases the old subscription and unmount releases the new one', t => {
    const f = fixture(t);
    const first = trackedService();
    const second = trackedService();
    const old = first.service.api.addButton({id: 'old', label: 'old', onClick: () => {}});
    old.update({visible: true});
    f.render(first.service);
    assert.equal(first.subscriptions(), 1);
    f.render(second.service);
    assert.equal(first.subscriptions(), 0);
    assert.equal(second.subscriptions(), 1);
    old.update({text: 'must not reappear'});
    assert.equal(f.container.querySelector('[data-extension-stage-control]'), null);
    f.unmount();
    assert.equal(second.subscriptions(), 0);
    f.render(null);
    assert.ok(f.container.querySelector('img[title="Stop"]'));
    assert.equal(f.container.querySelector('[data-extension-stage-control]'), null);
});

test('the GUI container passes its current VM and size to the optional host renderer', t => {
    const f = fixture(t);
    const previous = globalThis.__TW_GUI_HOST__;
    t.after(() => {
        if (previous === undefined) delete globalThis.__TW_GUI_HOST__;
        else globalThis.__TW_GUI_HOST__ = previous;
    });
    const Container = require('../../../src/containers/controls.jsx').default.WrappedComponent;
    const VM = require('scratch-vm');
    const first = Object.create(VM.prototype);
    const second = Object.create(VM.prototype);
    const contexts = [];
    globalThis.__TW_GUI_HOST__ = {renderStageControls: context => {
        contexts.push(context);
        return React.createElement('button', {id: 'host-control'}, 'Host');
    }};
    const render = (vm, isSmall) => f.renderNode(React.createElement(Container, {
        vm, isSmall, isStarted: false, projectRunning: false, turbo: false, framerate: 30, interpolation: false
    }));
    render(first, false);
    assert.deepEqual(contexts.at(-1), {vm: first, isSmall: false});
    assert.equal(f.container.querySelector('img[title="Stop"]').nextElementSibling.id, 'host-control');
    render(second, true);
    assert.deepEqual(contexts.at(-1), {vm: second, isSmall: true});
    delete globalThis.__TW_GUI_HOST__;
    render(second, false);
    assert.equal(f.container.querySelector('#host-control'), null);
    assert.ok(f.container.querySelector('img[title="Stop"]'));
});
