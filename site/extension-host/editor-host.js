/**
 * The extension host as the editor gets it: the wiring, plus the authoring controller.
 *
 * The controller is what the extension library reaches to add, configure or remove a project's
 * extensions. A built single HTML plays a project and has no library, so its entry
 * (`runtime.js`) supplies none and never pulls the controller into its bundle. That is the whole
 * reason the factory is passed in rather than imported by `host.js`.
 */

import {createExtensionAuthoringController, setExtensionAuthoringHost} from './authoring.js';
import {installPlusExtensionHost} from './host.js';

/**
 * Install extension loading for the editor's VM.
 * @param {object} vm The VM the GUI passed.
 * @param {object} [settings] What the GUI handed through the socket.
 * @returns {object} The installed host.
 */
export const installEditorExtensionHost = (vm, settings = {}) => installPlusExtensionHost(vm, {
    createAuthoring: createExtensionAuthoringController,
    setAuthoringHost: setExtensionAuthoringHost,
    ...settings
});
