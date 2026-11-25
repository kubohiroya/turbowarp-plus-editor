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
export default createCatalogLibrary({catalog: plusCatalog, readSettings: readPlusCatalogSettings,
    applySettings: applyPlusCatalogSettings, loadExtensions: loadPlusExtensions,
    published: {
        resolve: resolvePublishedExtension,
        async add(vm, {distribution, bytes, sourceURL}, options) {
            const host = getExtensionAuthoringHost(vm);
            if (!host) throw new Error('Extension authoring is unavailable');
            await host.add({id: distribution.id, execution: distribution.execution, version: distribution.version, bytes,
                source: {type: 'embedded-file', ...(sourceURL ? {url: sourceURL} : {})}}, options);
        }
    },
    loaderEnabled: PLUS_EXTENSION_LOADER_ENABLED, isRetryable: isWorthAskingAgain, styles});
