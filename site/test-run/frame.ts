/**
 * The page the test run view's tests run in (issue #774). A page holds one VM that can load extensions through the
 * Loader, and in the editor's page that is the editor's VM, so the test VM gets this page of its own.
 *
 * It loads the Plus extensions the distributed catalog lists, as the editor does without asking, and the standard
 * extensions the editor runs now, in the sandbox. It asks about nothing: anything else stays unloaded, and the
 * tests that need it fail and say so.
 */
import VirtualMachine from 'scratch-vm';
import ScratchRender from 'scratch-render';
import ScratchStorage from '@turbowarp/scratch-storage';
import {serveTestFrame} from '@kubohiroya/turbowarp-plus-editor-test/test-frame';
import {installPlusExtensionHost} from '../extension-host/host.ts';
import * as vmModules from '../extension-host/vm-modules.ts';
import {plusTrustedExtensions} from '../trusted-extensions.ts';

let allowedURLs: string[] = [];

const createVm = () => {
    document.documentElement.style.cssText = 'height: 100%;';
    document.body.style.cssText = 'margin: 0; height: 100%; overflow: hidden;';
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width: 100%; height: 100%; display: block;';
    document.body.append(canvas);
    const vm = new VirtualMachine();
    vm.attachStorage(new ScratchStorage());
    vm.attachRenderer(new ScratchRender(canvas));
    // Sounds stay silent: there is no audio engine.
    vm.securityManager.canLoadExtensionFromProject = (url: string) => Promise.resolve(allowedURLs.includes(url));
    vm.securityManager.getSandboxMode = () => Promise.resolve('iframe');
    installPlusExtensionHost(vm, {
        enabled: true, document, locale: document.documentElement.lang || 'en', vmModules,
        trustedCatalog: plusTrustedExtensions.catalog,
        requestApproval: async () => false,
        showDiagnostics: false
    });
    return vm;
};

serveTestFrame({
    window,
    origin: location.origin,
    getVm: createVm,
    prepare(context: {extensionURLs?: unknown} | undefined) {
        const urls = Array.isArray(context?.extensionURLs) ? context.extensionURLs : [];
        allowedURLs = urls.filter((url): url is string => typeof url === 'string');
    }
});
