// Read once at host startup; project data must never supply this value.
export function readStartupFeatureFlags(search = '') {
    const value = new URLSearchParams(search).get('twPlusExtensionLoader');
    const projectTools = new URLSearchParams(search).get('twPlusProjectTools');
    return Object.freeze({extensionLoader: value === null || value === '1',
        projectTools: projectTools === null || projectTools === '1'});
}
