/* global __TW_PLUS_LOCAL_CATALOG__ */

/**
 * The extension catalog this distribution ships.
 *
 * Which catalog a build trusts is a distribution decision: the address, whether a locally built
 * one replaces it while previewing, and which display images may be shown. The GUI fork asks for
 * this through its integration socket and parses the document itself, so nothing of the review UI
 * is needed here.
 *
 * Images are only ever the trusted build's own bytes. A project cannot contribute one, and neither
 * can the catalog's remote metadata, so they are checked here — the side that produced them —
 * rather than being taken on faith further down.
 */

export const CATALOG_URL = 'https://kubohiroya.github.io/turbowarp-plus-packages/extensions-v1.json';

// Set by the site build only for an explicit local preview; absent in a normal distribution.
const preview = typeof __TW_PLUS_LOCAL_CATALOG__ === 'undefined' ? null : __TW_PLUS_LOCAL_CATALOG__;

const DATA_SVG = /^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+={0,2}$/;

/**
 * Keep only images this build can vouch for: an SVG data URL, for an id the catalog lists.
 * @param {object} catalog The catalog document.
 * @param {object} icons The images the preview input carried.
 * @returns {object} The images that passed.
 */
const checkedIcons = (catalog, icons) => {
    const listed = new Set((catalog?.extensions || []).map(entry => entry && entry.id));
    const checked = {};
    for (const [id, value] of Object.entries(icons || {})) {
        if (!listed.has(id) || typeof value !== 'string' || !DATA_SVG.test(value)) {
            throw new Error(`The preview supplied an image this build cannot vouch for: ${id}`);
        }
        checked[id] = value;
    }
    return checked;
};

/**
 * Fetch the distributed catalog. Credentials are omitted: this is public metadata, and sending any
 * would make the request depend on whoever is signed in.
 * @param {AbortSignal} signal Cancels the request.
 * @returns {Promise<object>} The catalog document.
 */
const fetchCatalog = async signal => {
    const response = await fetch(CATALOG_URL, {signal, credentials: 'omit'});
    if (!response.ok) throw new Error(`The TurboWarp-Plus catalog returned HTTP ${response.status}`);
    return response.json();
};

/**
 * Build the catalog this distribution answers with.
 * @param {object} [options] `localCatalog` and `fetch` for tests; the defaults are the real ones.
 * @returns {object} `url` and `read(signal)`.
 */
export const createPlusCatalog = ({localCatalog = preview, fetchDocument = fetchCatalog} = {}) => ({
    // Null while previewing, because the document then comes from the build rather than an address.
    url: localCatalog ? null : CATALOG_URL,
    async read (signal) {
        if (!localCatalog) return {catalog: await fetchDocument(signal), icons: {}};
        if (signal?.aborted) {
            throw Object.assign(new Error('Catalog loading cancelled'), {code: 'CANCELLED'});
        }
        return {catalog: localCatalog.catalog, icons: checkedIcons(localCatalog.catalog, localCatalog.icons)};
    }
});

export const plusCatalog = createPlusCatalog();
