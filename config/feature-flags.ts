// Read once at host startup; project data must never supply these values.
export function readStartupFeatureFlags({
    twPlusExtensionLoader: loader = null,
    twPlusProjectTools: projectTools = null,
    twPlusWindowLayout: layout = null
} = {}) {
    return Object.freeze({
        extensionLoader: loader === null || loader === '1',
        projectTools: projectTools === null || projectTools === '1',
        windowLayout: layout === '1'
    });
}
