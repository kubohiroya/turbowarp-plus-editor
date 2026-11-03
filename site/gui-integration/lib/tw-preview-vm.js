import VirtualMachine from 'scratch-vm';
import centralDispatch from 'scratch-vm/src/dispatch/central-dispatch.js';

/**
 * Construct an extension-free preview VM without replacing the editor's shared dispatch services.
 * All dispatch mutations stay inside this synchronous constructor boundary.
 * @param {Function} VMClass Native constructor from this host's pinned scratch-vm module.
 * @param {object} dispatch The same module's central dispatcher.
 * @returns {object} A VM which must only load projects with scripts and extensions removed.
 */
const createPreviewVmWithDispatch = (VMClass, dispatch) => {
    const services = dispatch && dispatch.services;
    if (typeof VMClass !== 'function' || !services || !Object.isExtensible(services)) {
        throw new TypeError('Preview VM construction requires the native host dispatcher.');
    }
    const keys = ['runtime', 'extensions'];
    const previous = keys.map(key => Object.getOwnPropertyDescriptor(services, key));
    if (previous.some(descriptor => descriptor && !descriptor.configurable)) {
        throw new TypeError('The host dispatch services cannot be temporarily isolated.');
    }
    for (const key of keys) delete services[key];
    try {
        const vm = new VMClass();
        vm.securityManager.canLoadExtensionFromProject = () => false;
        // Restored dispatch services belong to the editor. The returned VM must never register extensions there.
        vm.extensionManager.loadExtensionURL = () => Promise.reject(new Error('Preview VMs cannot load extensions.'));
        vm.extensionManager.loadExtensionIdSync = () => {
            throw new Error('Preview VMs cannot load extensions.');
        };
        return vm;
    } finally {
        keys.forEach((key, index) => {
            if (previous[index]) Object.defineProperty(services, key, previous[index]);
            else delete services[key];
        });
    }
};

const createPreviewVm = (VMClass = VirtualMachine) => createPreviewVmWithDispatch(VMClass, centralDispatch);

export {createPreviewVmWithDispatch};
export default createPreviewVm;
