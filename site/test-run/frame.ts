import VirtualMachine from 'scratch-vm';
import ScratchRender from 'scratch-render';
import ScratchStorage from '@turbowarp/scratch-storage';
import {startTestFrame} from '@kubohiroya/turbowarp-plus-editor-test/frame-host';
import {installPlusExtensionHost} from '../extension-host/host.ts';
import {connectExtensionIdentities, getExtensionIdentities} from '../extension-host/loader-connections.ts';
import * as vmModules from '../extension-host/vm-modules.ts';
import {plusTrustedExtensions} from '../trusted-extensions.ts';

startTestFrame({
    window,
    catalogURL: 'https://kubohiroya.github.io/turbowarp-test/dist/turbowarp-test.js',
    catalog: plusTrustedExtensions.catalog,
    createVM(canvas, policy) {
        const vm = new VirtualMachine();
        vm.attachStorage(new ScratchStorage());
        vm.attachRenderer(new ScratchRender(canvas));
        policy.configureSecurityManager(vm.securityManager);
        const host = installPlusExtensionHost(vm, {
            enabled: true, document, locale: document.documentElement.lang || 'en', vmModules,
            trustedCatalog: plusTrustedExtensions.catalog,
            canLoadVerifiedCode: policy.canLoadCode, requestApproval: policy.requestApproval,
            showDiagnostics: false
        });
        if ('loader' in host) connectExtensionIdentities(vm, host.loader);
        return vm;
    },
    identities: getExtensionIdentities
});
