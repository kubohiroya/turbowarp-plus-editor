/**
 * The extension host as the editor gets it: the wiring, plus the authoring controller.
 *
 * The controller is what the extension library reaches to add, configure or remove a project's
 * extensions. A built single HTML plays a project and has no library, so its entry
 * (`runtime.js`) supplies none and never pulls the controller into its bundle. That is the whole
 * reason the factory is passed in rather than imported by `host.js`.
 *
 * Whether extension loading runs at all, and the archive limits it reads a project with, are also
 * decided here: the GUI hands over the query it snapshotted before any project was opened, and
 * this build says what that query means. So is the origin a project's default address is made
 * from: the page this editor was opened at.
 */

import {readPlusFlags} from '../extension-library/flags.js';
import {createExtensionAuthoringController, setExtensionAuthoringHost} from './authoring.js';
import {extensionProjectArchiveOptions} from './config.js';
import {installPlusExtensionHost} from './host.js';

/**
 * Install extension loading for the editor's VM.
 * @param {object} vm The VM the GUI passed.
 * @param {object} [settings] What the GUI handed through the socket.
 * @returns {object} The installed host.
 */
export const installEditorExtensionHost = (vm, settings = {}) => installPlusExtensionHost(vm, {
    // A project's default address is made from where this editor was opened, never from a
    // constant, so a copy served elsewhere names its projects under its own origin.
    createAuthoring: (target, options) => createExtensionAuthoringController(target,
        {...options, origin: globalThis.location?.origin}),
    setAuthoringHost: setExtensionAuthoringHost,
    archiveOptions: extensionProjectArchiveOptions,
    ...settings,
    enabled: settings.enabled === undefined ? readPlusFlags(settings.search || '').loader : settings.enabled
});
