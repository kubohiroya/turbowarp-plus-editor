/**
 * What this distribution plugs into the Plus integration socket of the Packager builder.
 *
 * The builder is its own bundle and its own page: it has no editor chrome, no workspace and no
 * stage bar. So it is given only what it actually asks for — the catalog, which it reads to decide
 * whether building an HTML needs anyone's permission.
 *
 * Supplying the editor's integration here instead would pull the document editor and its packages
 * into this bundle, where nothing needs them and no loader is configured to parse them. Keeping
 * the two separate is what keeps the builder's bundle about building.
 */

import {plusCatalog} from './plus-catalog.js';

const integration = {extensionCatalog: plusCatalog};

/**
 * This distribution's integration for the builder.
 * @returns {object} The integration.
 */
export const plusIntegration = () => integration;
