import assert from 'node:assert/strict';
import test from 'node:test';

import {createControlsDock, installControlsDock} from '../site/controls-dock.ts';
import {createStageControlsService} from '@kubohiroya/turbowarp-plus-editor-ui/stage-controls';

const DOCK = Symbol.for('@kubohiroya/turbowarp-app-shell/runtime-controls-dock/v1');
const hostDocument = () => ({} as unknown as Document & Record<symbol, unknown>);

// The dock is the shape app-shell consumers already use. camera-source, for one, calls
// stageControls.addButton, placePanel and subscribe on it.
test('the dock offers what an app-shell consumer calls', () => {
    const service = createStageControlsService();
    const dock = createControlsDock(service) as Record<string, unknown>;
    for (const name of ['stageControls', 'placePanel', 'subscribe', 'getSnapshot', 'dispose']) {
        assert.ok(dock[name], `missing ${name}`);
    }
    assert.equal(typeof (dock.stageControls as {addButton: unknown}).addButton, 'function');
});

test('placing a panel reaches the service, and subscribers hear about it', () => {
    const service = createStageControlsService();
    const dock = createControlsDock(service);
    let changes = 0;
    dock.subscribe(() => changes++);
    const element = {marker: true};
    dock.placePanel(element);
    assert.equal(service.panel(), element);
    assert.equal(changes, 1);
    dock.placePanel(element);
    assert.equal(changes, 1, 'placing the same element again changes nothing');
});

test('the snapshot reports the bar as fixed and counts what is visible', () => {
    const service = createStageControlsService();
    const dock = createControlsDock(service);
    assert.deepEqual(dock.getSnapshot(), {edge: 'top', autoHide: false, expanded: false, count: 0});
    const handle = service.api.addButton({id: 'one', label: 'One', onClick () {}});
    assert.equal(dock.getSnapshot().count, 0, 'a control registers hidden');
    handle.update({visible: true, expanded: true});
    assert.deepEqual(dock.getSnapshot(), {edge: 'top', autoHide: false, expanded: true, count: 1});
});

test('installing shares the dock on the document and removes only its own', () => {
    const service = createStageControlsService();
    const doc = hostDocument();
    const installed = installControlsDock(doc, service);
    assert.ok(doc[DOCK]);
    installed.dispose();
    assert.equal(doc[DOCK], undefined);

    const existing = {marker: true};
    doc[DOCK] = existing;
    const second = installControlsDock(doc, service);
    assert.equal(doc[DOCK], existing, 'an existing dock is left alone');
    second.dispose();
    assert.equal(doc[DOCK], existing, 'and is not removed by a disposer that did not install it');
});

// Disposing the dock clears what extensions registered, so a reattached VM starts clean.
test('disposing the dock clears the controls and the panel', () => {
    const service = createStageControlsService();
    const dock = createControlsDock(service);
    service.api.addButton({id: 'one', label: 'One', onClick () {}}).update({visible: true});
    dock.placePanel({marker: true});
    dock.dispose();
    assert.deepEqual(service.snapshot(), []);
    assert.equal(service.panel(), null);
});
