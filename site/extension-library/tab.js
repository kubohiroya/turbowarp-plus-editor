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

import {PLUS_LIBRARY_ENABLED} from './flags.js';
import icon from './icon.svg';
import PlusLibrary from './plus-library.jsx';
import styles from './plus-library.css';

/**
 * Build the tab, so a test can hand in its own view.
 * @param {object} [parts] `view` and `enabled` for tests; the defaults are the real ones.
 * @returns {object|null} The tab, or null when this build offers none.
 */
export const createPlusLibraryTab = ({view = PlusLibrary, enabled = PLUS_LIBRARY_ENABLED} = {}) => enabled ? {
    /** The tag the GUI puts beside its own, and selects this tab by. */
    tag: 'twplus',
    /** Shown on the tag. Not translated: it is the name of this distribution. */
    label: 'TurboWarp Plus',
    iconSrc: icon,
    // The class name is this stylesheet's, hashed when this bundle is built, so the GUI cannot
    // name it: it styles the tag through whatever string arrives here.
    className: styles.plusTag,
    /**
     * Render the tab's contents.
     * @param {object} props What the GUI passes: the filter, the locale, the VM, its review
     * bookkeeping and the callbacks for busy state, category selection and closing.
     * @returns {object} The element to render.
     */
    render: props => React.createElement(view, props)
} : null;

export const plusLibraryTab = createPlusLibraryTab();
