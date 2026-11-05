/**
 * The switches this distribution reads once, at startup.
 *
 * Moved from the fork's `src/config/feature-flags.js`. Which URL switch shows the Plus library,
 * and which one turns extension loading on, are decisions about this build. They are read once:
 * reload the editor to change them, so no project can turn either on by being opened.
 *
 * The loader switch is also read by the fork, for its own Packager wiring, so the rule is stated in
 * both places for now. It stops being duplicated when that wiring follows this move.
 */

/**
 * Read both switches from a startup query.
 * @param {string} search The query, with or without its leading `?`.
 * @returns {object} `loader` (on by default, explicit opt-out, legacy opt-in) and `library`
 * (asked for, or implied by the loader being on).
 */
export const readPlusFlags = (search = '') => {
    const parameters = new URLSearchParams(search);
    const loaderValue = parameters.get('twPlusExtensionLoader');
    const loader = loaderValue === null || loaderValue === '1';
    return {loader, library: loader || parameters.get('twPlusExtensions') === '1'};
};

// Read at module load, so this must not be able to throw: a build with no window, or one whose
// window has no location yet, starts with every switch at its default instead of failing to load.
const startup = readPlusFlags(typeof window === 'undefined' ? '' : window.location?.search || '');

export const PLUS_EXTENSION_LOADER_ENABLED = startup.loader;
export const PLUS_LIBRARY_ENABLED = startup.library;
