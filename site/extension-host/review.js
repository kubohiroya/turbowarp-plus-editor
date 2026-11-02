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
 * lock, its lifecycle, and which of its own extensions it already trusts.
 */

import {ExtensionSecurityDialog} from '@kubohiroya/turbowarp-extension-security-dialog/react';
import {
    installBatchExtensionLoader, isExtensionSecurityCancelled
} from '@kubohiroya/turbowarp-extension-security-dialog/turbowarp';
import '@kubohiroya/turbowarp-extension-security-dialog/webpack4.css';
import React from 'react';

import {plusTrustedExtensions} from '../trusted-extensions.js';

/**
 * Build the review, so a test can hand in its own catalog and dialog.
 * @param {object} [parts] `trusted`, `dialog` and `install` for tests; the defaults are the real ones.
 * @returns {object} `installBatchLoader`, `render` and `isCancelled`.
 */
export const createSecurityReview = ({
    trusted = plusTrustedExtensions.catalog,
    dialog = ExtensionSecurityDialog,
    install = installBatchExtensionLoader
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
        return install(vm, async (entries, initialChoices) => {
            const decisions = new Map();
            for (const entry of entries) {
                if (isTrusted(entry.url) || await trusted.isTrustedURL(entry.url)) {
                    decisions.set(entry.url, 'unsandboxed');
                }
            }
            const reviewed = entries.filter(entry => !decisions.has(entry.url));
            if (!reviewed.length) return decisions;
            const choices = await showReview(
                reviewed.map(entry => ({...entry, banner: bannerFor(entry)})), initialChoices);
            if (choices === null) return null;
            choices.forEach((mode, url) => decisions.set(url, mode));
            return decisions;
        }, defaultURLs);
    },
    /**
     * Render the review inside the GUI's own modal frame, which arrives as `DialogFrame`.
     * @param {object} props What the GUI passes: entries, initial choices, locale, frame, callback.
     * @returns {object} The element to render.
     */
    render: props => React.createElement(dialog, props),
    /**
     * Whether an error means someone declined, rather than something failing.
     * @param {object} error The rejection from loading.
     * @returns {boolean} True when the review was cancelled.
     */
    isCancelled: error => isExtensionSecurityCancelled(error)
});

export const plusSecurityReview = createSecurityReview();
