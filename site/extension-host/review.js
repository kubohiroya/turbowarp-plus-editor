/**
 * Reviewing the extensions a project asks for, before any of them runs.
 *
 * TurboWarp asks about an unknown extension one at a time. This distribution ships a review that
 * asks about all of them together, shows what each one is and remembers the choices for the load —
 * the `@kubohiroya/turbowarp-extension-security-dialog` package, which is this distribution's.
 *
 * The GUI's own security manager (`src/containers/tw-security-manager.jsx`) is an upstream file; the
 * fork had added this package to it. What is here now is everything that came from the package plus
 * the decision of what needs no review at all. What stays over there is the GUI's: its modal, its
 * lock, its lifecycle, and which of its own extensions it already trusts. The GUI passes the rows
 * and the starting decisions through without reading them, so their shape is this side's.
 */

import JSZip from '@turbowarp/jszip';
import {discoverManifest} from '@kubohiroya/turbowarp-extension-loader';
import {
    createDecisionStorage, initialDecisions, loadExtensionInfo, requiresReview
} from '@kubohiroya/turbowarp-extension-security-dialog';
import {ExtensionReview} from '@kubohiroya/turbowarp-extension-security-dialog/react';
import {
    installBatchExtensionLoader, isExtensionSecurityCancelled
} from '@kubohiroya/turbowarp-extension-security-dialog/turbowarp';
import '@kubohiroya/turbowarp-extension-security-dialog/webpack4.css';
import React from 'react';

import {plusTrustedExtensions} from '../trusted-extensions.js';
import styles from './review.css';

const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');

/**
 * The project document a load was handed, whatever form it arrived in.
 * @param {unknown} input The first argument of `vm.loadProject`.
 * @returns {Promise<object|null>} The parsed document, or null when it cannot be read.
 */
const readProjectDocument = async input => {
    if (input && typeof input === 'object' && !ArrayBuffer.isView(input) && !(input instanceof ArrayBuffer)) {
        return input;
    }
    if (typeof input === 'string') return JSON.parse(input);
    const zip = await JSZip.loadAsync(input);
    const file = zip.file('project.json');
    return file ? JSON.parse(await file.async('string')) : null;
};

/**
 * How this distribution names a project, so what its opener chose is remembered for it.
 *
 * The address a project carries is its name when it has one: it survives edits. Without one, the
 * name is the content with its volatile metadata left out — what the previous version of the review
 * remembered by — so an unchanged project is still recognised, and an edited one is asked again.
 * @param {unknown} input The first argument of `vm.loadProject`.
 * @returns {Promise<string|null>} The name, or null when there is nothing to name.
 */
export const identifyProject = async input => {
    const project = await readProjectDocument(input);
    if (!project || typeof project !== 'object') return null;
    const uri = discoverManifest(project)?.uri;
    if (typeof uri === 'string') return uri;
    const {meta, projectVersion, ...content} = project;
    const canonical = JSON.stringify(content, (key, value) => (value && typeof value === 'object' && !Array.isArray(value) ?
        Object.fromEntries(Object.keys(value).sort().map(name => [name, value[name]])) : value));
    return `sha256:${hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)))}`;
};

const frames = new WeakMap();

/**
 * The GUI's modal, in the shape the screen asks of a frame.
 *
 * The screen hands its frame a title, a way to cancel and its body. The GUI's `Modal` names those a
 * content label and a close request, so this is the one place the two vocabularies meet. The frame's
 * look is this side's too: the package styles only its body, and the GUI's modal is transparent
 * unless its caller gives it a class. Each GUI
 * modal gets one adapter, kept, so React sees the same component on every render.
 * @param {Function} Modal The GUI's modal component.
 * @returns {Function} A frame component the screen can render into.
 */
export const frameFor = Modal => {
    if (!frames.has(Modal)) {
        const Frame = ({title, onCancel, children}) => React.createElement(Modal, {
            id: 'extension-security-batch', className: styles.frame, contentLabel: title, onRequestClose: onCancel
        }, React.createElement('div', {className: styles.body}, children));
        frames.set(Modal, Frame);
    }
    return frames.get(Modal);
};

/**
 * Build the review, so a test can hand in its own catalog, screen and storage.
 * @param {object} [parts] `trusted`, `screen`, `install`, `storage` and `identify` for tests.
 * @returns {object} `installBatchLoader`, `render` and `isCancelled`.
 */
export const createSecurityReview = ({
    trusted = plusTrustedExtensions.catalog,
    screen = ExtensionReview,
    install = installBatchExtensionLoader,
    storage = createDecisionStorage(),
    identify = identifyProject
} = {}) => Object.freeze({
    /**
     * Put this review in front of the VM's extension loading.
     *
     * Everything the GUI knows comes in: the VM, how to show one of its modals, which extensions it
     * trusts already and where to find an icon for one. What this adds is the catalog's own trust —
     * an extension this distribution lists needs no review, the way TurboWarp treats its gallery —
     * and the asking itself.
     * @param {object} context `vm`, `showReview`, `defaultURLs`, `isTrusted` and `bannerFor`.
     * @returns {Function} Restores the VM's previous loading path.
     */
    installBatchLoader ({vm, showReview, defaultURLs, isTrusted, bannerFor}) {
        return install(vm, async (entries, initial) => {
            // A trusted row is stated, not asked about: the screen gives it no choice.
            const rows = await Promise.all(entries.map(async entry => {
                const url = entry.source.url;
                const vouched = typeof url === 'string' && (isTrusted(url) || await trusted.isTrustedURL(url));
                const banner = bannerFor({ids: entry.ids, url});
                return {...entry,
                    ...(banner ? {metadata: {...entry.metadata, banner}} : {}),
                    ...(vouched ? {state: {...entry.state, trusted: true}} : {})};
            }));
            const starting = initialDecisions(rows, 'open', {recorded: initial});
            if (!requiresReview(rows)) return starting;
            return showReview(rows, starting);
        }, defaultURLs, storage, {identify});
    },
    /**
     * Render the review inside the GUI's own modal frame, which arrives as `DialogFrame`.
     * @param {object} props What the GUI passes: entries, initial choices, locale, frame, callback.
     * @returns {object} The element to render.
     */
    render: ({entries, initialChoices, locale, DialogFrame, onComplete}) => React.createElement(screen, {
        mode: 'open', entries, initialDecisions: initialChoices, locale,
        DialogFrame: DialogFrame && frameFor(DialogFrame),
        // A custom extension's name, description, creator and licence are its own leading comment,
        // read without running it, so the row says what it is and labels each part a claim.
        loadInfo: loadExtensionInfo,
        onComplete
    }),
    /**
     * Whether an error means someone declined, rather than something failing.
     * @param {object} error The rejection from loading.
     * @returns {boolean} True when the review was cancelled.
     */
    isCancelled: error => isExtensionSecurityCancelled(error)
});

export const plusSecurityReview = createSecurityReview();
