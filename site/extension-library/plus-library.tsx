import {withPaletteExtensionActivation} from '@kubohiroya/turbowarp-plus-editor-code-views/palette-category-visibility';
import {createCatalogLibrary} from '@kubohiroya/turbowarp-extension-security-dialog/catalog-library';
import {resolvePublishedExtension} from '@kubohiroya/sb3-toolchain/web-distribution';
import {getExtensionAuthoringHost} from '@kubohiroya/turbowarp-extension-loader/scratch-vm';
import {isWorthAskingAgain} from '@kubohiroya/turbowarp-extension-loader';
import '@kubohiroya/turbowarp-extension-security-dialog/webpack4.css';
import styles from '@kubohiroya/turbowarp-extension-security-dialog/catalog-library.css';
import {plusCatalog} from '../plus-catalog.ts';
import {applyPlusCatalogSettings, readPlusCatalogSettings} from './catalog-settings.ts';
import {PLUS_EXTENSION_LOADER_ENABLED} from './flags.ts';
import loadPlusExtensions from './load-extensions.ts';

export {reviewRows} from '@kubohiroya/turbowarp-extension-security-dialog/catalog-library';
export const createPlusLibrary = (onExtensionsEnabled?: (vm: object, extensionIds: readonly string[]) => void) =>
    createCatalogLibrary({catalog: plusCatalog, readSettings: readPlusCatalogSettings,
        applySettings: (vm, selection, options) => withPaletteExtensionActivation(vm, selection.entries.map(({id}) => id),
            () => applyPlusCatalogSettings(vm, selection, options), onExtensionsEnabled, options.signal),
        loadExtensions: (vm, entries, modes, permissions) => withPaletteExtensionActivation(vm, entries.map(({id}) => id),
            () => loadPlusExtensions(vm, entries, modes, permissions), onExtensionsEnabled),
        published: {
            allowReferenceAliases: true,
            resolve: resolvePublishedExtension,
            async add(vm, {distribution, bytes, sourceURL}, options) {
                const host = getExtensionAuthoringHost(vm);
                if (!host) throw new Error('Extension authoring is unavailable');
                await withPaletteExtensionActivation(vm, [distribution.id], () => host.add({id: distribution.id,
                    execution: distribution.execution, version: distribution.version, bytes,
                    source: {type: 'embedded-file', ...(sourceURL ? {url: sourceURL} : {})}}, options),
                onExtensionsEnabled, options.signal);
            }
        },
        loaderEnabled: PLUS_EXTENSION_LOADER_ENABLED, isRetryable: isWorthAskingAgain, styles});

export default createPlusLibrary();
