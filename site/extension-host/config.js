/**
 * The limits this distribution applies when reading a project's embedded extensions.
 *
 * Moved from the fork's `src/config/extension-project-limits.js`. What size of project this build
 * accepts is a decision about the distribution; the fork read the same numbers only because its
 * Packager wiring did, and that wiring is here now too.
 */

// Legacy projects can embed large JavaScript bundles in project.json.
// Allow 24 MiB legacy documents while retaining archive, total, ratio and code bounds.
export const extensionProjectArchiveOptions = Object.freeze({
    maxProjectBytes: 32 * 1024 * 1024,
    maxEntryBytes: 32 * 1024 * 1024
});
