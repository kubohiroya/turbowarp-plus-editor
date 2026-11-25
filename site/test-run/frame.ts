/**
 * The page the test run view's tests run in (issue #774). A page holds one VM that can load extensions through the
 * Loader, and in the editor's page that is the editor's VM, so the test VM gets this page of its own.
 *
 * Alongside the distributed catalog, each run may load exact sandboxed extension builds already approved and
 * committed in the editor. Standard extension URLs from the same snapshot still run in the iframe sandbox.
 */
import VirtualMachine from 'scratch-vm';
import ScratchRender from 'scratch-render';
import ScratchStorage from '@turbowarp/scratch-storage';
import {serveTestFrame} from '@kubohiroya/turbowarp-plus-editor-test/test-frame';
import type {ResolvedCode} from '@kubohiroya/turbowarp-extension-loader';
import {installPlusExtensionHost} from '../extension-host/host.ts';
import * as vmModules from '../extension-host/vm-modules.ts';
import {plusTrustedExtensions} from '../trusted-extensions.ts';

let allowedURLs: string[] = [];
let allowedSandboxed = new Map<string, string>();

const isApprovedSandboxed = (code: ResolvedCode) => code.execution === 'sandboxed' &&
    (code.source.type === 'embedded-file' || code.source.type === 'embedded-data') &&
    allowedSandboxed.get(code.id) === code.actualSHA256 && code.sha256 === code.actualSHA256;

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
    let hasRunPolicy = false;
    const options = {
        enabled: true, document, locale: document.documentElement.lang || 'en', vmModules,
        trustedCatalog: plusTrustedExtensions.catalog,
        canLoadVerifiedCode: async (code: ResolvedCode) =>
            isApprovedSandboxed(code) || await plusTrustedExtensions.catalog.isTrustedCode(code),
        requestApproval: async (code: ResolvedCode) => hasRunPolicy && isApprovedSandboxed(code),
        showDiagnostics: false
    };
    const host = installPlusExtensionHost(vm, options);
    // Earlier Loader releases cannot recheck the run's policy before using a remembered approval.
    hasRunPolicy = 'loader' in host && 'getLoadedExtensionIdentities' in host.loader;
    return vm;
};

serveTestFrame({
    window,
    origin: location.origin,
    getVm: createVm,
    prepare(context: {extensionURLs?: unknown; sandboxedExtensions?: unknown} | undefined) {
        const urls = Array.isArray(context?.extensionURLs) ? context.extensionURLs : [];
        allowedURLs = urls.filter((url): url is string => typeof url === 'string');
        allowedSandboxed = new Map();
        if (!Array.isArray(context?.sandboxedExtensions)) return;
        for (const entry of context.sandboxedExtensions) {
            if (typeof entry?.id === 'string' && typeof entry.sha256 === 'string' && /^[0-9a-f]{64}$/.test(entry.sha256)) {
                allowedSandboxed.set(entry.id, entry.sha256);
            }
        }
    }
});
