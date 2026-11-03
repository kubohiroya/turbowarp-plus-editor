import {hostExtensionLoadErrors, hostIntegration} from './tw-plus-integration-points.js';

const failures = new WeakSet();

/**
 * Mark an error raised while a project's extensions were loading, keeping its identity and code.
 * @param {unknown} error The rejection from extension loading.
 * @returns {object} The marked error, or an Error wrapping a value that is not an object.
 */
export const markExtensionLoadFailure = error => {
    const marked = error !== null && typeof error === 'object' ? error : new Error(String(error));
    failures.add(marked);
    return marked;
};

export const isExtensionLoadFailure = error => error !== null && typeof error === 'object' && failures.has(error);

// Formatting must not replace a load failure with a secondary presentation error.
export const describeExtensionLoadFailure = (error, integration = hostIntegration()) => {
    try {
        return hostExtensionLoadErrors(integration)?.describe?.(error) || error;
    } catch (formatError) {
        return error;
    }
};
