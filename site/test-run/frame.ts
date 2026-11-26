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
import {TEST_EXTENSION_ID} from '@kubohiroya/turbowarp-plus-editor-test';
import type {ExtensionLoader, ResolvedCode} from '@kubohiroya/turbowarp-extension-loader';
import {installPlusExtensionHost} from '../extension-host/host.ts';
import * as vmModules from '../extension-host/vm-modules.ts';
import {plusTrustedExtensions, readTrustedExtensionBytes} from '../trusted-extensions.ts';

type SandboxedExtension = {id: string; sha256: string};
const testCatalogURL = 'https://kubohiroya.github.io/turbowarp-test/dist/turbowarp-test.js';
let extensionContext: {extensionURLs: string[]; sandboxedExtensions: SandboxedExtension[]; savedGeneration: boolean} = {
    extensionURLs: [], sandboxedExtensions: [], savedGeneration: false
};
const frameLoaders = new WeakMap<object, Pick<ExtensionLoader, 'getLoadedExtensionIdentities'>>();
let legacyTest: {url: string; verifiedUrl: string} | undefined;

const isEmbeddedSandboxed = (code: ResolvedCode) => code.execution === 'sandboxed' &&
    (code.source.type === 'embedded-file' || code.source.type === 'embedded-data') &&
    code.sha256 === code.actualSHA256;
const isApprovedSandboxed = (code: ResolvedCode) => isEmbeddedSandboxed(code) && extensionContext.sandboxedExtensions.some(entry =>
        entry.id === code.id && entry.sha256 === code.actualSHA256);
// Only the catalog-verified test extension needs direct VM access for a saved generation.
const canLoadCode = async (code: ResolvedCode) => {
    if (!extensionContext.savedGeneration)
        return isApprovedSandboxed(code) || await plusTrustedExtensions.catalog.isTrustedCode(code);
    if (code.id === TEST_EXTENSION_ID)
        return code.execution === 'unsandboxed' &&
            await plusTrustedExtensions.catalog.isTrustedURLDigest(testCatalogURL, code.actualSHA256);
    return isEmbeddedSandboxed(code);
};

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
    vm.securityManager.canLoadExtensionFromProject = (url: string) =>
        Promise.resolve(extensionContext.extensionURLs.includes(url));
    vm.securityManager.getSandboxMode = (url: string) =>
        Promise.resolve(legacyTest?.url === url ? 'unsandboxed' : 'iframe');
    const rewrite = vm.securityManager.rewriteExtensionURL.bind(vm.securityManager);
    vm.securityManager.rewriteExtensionURL = (url: string) =>
        legacyTest?.url === url ? Promise.resolve(legacyTest.verifiedUrl) : rewrite(url);
    const host = installPlusExtensionHost(vm, {
        enabled: true, document, locale: document.documentElement.lang || 'en', vmModules,
        trustedCatalog: plusTrustedExtensions.catalog,
        canLoadVerifiedCode: canLoadCode,
        requestApproval: async code => extensionContext.savedGeneration ? isEmbeddedSandboxed(code) : isApprovedSandboxed(code),
        showDiagnostics: false
    });
    if ('loader' in host) frameLoaders.set(vm, host.loader);
    return vm;
};

serveTestFrame({
    window,
    origin: location.origin,
    getVm: createVm,
    // Read the build identities committed by the test VM, not the Editor's currently loaded version.
    getLoadedBuilds: vm => frameLoaders.get(vm)?.getLoadedExtensionIdentities()
        .filter(({execution}) => execution === 'sandboxed')
        .map(({id, sha256}) => ({extensionId: id, sha256})),
    async prepare(context: {extensionURLs?: unknown; sandboxedExtensions?: unknown; savedGeneration?: unknown; testExtensionURL?: unknown}
        | undefined) {
        const urls = Array.isArray(context?.extensionURLs) ? context.extensionURLs : [];
        const extensions = Array.isArray(context?.sandboxedExtensions) ? context.sandboxedExtensions : [];
        extensionContext = {
            extensionURLs: urls.filter((url): url is string => typeof url === 'string'),
            savedGeneration: context?.savedGeneration === true,
            sandboxedExtensions: extensions.filter((entry): entry is SandboxedExtension =>
                typeof entry?.id === 'string' && typeof entry.sha256 === 'string' && /^[0-9a-f]{64}$/.test(entry.sha256))
        };
        if (legacyTest) URL.revokeObjectURL(legacyTest.verifiedUrl);
        legacyTest = undefined;
        const url = context?.testExtensionURL;
        if (extensionContext.savedGeneration && url !== undefined) {
            if (typeof url !== 'string' || (url !== testCatalogURL && !url.startsWith('data:')))
                throw new Error('The saved test extension does not match the trusted catalog.');
            const bytes = await readTrustedExtensionBytes(testCatalogURL, url);
            legacyTest = {url, verifiedUrl: URL.createObjectURL(new Blob([bytes], {type: 'text/javascript'}))};
        }
    }
});
