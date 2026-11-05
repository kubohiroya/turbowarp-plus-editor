/**
 * What a distributed single HTML runs its extensions through.
 *
 * `scripts/site/build-extension-runtime.cts` builds this into the bundle the built HTML carries,
 * and the HTML's bootstrap calls `installPlusExtensionHost` with the options the build embedded.
 * There is no integration to ask inside a distributed file, so this is where the VM modules are
 * filled in from the copy the bundle was built with.
 */

import {installPlusExtensionHost as install} from './host.ts';
import * as vmModules from './vm-modules.ts';

/**
 * Install extension loading for a built HTML's VM.
 * @param {object} vm The VM the built HTML created.
 * @param {object} [options] What the build embedded: enabled, locale, digests, archive limits.
 * @returns {object} The installed host.
 */
export const installPlusExtensionHost = (vm, options = {}) =>
    // No authoring controller is supplied: a built HTML plays a project, and the library that would
    // add an extension to one is not in it. That absence is what keeps the controller, and the
    // packages behind it, out of this bundle.
    install(vm, {vmModules, ...options});
