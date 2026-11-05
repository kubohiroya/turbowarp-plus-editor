/**
 * The tab this distribution adds to the GUI's extension library.
 *
 * The GUI's library can show one tab it does not own: it takes a tag to put beside its own, and
 * renders whatever the tab returns when that tag is selected. Everything about what the tab offers
 * — its name, its icon, the catalog behind it and the review before anything runs — is this
 * distribution's, so it is described here and the GUI only makes room for it.
 *
 * A build that offers nothing supplies no tab, and the library is then exactly the GUI's own.
 */

import React from 'react';

import {PLUS_LIBRARY_ENABLED} from './flags.ts';
import icon from './icon.svg';
import PlusLibrary from './plus-library.tsx';
import styles from './plus-library.css';
import {beginPlusReview, canLoadPlusExtension} from '../gui-integration/lib/tw-plus-extension-permissions.ts';

const activateTab = event => {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.currentTarget.click();
    }
};

const permissions = {beginReview: beginPlusReview, canLoad: canLoadPlusExtension};

/**
 * Build the tab, so a test can hand in its own view.
 * @param {object} [parts] `view` and `enabled` for tests; the defaults are the real ones.
 * @returns {object|null} The tab, or null when this build offers none.
 */
export const createPlusLibraryTab = ({view = PlusLibrary, enabled = PLUS_LIBRARY_ENABLED} = {}) => enabled ? {
    /** A native library tag supplied beside the GUI's standard tags. */
    tagProps: {
        tag: 'twplus',
        intlLabel: 'TurboWarp Plus',
        iconSrc: icon,
        className: styles.plusTag,
        tabIndex: 0,
        onKeyDown: activateTab
    },
    classes: {
        library: styles.customLibrary,
        content: styles.customContent,
        tags: styles.extendedTags
    },
    /**
     * Render the tab's contents.
     * @param {string} filterQuery The library's current search text.
     * @param {object} context Current library props containing Intl, VM and the native callbacks.
     * @param {Function} onBusyChange Update the GUI's library busy state.
     * @returns {object} The element to render.
     */
    render: (filterQuery, {intl, vm, onCategorySelected, onRequestClose}, onBusyChange) => React.createElement(view, {
        filterQuery,
        locale: intl.locale,
        vm,
        permissions,
        onBusyChange,
        onCategorySelected,
        onRequestClose
    })
} : null;

export const plusLibraryTab = createPlusLibraryTab();
