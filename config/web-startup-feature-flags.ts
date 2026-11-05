import {readStartupFeatureFlags} from './feature-flags.ts';

export function readWebStartupFeatureFlags(search = '') {
    const params = new URLSearchParams(search);
    const standardLayout = params.get('twPlusStandardLayout');
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
        twPlusStageDisplayMenu: params.get('twPlusStageDisplayMenu'),
        twPlusTargetList: params.get('twPlusTargetList'),
        twPlusSpriteCodeWindows: params.get('twPlusSpriteCodeWindows'),
        twPlusStandardLayout: standardLayout === null ? '1' : standardLayout,
        twPlusPaletteDeletePreview: params.get('twPlusPaletteDeletePreview'),
        twPlusHorizontalBlockPalette: params.get('twPlusHorizontalBlockPalette'),
        twPlusContextMenuIcons: params.get('twPlusContextMenuIcons'),
        twPlusWorkspaceMinimap: params.get('twPlusWorkspaceMinimap')
    });
}
