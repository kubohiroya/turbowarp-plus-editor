import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';

test('project tools defaults on, supports explicit off and rejects arbitrary values independently of the loader', () => {
    assert.equal(readWebStartupFeatureFlags('').projectTools, true);
    assert.equal(readWebStartupFeatureFlags('?lang=ja').projectTools, true);
    assert.equal(readWebStartupFeatureFlags('?twPlusProjectTools=1').projectTools, true);
    for (const value of ['0', '', 'true', 'false', 'invalid']) {
        assert.equal(readWebStartupFeatureFlags(`?twPlusProjectTools=${value}`).projectTools, false);
    }
    assert.deepEqual(readWebStartupFeatureFlags('?twPlusExtensionLoader=0'), {extensionLoader: false, projectTools: true, manualProjectURI: false, payloadFormats: true, spriteProperties: false, splitter: true, windowLayout: false, backpackPopout: false, internalWindows: false, stagePanel: false, stageDisplayMenu: true, targetList: false, spriteCodeWindows: false, standardLayout: true, extensionFileMenu: true, paletteDeletePreview: true, paletteCategoryReorder: true, horizontalBlockPalette: false, contextMenuIcons: true, localGit: true, gitRestoreVersion: false, workspaceMinimap: true, stageCodePrewarm: true, saveWorkspace: true, newProjectSb3Format: false});
    assert.deepEqual(readWebStartupFeatureFlags('?twPlusProjectTools=0'), {extensionLoader: true, projectTools: false, manualProjectURI: true, payloadFormats: true, spriteProperties: false, splitter: true, windowLayout: false, backpackPopout: false, internalWindows: false, stagePanel: false, stageDisplayMenu: true, targetList: false, spriteCodeWindows: false, standardLayout: true, extensionFileMenu: true, paletteDeletePreview: true, paletteCategoryReorder: true, horizontalBlockPalette: false, contextMenuIcons: true, localGit: true, gitRestoreVersion: false, workspaceMinimap: true, stageCodePrewarm: true, saveWorkspace: true, newProjectSb3Format: false});
});
