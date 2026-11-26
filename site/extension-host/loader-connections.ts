import type {ExtensionLoader} from '@kubohiroya/turbowarp-extension-loader';

type IdentitySource = Pick<ExtensionLoader, 'getLoadedExtensionIdentities'>;
const sources = new WeakMap<object, IdentitySource>();

/** Connect a VM to its own Loader. The Loader owns the committed identity data. */
export const connectExtensionIdentities = (vm: object, source: IdentitySource) => {
    sources.set(vm, source);
    return () => {
        if (sources.get(vm) === source) sources.delete(vm);
    };
};

export const getExtensionIdentities = (vm: object) =>
    sources.get(vm)?.getLoadedExtensionIdentities() ?? [];
