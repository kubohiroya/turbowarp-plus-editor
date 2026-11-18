import React from 'react';
import {createContextMenuIcons} from '@kubohiroya/turbowarp-plus-editor-code-views/context-menu-icons';
import {createSpriteEditorSectionIcon, SpriteEditorSectionIcon} from '@kubohiroya/turbowarp-plus-editor-sprite-panes/sprite-editor-toolbar';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';
import styles from '@kubohiroya/turbowarp-plus-editor-code-views/context-menu-icons.css';

/* global __TW_GUI_ADDON_MESSAGES__ */
const {contextMenuIcons: enabled} = readWebStartupFeatureFlags(
    typeof window === 'undefined' ? '' : window.location.search
);
export const addonMessages = typeof __TW_GUI_ADDON_MESSAGES__ === 'undefined' ? {} : __TW_GUI_ADDON_MESSAGES__;

export const {renderMenuIcon, renderContextMenuIcon, attachAssetContextMenuIcons, installBlockContextMenuIcons} =
    createContextMenuIcons({enabled, addonMessages, styles,
        renderSectionIcon: (section, className) => React.createElement(SpriteEditorSectionIcon, {kind: section, className}),
        createSectionIcon: (document, section, className) => {
            const icon = createSpriteEditorSectionIcon(document, section);
            icon.classList.add(className);
            return icon;
        }
    });
