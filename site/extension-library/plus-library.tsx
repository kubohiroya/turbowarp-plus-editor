import {createCatalogLibrary} from '@kubohiroya/turbowarp-extension-security-dialog/catalog-library';
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
    loaderEnabled: PLUS_EXTENSION_LOADER_ENABLED, isRetryable: isWorthAskingAgain, styles});
