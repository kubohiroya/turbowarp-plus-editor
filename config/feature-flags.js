// Read once at host startup; project data must never supply this value.
export function readStartupFeatureFlags(search = '') {
    return Object.freeze({
        extensionLoader: new URLSearchParams(search).get('twPlusExtensionLoader') === '1'
    });
}
