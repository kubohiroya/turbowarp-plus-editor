/**
 * Write a project out as a single HTML.
 *
 * Moved from the fork's `src/lib/tw-plus-packager.js`. It configures an actual TurboWarp Packager
 * instance, which arrives as an argument: the upstream Packager stays an upstream dependency this
 * repository pins and checks out, and nothing here imports it.
 *
 * What this decides is this distribution's: which runtime bundle the HTML carries, which digests
 * travel with it, the archive limits it states, and the bootstrap that installs extension loading
 * in the recipient's player.
 */

import {restrictOfflineHTML} from '@kubohiroya/turbowarp-extension-loader/packager';

import {extensionProjectArchiveOptions} from '../extension-host/config.ts';

const failure = (code, message) => Object.assign(new Error(message), {code});
const SHA256 = /^[0-9a-f]{64}$/;

/**
 * Configure an actual TurboWarp Packager instance with a verified offline bundle.
 * The bootstrap is supplied by the trusted build, never by project metadata.
 */
export function configurePlusPackager(packager, prepared, {
    runtimeBundle, locale = 'ja', scaffoldingAssets, trustedDigests = []
}: {runtimeBundle?: string; locale?: string; scaffoldingAssets?: Record<string, string>; trustedDigests?: string[]} = {}) {
    if (!prepared?.offline || !(prepared.projectBytes instanceof Uint8Array) ||
        !prepared.manifest || !packager?.options || typeof packager.package !== 'function') {
        throw failure('INVALID_PACKAGE', 'A verified offline Plus bundle and Packager instance are required');
    }
    if (typeof runtimeBundle !== 'string' || !runtimeBundle.trim()) {
        throw failure('MISSING_BOOTSTRAP', 'The host must bundle the Loader, VM registrar and permission UI');
    }
    // Digests of catalog-listed extensions let the recipient run them without approval, as in the Editor.
    const digests = new Set(prepared.manifest.extensions.map(spec => spec.sha256));
    if (!Array.isArray(trustedDigests) ||
        trustedDigests.some(digest => typeof digest !== 'string' || !SHA256.test(digest) || !digests.has(digest))) {
        throw failure('INVALID_TRUSTED_DIGESTS', 'Trusted digests must be SHA-256 digests of the packaged extensions');
    }
    if (packager.used) throw failure('PACKAGE_BUSY', 'Packager was already used');
    if (packager.options.custom?.js?.trim()) {
        throw failure('UNREVIEWED_CUSTOM_CODE', 'Custom JavaScript must be reviewed separately from Plus extension packaging');
    }
    if (scaffoldingAssets) {
        const inlineAssets = {};
        for (const name of ['scaffolding', 'scaffolding-min', 'addons']) {
            if (typeof scaffoldingAssets[name] !== 'string' || !scaffoldingAssets[name]) {
                throw failure('MISSING_SCAFFOLDING', `Trusted patched scaffolding asset is missing: ${name}`);
            }
            // The upstream Packager rewrites raw closing tags assuming single-quoted
            // literals. Escape the slash first so double-quoted iframe bootstraps survive.
            inlineAssets[name] = scaffoldingAssets[name].replace(/<\/script/gi, '<\\/script');
        }
        packager.fetchLargeAsset = async name => {
            if (!Object.prototype.hasOwnProperty.call(scaffoldingAssets, name)) {
                throw failure('UNBUNDLED_DEPENDENCY', `Packager asset is not bundled: ${name}`);
            }
            return inlineAssets[name];
        };
    }
    const analysis = packager.project?.analysis || {
        stageVariables: [], stageComments: [], usesMusic: true, usesSteamworks: false, extensions: []
    };
    packager.project = {
        // Keeping the SB3 opaque allows the same Loader codec to validate its embedded entries.
        type: 'blob',
        arrayBuffer: prepared.projectBytes.slice().buffer,
        analysis: {...analysis, extensions: []}
    };
    const script = runtimeBundle.replace(/<\/script/gi, '<\\/script');
    // The limits travel with the HTML: the runtime bundle no longer holds a copy of them.
    const options = JSON.stringify({enabled: true, locale, trustedDigests,
        archiveOptions: extensionProjectArchiveOptions}).replace(/</g, '\\u003c');
    packager.options.target = 'html';
    packager.options.cloudVariables = {...packager.options.cloudVariables, mode: 'none'};
    packager.options.custom = {...packager.options.custom, js: `
${script}
(function() {
    let ready = false;
    const originalLoad = vm.loadProject;
    vm.loadProject = function(...args) {
        if (!ready) return Promise.reject(new Error('Plus runtime bootstrap did not complete'));
        return originalLoad.apply(this, args);
    };
    const runtime = globalThis.TurboWarpPlusExtensionHost;
    if (!runtime || typeof runtime.installPlusExtensionHost !== 'function') {
        throw new Error('Trusted Plus runtime is missing');
    }
    const host = runtime.installPlusExtensionHost(vm, ${options});
    if (!host || host.enabled !== true) throw new Error('Plus runtime is disabled');
    globalThis.__TW_PLUS_PACKAGE_HOST__ = host;
    ready = true;
})();`};
    return packager;
}

/** Generate one HTML file; restrictive CSP prevents runtime remote resource dependencies. */
export async function packagePlusHTML(packager, prepared, options) {
    configurePlusPackager(packager, prepared, options);
    const result = await packager.package();
    if (result.type !== 'text/html' || (typeof result.data !== 'string' && !(result.data instanceof Uint8Array))) {
        throw failure('INVALID_PACKAGE_OUTPUT', 'Packager did not return a single HTML document');
    }
    const html = typeof result.data === 'string' ? result.data : new TextDecoder('utf-8', {fatal: true}).decode(result.data);
    const restricted = restrictOfflineHTML(html);
    return {...result, data: typeof result.data === 'string' ? restricted : new TextEncoder().encode(restricted)};
}
