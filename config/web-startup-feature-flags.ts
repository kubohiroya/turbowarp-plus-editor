import {readStartupFeatureFlags} from './feature-flags.ts';

export function readWebStartupFeatureFlags(search = '') {
    const params = new URLSearchParams(search);
    const standardLayout = params.get('twPlusStandardLayout');
    return readStartupFeatureFlags({
        twPlusExtensionLoader: params.get('twPlusExtensionLoader'),
        twPlusProjectTools: params.get('twPlusProjectTools'),
        twPlusSpriteProperties: params.get('twPlusSpriteProperties'),
        twPlusSplitter: params.get('twPlusSplitter'),
        twPlusWindowLayout: params.get('twPlusWindowLayout'),
        twPlusBackpackPopout: params.get('twPlusBackpackPopout'),
        twPlusInternalWindows: params.get('twPlusInternalWindows'),
        twPlusStagePanel: params.get('twPlusStagePanel'),
        twPlusTargetList: params.get('twPlusTargetList'),
        twPlusStandardLayout: standardLayout === null ? '1' : standardLayout,
        twPlusPaletteDeletePreview: params.get('twPlusPaletteDeletePreview'),
        twPlusHorizontalBlockPalette: params.get('twPlusHorizontalBlockPalette'),
        twPlusContextMenuIcons: params.get('twPlusContextMenuIcons')
    });
}
