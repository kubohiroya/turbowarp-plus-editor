/**
 * What this distribution trusts.
 *
 * An extension listed in the catalog this build ships loads unsandboxed without a separate review,
 * the way TurboWarp treats its own gallery. That is a decision about what this distribution stands
 * behind, so it is made here rather than in the GUI, which only asks.
 *
 * A distributed single HTML cannot read the catalog — its CSP forbids the connection — so what the
 * catalog listed is embedded as digests when the HTML is built. Which digests those are is decided
 * here; checking them afterwards is the GUI's, because the HTML carries no integration to ask.
 *
 * Moved from the fork's `src/lib/tw-plus-trusted-extensions.js`; the behaviour is unchanged.
 */

import {parseExtensionCatalog} from '@kubohiroya/turbowarp-extension-security-dialog';

import {plusCatalog} from './plus-catalog.ts';

const SHA256 = /^[0-9a-f]{64}$/;
const empty = Object.freeze({urls: new Set(), digests: new Map(), listedDigests: new Set()});

// The catalog this distribution ships. A read that fails reaches the same place as a catalog that
// cannot be parsed: nothing is trusted, and the next check reads it again.
const readOwnCatalog = async signal => {
    const {catalog} = await plusCatalog.read(signal);
    if (!catalog) throw new Error('The distributed extension catalog is empty');
    return catalog;
};

/**
 * Extensions listed in the TurboWarp-Plus catalog are trusted like TurboWarp's official gallery:
 * they load unsandboxed without a separate review. Trust requires the listed URL, or the listed
 * SHA-256 for code embedded in a project. A catalog that cannot be read trusts nothing, and the
 * next check reads it again.
 * @param {object} options Host-owned catalog reader and timeout.
 * @returns {object} Trust checks for extension URLs and verified Loader code.
 */
export const createPlusTrustedCatalog = ({
    readCatalog = readOwnCatalog,
    timeoutMs = 15000
} = {}) => {
    let pending = null;
    // The digests the catalog lists, filled each time it is read and kept between reads: the
    // editor's cache files these as shared (no one project's), and reads this set at each write.
    const listedDigests = new Set();
    const load = () => {
        if (!pending) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            pending = Promise.resolve()
                .then(() => readCatalog(controller.signal))
                .then(data => {
                    const urls = new Set(parseExtensionCatalog(data).map(entry => entry.url));
                    const digests = new Map();
                    for (const item of data.extensions) {
                        if (typeof item.sha256 === 'string' && SHA256.test(item.sha256)) {
                            digests.set(new URL(item.url).href, item.sha256);
                        }
                    }
                    listedDigests.clear();
                    for (const digest of digests.values()) listedDigests.add(digest);
                    return {urls, digests, listedDigests: new Set(digests.values())};
                })
                .catch(() => {
                    pending = null;
                    return empty;
                })
                .finally(() => clearTimeout(timer));
        }
        return pending;
    };
    return Object.freeze({
        /**
         * What the catalog lists by digest, as one live set: empty until the catalog is first
         * read, then refilled on each read. A failed read leaves the last one in place.
         */
        listedDigests,
        /**
         * Wait for the catalog's read, starting it if no trust check has yet, so `listedDigests`
         * is filled. A read that fails settles too, and the next check reads again.
         * @returns {Promise<void>} Settles once the read has.
         */
        async ready () {
            await load();
        },
        /**
         * @param {string} url Extension URL from a project.
         * @returns {Promise<boolean>} True for a URL listed in the catalog.
         */
        async isTrustedURL (url) {
            return (await load()).urls.has(url);
        },
        /**
         * @param {object} code Loader code whose bytes were already checked against its SHA-256.
         * @returns {Promise<boolean>} True when the code is the catalog's listed code.
         */
        async isTrustedCode (code) {
            const {urls, digests, listedDigests} = await load();
            // Both remote forms name a URL; which of them decides only whether a copy may be kept
            // in the opener's browser, which has nothing to do with what this build stands behind.
            if (code.source && code.source.type.startsWith('remote-') && urls.has(code.source.url)) {
                const listed = digests.get(code.source.url);
                return !listed || listed === code.actualSHA256;
            }
            return listedDigests.has(code.actualSHA256);
        }
    });
};

export const plusTrustedCatalog = createPlusTrustedCatalog();

/**
 * @param {object} catalog Trust checks from createPlusTrustedCatalog.
 * @param {object} manifest Offline package manifest, whose sources are all embedded.
 * @returns {Promise<string[]>} Digests of the manifest's extensions that the catalog lists.
 */
export const listTrustedDigests = async (catalog, manifest) => {
    const listed = [];
    for (const spec of manifest.extensions) {
        if (await catalog.isTrustedCode({source: spec.source, actualSHA256: spec.sha256})) listed.push(spec.sha256);
    }
    return [...new Set(listed)];
};

/**
 * The two answers the GUI's trust socket asks for, as one object both of this distribution's
 * integrations supply: what the running editor trusts, and which digests a single HTML is built
 * with. Keeping them together is what makes the editor and the HTML trust the same list.
 */
export const plusTrustedExtensions = Object.freeze({
    catalog: plusTrustedCatalog,
    listDigests: manifest => listTrustedDigests(plusTrustedCatalog, manifest)
});
