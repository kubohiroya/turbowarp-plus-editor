import assert from 'node:assert/strict';
import test from 'node:test';

import {createStageControlsService} from '@kubohiroya/turbowarp-plus-editor-workbench/stage-controls';
import {createPlusIntegration} from '../site/plus-integration.ts';

test('this distribution hands the service to the fork through the integration', () => {
    const asked: unknown[] = [];
    const integration = createPlusIntegration({
        mountEditor: () => ({dispose () {}}),
        stageControls: (vm: unknown) => {
            asked.push(vm);
            return createStageControlsService();
        }
    });
    const vm = {on: () => {}};
    assert.equal(typeof integration.stageControls, 'function');
    integration.stageControls(vm);
    assert.deepEqual(asked, [vm]);
});
