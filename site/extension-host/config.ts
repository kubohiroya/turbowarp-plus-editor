/**
 * The limits this distribution applies when reading a project's embedded extensions.
 *
 * Moved from the fork's `src/config/extension-project-limits.js`. What size of project this build
 * accepts is a decision about the distribution; the fork read the same numbers only because its
 * Packager wiring did, and that wiring is here now too.
 */

const MiB = 1024 * 1024;
// Legacy projects can embed large JavaScript bundles in project.json.
const projectBytes = 64 * MiB;
export const extensionProjectArchiveOptions = Object.freeze({
    maxProjectBytes: projectBytes,
    maxEntryBytes: projectBytes
});

/**
 * The most the Editor opens even when the person agrees to a larger project (issue #428).
 *
 * A project over the limits above is opened only after the person is shown its size and agrees,
 * once, for that load. Nothing in the address can raise either limit, so a link cannot take
 * away the ZIP bomb protection: the compression ratio, entry count and actual expansion checks
 * keep the Loader's defaults.
 */
const ceilingBytes = 256 * MiB;
export const confirmedProjectArchiveOptions = Object.freeze({
    maxArchiveBytes: ceilingBytes,
    maxTotalBytes: ceilingBytes,
    maxProjectBytes: ceilingBytes,
    maxEntryBytes: ceilingBytes
});
