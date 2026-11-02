/**
 * Reach the pinned GUI checkout these tests run against.
 *
 * The extension host is supplied from this repository, but what it installs on is the VM the
 * pinned GUI carries, and the registration it drives must use that VM's own module instances. So
 * these tests take the VM, the DOM and the GUI's own modules from `.host/scratch-gui` — the same
 * checkout the build uses — rather than from this repository's dependencies.
 *
 * There is no skipping: a suite that quietly does nothing would make this move look verified when
 * it is not. With no checkout the suite says what to prepare and stops.
 */

import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const configured = process.env.E2E_GUI_ROOT;
const fallback = path.resolve('.host/scratch-gui');
const root = configured && path.isAbsolute(configured) ? configured :
    fs.existsSync(path.join(fallback, 'package.json')) ? fallback : null;
if (!root) {
    throw new Error('The extension host tests need the pinned GUI: set E2E_GUI_ROOT, ' +
        'or check it out at .host/scratch-gui (see scripts/site/source.ts)');
}

/** The pinned checkout itself, for tests that read its installed browser artifacts by path. */
export const guiRoot = root;

/** Require a module from the pinned checkout, so the VM and its utilities are that VM's. */
export const guiRequire = createRequire(path.join(root, 'package.json'));

/**
 * Import a module of the pinned GUI's own source by repository path.
 * @param {string} file Path inside the checkout, such as `src/lib/tw-plus-extension-host.js`.
 * @returns {Promise<object>} The module.
 */
export const guiImport = file => import(pathToFileURL(path.join(root, file)).href);

/** The VM modules the registrar needs, as the pinned GUI's own instances. */
export const vmModules = {
    ScratchCommon: guiRequire('scratch-vm/src/extension-support/tw-extension-api-common.js'),
    createTranslate: guiRequire('scratch-vm/src/extension-support/tw-l10n.js'),
    staticFetch: guiRequire('scratch-vm/src/util/tw-static-fetch.js'),
    dispatch: guiRequire('scratch-vm/src/dispatch/central-dispatch.js')
};
