/** The distributed catalog is this build's trust policy; verification and caching belong to Loader. */
import {parseExtensionCatalog} from '@kubohiroya/turbowarp-extension-security-dialog';
import {createTrustedCatalog, listTrustedDigests} from '@kubohiroya/turbowarp-extension-loader/catalog-trust';
import {plusCatalog} from './plus-catalog.ts';

export {listTrustedDigests} from '@kubohiroya/turbowarp-extension-loader/catalog-trust';
export const createPlusTrustedCatalog = ({readCatalog = async signal => (await plusCatalog.read(signal)).catalog,
    timeoutMs = 15000} = {}) => createTrustedCatalog({readCatalog, parseCatalog: parseExtensionCatalog, timeoutMs});
export const plusTrustedCatalog = createPlusTrustedCatalog();
export const plusTrustedExtensions = Object.freeze({
    catalog: plusTrustedCatalog,
    listDigests: manifest => listTrustedDigests(plusTrustedCatalog, manifest)
});
