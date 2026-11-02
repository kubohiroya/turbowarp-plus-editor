/**
 * What this distribution plugs into the GUI's Plus integration socket.
 *
 * The fork keeps an empty `src/lib/tw-plus-integration.js` and the hooks that consult it; this
 * file is what the site build puts in its place, so the family's packages belong to this
 * repository rather than to the fork. The build replaces the module instead of setting a global:
 * a global would have to be written before the GUI mounts, which makes the wiring depend on load
 * order, while a replacement is resolved when the bundle is built.
 *
 * It supplies nothing yet, on purpose. Returning null is what the fork's own module returns, so
 * every hook falls back to what the GUI does today and this build behaves exactly as before.
 * Proving that the boundary carries that unchanged behaviour is the whole point of this step:
 * features move across it one at a time, and at no point does the GUI stop running.
 *
 * @returns {object|null} This distribution's integration, or null while it supplies none.
 */
export const plusIntegration = () => null;
