import {readStartupFeatureFlags} from '../config/feature-flags.ts';

export interface ExtensionLoader {
    unload(): void | Promise<void>;
}

export interface ExtensionLoaderOptions<Ports = unknown, Options = unknown, Host = unknown, Loader extends ExtensionLoader = ExtensionLoader> {
    startupSearch?: string;
    loaderModule?: {createExtensionLoader(ports?: Ports, options?: Options): Loader};
    integration?: {installExtensionLoader(host: Host, loader: Loader): (() => void | Promise<void>) | Promise<() => void | Promise<void>>};
    host?: Host;
    ports?: Ports;
    loaderOptions?: Options;
}

export interface ExtensionLoaderHandle {
    readonly enabled: boolean;
    dispose(): Promise<void>;
}

/** Connect trusted, host-supplied modules without interpreting project policy. */
export async function bootstrapExtensionLoader<Ports, Options, Host, Loader extends ExtensionLoader>({
    startupSearch = '', loaderModule, integration, host, ports, loaderOptions
}: ExtensionLoaderOptions<Ports, Options, Host, Loader> = {}): Promise<ExtensionLoaderHandle> {
    const flags = readStartupFeatureFlags(startupSearch);
    if (!flags.extensionLoader) {
        return Object.freeze({enabled: false, dispose: async () => {}});
    }
    if (typeof loaderModule?.createExtensionLoader !== 'function' ||
        typeof integration?.installExtensionLoader !== 'function') {
        throw new TypeError('Trusted Loader and GUI integration modules are required');
    }
    const loader = loaderModule.createExtensionLoader(ports, loaderOptions);
    let uninstall: () => void | Promise<void>;
    try {
        uninstall = await integration.installExtensionLoader(host, loader);
        if (typeof uninstall !== 'function') {
            throw new TypeError('GUI integration must return an uninstall function');
        }
    } catch (error) {
        try {
            await loader.unload();
        } catch (cleanupError) {
            throw new AggregateError([error, cleanupError], 'Loader installation and cleanup failed');
        }
        throw error;
    }
    let disposal: Promise<void>;
    return Object.freeze({
        enabled: true,
        dispose() {
            if (!disposal) {
                disposal = (async () => {
                    let uninstallError;
                    try {
                        await uninstall();
                    } catch (error) {
                        uninstallError = error;
                    }
                    try {
                        await loader.unload();
                    } catch (error) {
                        if (uninstallError) {
                            throw new AggregateError([uninstallError, error], 'GUI teardown and Loader unload failed');
                        }
                        throw error;
                    }
                    if (uninstallError) throw uninstallError;
                })();
            }
            return disposal;
        }
    });
}
