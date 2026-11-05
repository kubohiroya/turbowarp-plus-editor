import {isExtensionSecurityCancelled} from '@kubohiroya/turbowarp-extension-security-dialog/turbowarp';

const walk = (error, visit, depth = 0, seen = new Set()) => {
    if (depth > 4 || seen.has(error)) return;
    seen.add(error);
    visit(error, depth);
    if (error === null || typeof error !== 'object') return;
    if (Array.isArray(error.errors)) error.errors.forEach(inner => walk(inner, visit, depth + 1, seen));
    if (typeof error.cause !== 'undefined') walk(error.cause, visit, depth + 1, seen);
};

/**
 * Describe the failure for the project error dialog: which extension failed, and every cause.
 * @param {object} error A marked extension load failure.
 * @returns {Error} An error whose message carries the details the original message lacks.
 */
export const describeExtensionLoadFailure = error => {
    const ids = new Set();
    const lines = [];
    walk(error, (item, depth) => {
        if (item && typeof item.extensionId === 'string') ids.add(item.extensionId);
        const code = item && typeof item.code === 'string' ? ` [${item.code}]` : '';
        lines.push(`${'  '.repeat(depth)}${String(item)}${code}`);
    });
    const subject = ids.size ? `Extension ${[...ids].join(', ')}` : 'An extension';
    const described = new Error([`${subject} could not be loaded, so the project was not opened.`, ...lines].join('\n'),
        {cause: error});
    described.name = 'ExtensionLoadError';
    described.stack = error.stack;
    return described;
};

export const extensionLoadErrors = Object.freeze({
    describe: describeExtensionLoadFailure,
    isCancelled: error => Boolean(error) && (['TRUST_DENIED', 'CANCELLED'].includes(error.code) ||
        isExtensionSecurityCancelled(error))
});
