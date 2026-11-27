import {readStartupFeatureFlags} from './feature-flags.ts';

export function readWebStartupFeatureFlags(search = '', newLayout?: boolean) {
    const params = new URLSearchParams(search);
    const standardLayout = (newLayout ?? params.get('twPlusStandardLayout') === '1') ? '1' : '0';
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
        twPlusPaletteDeletePreview: params.get('twPlusPaletteDeletePreview'),
        twPlusPaletteCategoryReorder: params.get('twPlusPaletteCategoryReorder'),
        twPlusHorizontalBlockPalette: params.get('twPlusHorizontalBlockPalette'),
        twPlusContextMenuIcons: params.get('twPlusContextMenuIcons'),
        twPlusLocalGit: params.get('twPlusLocalGit'),
        twPlusGitRestoreVersion: params.get('twPlusGitRestoreVersion'),
        twPlusWorkspaceMinimap: params.get('twPlusWorkspaceMinimap'),
        twPlusStageCodePrewarm: params.get('twPlusStageCodePrewarm'),
        twPlusSaveWorkspace: params.get('twPlusSaveWorkspace'),
        twPlusNewProjectSb3Format: params.get('twPlusNewProjectSb3Format')
    });
}
