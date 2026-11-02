/**
 * What the library reads and writes about a project's extensions.
 *
 * Moved from the fork's `src/lib/tw-plus-catalog-authoring.js`. It reaches the authoring
 * controller the installed host made, which is now on this side too.
 */

import {getExtensionAuthoringHost} from '../extension-host/authoring.js';

/**
 * Read actual VM modes and Loader-owned persistence.
 * @param {object} vm Owning VM.
 * @param {Array<object>} entries Catalog entries.
 * @returns {Promise<object>} Current execution and distribution maps.
 */
export const readPlusCatalogSettings = async (vm, entries) => {
    const authoring = getExtensionAuthoringHost(vm);
    const manifest = authoring ? await authoring.inspect() : null;
    const saved = new Map((manifest?.extensions || []).map(spec => [spec.id, spec]));
    const choices = new Map();
    const distributions = new Map();
    for (const entry of entries) {
        const spec = saved.get(entry.id);
        if (spec) distributions.set(entry.id, spec.source.type);
        if (!vm.extensionManager.isExtensionLoaded(entry.id)) continue;
        // The VM adapter owns this service-name interpretation; UI state never decides privilege.
        const service = vm.extensionManager._loadedExtensions.get(entry.id);
        const mode = typeof service === 'string' ? service.startsWith('unsandboxed.') ? 'unsandboxed' :
            service.startsWith('extension.') ? 'sandboxed' : null : null;
        if (mode) choices.set(entry.url, mode);
        if (!spec) distributions.set(entry.id, 'remote');
    }
    return {choices, distributions};
};

/**
 * Apply a dependency-ordered selection in one host transaction.
 * @param {object} vm Owning VM.
 * @param {object} selection Reviewed catalog settings.
 * @returns {Promise<Array<string>>} Available extension IDs.
 */
export const applyPlusCatalogSettings = async (vm, selection, {signal} = {}) => {
    const authoring = getExtensionAuthoringHost(vm);
    if (!authoring) {
        throw Object.assign(new Error('Enable the Plus extension Loader before changing distribution'),
            {code: 'LOADER_DISABLED'});
    }
    const requests = [];
    for (const entry of selection.entries) {
        const execution = selection.choices.get(entry.url);
        if (!['sandboxed', 'unsandboxed'].includes(execution)) {
            throw Object.assign(new Error(`Choose an execution mode for ${entry.id}`), {code: 'MISSING_EXECUTION'});
        }
        requests.push({id: entry.id,
            url: entry.url,
            execution,
            distribution: selection.distributions.get(entry.id) || 'remote',
            dependencies: entry.dependencies || [],
            version: entry.metadata?.version});
    }
    if (!requests.length) return [];
    await authoring.configure(requests, {signal});
    return requests.map(request => request.id);
};
