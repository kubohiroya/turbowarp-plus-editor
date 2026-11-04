import {readStartupFeatureFlags} from './feature-flags.ts';

export function readWebStartupFeatureFlags(search = '') {
    const params = new URLSearchParams(search);
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
        twPlusPaletteDeletePreview: params.get('twPlusPaletteDeletePreview'),
        twPlusHorizontalBlockPalette: params.get('twPlusHorizontalBlockPalette')
    });
}
