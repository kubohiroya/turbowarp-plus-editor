/**
 * The extension host as the editor gets it: the wiring, plus the authoring controller.
 *
 * The controller is what the extension library reaches to add, configure or remove a project's
 * extensions. A built single HTML plays a project and has no library, so its entry
 * (`runtime.ts`) supplies none and never pulls the controller into its bundle. That is the whole
 * reason the factory is passed in rather than imported by `host.ts`.
 *
 * Whether extension loading runs at all, and the archive limits it reads a project with, are also
 * decided here: the GUI hands over the query it snapshotted before any project was opened, and
 * this build says what that query means. So is the origin a project's default address is made
 * from: the page this editor was opened at.
 *
 * So is the cache a fetched extension is kept in (issue #55): the editor keeps one in IndexedDB so
 * a copy its author allowed survives a reload, filed under the project open when it was fetched.
 * A built HTML carries its code with it, needs no copy, and keeps the memory cache `host.ts` makes;
 * this is the only module that imports the IndexedDB adapter, so it stays out of that bundle.
 */

import {createIndexedDBContentCache} from '@kubohiroya/turbowarp-extension-loader/indexeddb-cache';

import {readPlusFlags} from '../extension-library/flags.ts';
import {createExtensionAuthoringController, createProjectAddresser, setExtensionAuthoringHost} from '@kubohiroya/turbowarp-extension-loader/scratch-vm';
import {confirmLargeProject} from '@kubohiroya/turbowarp-plus-editor-ui/project-size-approval';
import {confirmedProjectArchiveOptions, extensionProjectArchiveOptions} from './config.ts';
import {installPlusExtensionHost} from './host.ts';
import {gateProjectSize} from './project-size-gate.ts';
import dialogStyles from '../project-tools/dialog.css';
import type {ExtensionHostOptions} from './host.ts';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';
import {approveProjectPayloads} from '../project-payloads/approval.ts';
import {createProjectPayloadHost} from '../project-payloads/host.ts';

/**
 * The editor's persistent cache, or undefined where the browser offers no IndexedDB, in which case
 * `host.ts` keeps a copy only for this visit, as it did before.
 * @param {Function} create `createIndexedDBContentCache` or a stand-in.
 * @param {object} options What the cache is made with.
 * @returns {object|undefined} The cache.
 */
const persistentCache = (create, options) => {
    try {
        return create(options);
    } catch (error) {
        if (error?.message === 'IndexedDB unavailable') return undefined;
        throw error;
    }
};

/**
 * Install extension loading for the editor's VM.
 * @param {object} vm The VM the GUI passed.
 * @param {object} [settings] What the GUI handed through the socket.
 * @returns {object} The installed host.
 */
interface EditorHostOptions extends ExtensionHostOptions {
    search?: string;
    createContentCache?: typeof createIndexedDBContentCache;
    trustedCatalog?: ExtensionHostOptions['trustedCatalog'] & {listedDigests?: Set<string>; ready?(): Promise<unknown>};
}
export const installEditorExtensionHost = (vm, settings: EditorHostOptions = {}) => {
    const {createContentCache = createIndexedDBContentCache, ...rest} = settings;
    const enabled = settings.enabled === undefined ? readPlusFlags(settings.search || '').loader : settings.enabled;
    // A project's default address is made from where this editor was opened, never from a
    // constant, so a copy served elsewhere names its projects under its own origin.
    const origin = globalThis.location?.origin;
    const payloadsEnabled = readWebStartupFeatureFlags(settings.search ?? globalThis.location?.search).payloadFormats;
    const approvePayloads = (urls, cacheable, signal) => {
        const ask = () => approveProjectPayloads(
            settings.document || globalThis.document, settings.getLocale?.() ?? settings.locale, urls, cacheable, signal);
        return settings.waitForUser ? settings.waitForUser(ask) : ask();
    };
    // A project over the standard limits opens only after the person sees its size and agrees
    // (issue #428). The IO reads with the ceiling limits, so a project they opened can also be
    // saved and have its extensions changed; the gate keeps every new project to the standard
    // ones unless they agree.
    const confirmSize = (project, signal) => {
        const ask = () => confirmLargeProject(settings.document || globalThis.document,
            settings.getLocale?.() ?? settings.locale, project, {className: dialogStyles.dialog, signal});
        return settings.waitForUser ? settings.waitForUser(ask) : ask();
    };
    const base = {
        createAuthoring: (target, options) => createExtensionAuthoringController(target, {...options, origin}),
        setAuthoringHost: setExtensionAuthoringHost,
        archiveOptions: confirmedProjectArchiveOptions,
        gateProjectIO: io => gateProjectSize(io, {standard: extensionProjectArchiveOptions,
            ceiling: confirmedProjectArchiveOptions, confirm: confirmSize}),
        createPayloads: ports => createProjectPayloadHost(vm, {...ports, canEdit: payloadsEnabled, vmModules: settings.vmModules,
            approve: approvePayloads
        })
    };
    if (enabled !== true) return installPlusExtensionHost(vm, {...base, ...rest, enabled});
    // The project open now, as the bridge reports it on each load and on the save that addresses
    // it; undefined files a write as shared. Read by the cache at each write, so one cache serves
    // every project this VM opens.
    let projectURI;
    // What the catalog lists belongs to no one project. It is the set the trust check reads, filled
    // as the catalog loads. The Loader writes a fetched copy before it asks whether the code is
    // trusted, so a write waits for the catalog's read — the one that check would make anyway, and
    // made no earlier: the editor reads no catalog at startup that it did not read before.
    const catalog = settings.trustedCatalog;
    const sharedDigests = catalog?.listedDigests instanceof Set ? catalog.listedDigests : new Set();
    const created = settings.cache ? undefined :
        persistentCache(createContentCache, {appURI: () => projectURI, sharedDigests});
    const cache = created && typeof catalog?.ready === 'function' ? Object.freeze({...created,
        async put (key, bytes, options) {
            await catalog.ready();
            return created.put(key, bytes, options);
        }}) : created;
    const host = installPlusExtensionHost(vm, {
        ...base,
        // A project whose manifest has no address gets one when first saved, under the same rule
        // as one whose manifest is written by the library: HTTPS origins only.
        addressProject: createProjectAddresser(origin),
        ...rest,
        enabled,
        ...(cache ? {cache} : {}),
        onProjectURI: uri => { projectURI = uri; }
    });
    if (!cache) return host;
    // Nothing is released here: a project's copies stay until the person removes them, and closing
    // the editor only closes the connection.
    let disposal;
    return Object.freeze({
        ...host,
        dispose () {
            disposal ??= Promise.resolve(host.dispose()).finally(() => cache.close());
            return disposal;
        }
    });
};
