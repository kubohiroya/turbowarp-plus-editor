// Read once at host startup; project data must never supply these values.
export function readStartupFeatureFlags({
    twPlusExtensionLoader: loader = null,
    twPlusProjectTools: projectTools = null,
    twPlusSpriteProperties: spriteProperties = null,
    twPlusWindowLayout: layout = null,
    twPlusBackpackPopout: backpack = null,
    twPlusInternalWindows: internal = null,
    twPlusStagePanel: stagePanel = null
} = {}) {
    return Object.freeze({
        extensionLoader: loader === null || loader === '1',
        projectTools: projectTools === null || projectTools === '1',
        spriteProperties: spriteProperties === '1',
        windowLayout: layout === '1',
        backpackPopout: layout === '1' && backpack === '1',
        internalWindows: layout === '1' && internal === '1',
        stagePanel: layout === '1' && internal === '1' && stagePanel === '1'
    });
}
