/**
 * What a distributed single HTML runs its extensions through.
 *
 * `scripts/site/build-extension-runtime.cts` builds this into the bundle the built HTML carries,
 * and the HTML's bootstrap calls `installPlusExtensionHost` with the options the build embedded.
 * There is no integration to ask inside a distributed file, so this is where the VM modules are
 * filled in from the copy the bundle was built with.
 */

import {installPlusExtensionHost as install} from './host.js';
import * as vmModules from './vm-modules.js';

/**
 * Install extension loading for a built HTML's VM.
 * @param {object} vm The VM the built HTML created.
 * @param {object} [options] What the build embedded: enabled, locale, digests, archive limits.
 * @returns {object} The installed host.
 */
export const installPlusExtensionHost = (vm, options = {}) => install(vm, {vmModules, ...options});
