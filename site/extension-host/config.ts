/**
 * The limits this distribution applies when reading a project's embedded extensions.
 *
 * Moved from the fork's `src/config/extension-project-limits.js`. What size of project this build
 * accepts is a decision about the distribution; the fork read the same numbers only because its
 * Packager wiring did, and that wiring is here now too.
 */

// Legacy projects can embed large JavaScript bundles in project.json.
const projectBytes = 64 * 1024 * 1024;
export const extensionProjectArchiveOptions = Object.freeze({
    maxProjectBytes: projectBytes,
    maxEntryBytes: projectBytes
});
