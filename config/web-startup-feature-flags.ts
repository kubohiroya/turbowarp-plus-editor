import {readStartupFeatureFlags} from './feature-flags.ts';

export function readWebStartupFeatureFlags(search = '') {
    const params = new URLSearchParams(search);
    const standardLayout = params.has('twPlusStandardLayout') ? params.get('twPlusStandardLayout') : '1';
    const stageDisplayMenu = params.get('twPlusStageDisplayMenu');
    return readStartupFeatureFlags({
        twPlusExtensionLoader: params.get('twPlusExtensionLoader'),
        twPlusProjectTools: params.get('twPlusProjectTools'),
        twPlusManualProjectURI: params.get('twPlusManualProjectURI'),
        twPlusPayloadFormats: params.get('twPlusPayloadFormats'),
        twPlusSpriteProperties: params.get('twPlusSpriteProperties'),
        twPlusSplitter: params.get('twPlusSplitter'),
        twPlusWindowLayout: params.get('twPlusWindowLayout'),
        twPlusBackpackPopout: params.get('twPlusBackpackPopout'),
        twPlusInternalWindows: params.get('twPlusInternalWindows'),
        twPlusStagePanel: params.get('twPlusStagePanel'),
        twPlusStageDisplayMenu: stageDisplayMenu === null && standardLayout === '1' ? '1' : stageDisplayMenu,
        twPlusTargetList: params.get('twPlusTargetList'),
        twPlusSpriteCodeWindows: params.get('twPlusSpriteCodeWindows'),
        twPlusStandardLayout: standardLayout,
        twPlusExtensionFileMenu: params.get('twPlusExtensionFileMenu'),
        twPlusDockviewSpriteTabs: params.get('twPlusDockviewSpriteTabs'),
        twPlusPaletteDeletePreview: params.get('twPlusPaletteDeletePreview'),
        twPlusHorizontalBlockPalette: params.get('twPlusHorizontalBlockPalette'),
        twPlusContextMenuIcons: params.get('twPlusContextMenuIcons'),
        twPlusWorkspaceMinimap: params.get('twPlusWorkspaceMinimap')
    });
}
