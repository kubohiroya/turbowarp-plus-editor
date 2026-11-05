/**
 * The VM modules the registrar needs, taken from the VM this build carries.
 *
 * Only the runtime bundle for a distributed single HTML imports this. That bundle is the one place
 * where there is no GUI to ask: the HTML's VM is TurboWarp's own scaffolding bundle, which exposes
 * an extension service port instead of sharing a module cache, so bundling these utilities here is
 * both safe and necessary. The editor never reaches this file — its GUI passes its own instances,
 * and `registrar.ts` says why that distinction matters.
 */

export {default as ScratchCommon} from 'scratch-vm/src/extension-support/tw-extension-api-common.js';
export {default as createTranslate} from 'scratch-vm/src/extension-support/tw-l10n.js';
export {default as staticFetch} from 'scratch-vm/src/util/tw-static-fetch.js';
export {default as dispatch} from 'scratch-vm/src/dispatch/central-dispatch.js';
