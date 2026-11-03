/**
 * What a project's open review learns about its Plus extensions, and what it answers about them.
 *
 * Two pieces of this distribution meet over one load: the Plus host, which knows the project's
 * manifest and drives the Loader, and the review in front of the VM's extension loading, which asks
 * the person. The GUI installs each of them separately and knows nothing of what passes between, so
 * they meet here, keyed by the VM, for the length of one load and no longer.
 */

const pending = new WeakMap();

/**
 * Open the channel for one load: the review may read `manifest` and writes its answer back.
 * @param {object} vm The VM being loaded.
 * @param {object} manifest The project's Plus manifest.
 * @returns {object} The channel, whose `decisions` the review fills in.
 */
export const openPlusReview = (vm, manifest) => {
    const channel = {manifest, decisions: null};
    pending.set(vm, channel);
    return channel;
};

/**
 * The channel of the load in progress, if a Plus host opened one.
 * @param {object} vm The VM being loaded.
 * @returns {object|null} The channel, or null when no Plus rows are waiting.
 */
export const pendingPlusReview = vm => pending.get(vm) || null;

/**
 * Close a channel; a later load opens its own.
 * @param {object} vm The VM that was loaded.
 * @param {object} channel The channel `openPlusReview` returned.
 */
export const closePlusReview = (vm, channel) => {
    if (pending.get(vm) === channel) pending.delete(vm);
};
