import React from 'react';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';
import styles from './icon.css';

/* global __TW_GUI_ADDON_MESSAGES__ */
const {contextMenuIcons: enabled} = readWebStartupFeatureFlags(
    typeof window === 'undefined' ? '' : window.location.search
);

const paths = {
    open: 'M13 4h7v7m0-7-9 9m-1-8H4v15h15v-6',
    duplicate: 'M8 8V4h12v12h-4M4 8h12v12H4z',
    copy: 'M8 4h12v12M4 8h12v12H4zM7 12h6m-6 4h4',
    cut: 'M8 8 20 20M8 16 20 4M8 8a3 3 0 1 0-6 0 3 3 0 0 0 6 0Zm0 8a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z',
    paste: 'M9 5H5v16h14V5h-4M9 3h6v5H9zM8 12h8m-8 4h8',
    export: 'M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5',
    import: 'M12 15V3m-4 4 4-4 4 4M4 16v5h16v-5',
    edit: 'm4 16-1 5 5-1L21 7l-4-4L4 16Zm10-10 4 4',
    delete: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
    addComment: 'M5 4h14v13h-8l-5 4v-4H5zM9 10h6m-3-3v6',
    removeComment: 'M5 4h14v13h-8l-5 4v-4H5zM9 10h6',
    undo: 'm9 4-5 5 5 5M4 9h10a5 5 0 0 1 0 10h-3',
    redo: 'm15 4 5 5-5 5m5-5H10a5 5 0 0 0 0 10h3',
    restoreDeletion: 'M4 7h16M9 7V4h6v3M6 10l1 10h10l1-10m-7 3-2 2 2 2m-2-2h5',
    findAndReplace: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15 15l5 5',
    cleanup: 'M4 4v16M8 5h12M8 12h8m-8 7h10',
    space: 'M4 4h16M4 20h16M12 7v10m-3-7 3-3 3 3m-6 4 3 3 3-3',
    moveTop: 'M4 3h16m-8 18V7m-5 5 5-5 5 5',
    moveBottom: 'M4 21h16M12 3v14m-5-5 5 5 5-5',
    folderAdd: 'M3 5h7l2 2h9v13H3zM8 13h8m-4-4v8',
    folderRemove: 'M3 5h7l2 2h9v13H3zM8 13h8',
    folderMove: 'M3 5h7l2 2h9v13H3zM7 13h10m-3-3 3 3-3 3',
    collapse: 'm6 3 6 6 6-6M6 21l6-6 6 6',
    expand: 'm6 9 6-6 6 6M6 15l6 6 6-6',
    paletteHorizontal: 'M3 4h18v16H3zM3 9h18M7 6.5h.01m4 0h.01m4 0h.01',
    paletteVertical: 'M3 4h18v16H3zM9 4v16M6 8h.01m0 4h.01m0 4h.01',
    switch: 'M3 8h17m-4-4 4 4-4 4M21 16H4m4-4-4 4 4 4',
    locate: 'M12 2v4m0 12v4M2 12h4m12 0h4M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z',
    help: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4m0 3h.01'
};

const messageActions = {
    DUPLICATE: 'duplicate',
    ADD_COMMENT: 'addComment',
    REMOVE_COMMENT: 'removeComment',
    DELETE: 'delete',
    DELETE_BLOCK: 'delete',
    DELETE_X_BLOCKS: 'delete',
    DELETE_VARIABLE: 'delete',
    DELETE_LIST: 'delete',
    UNDO: 'undo',
    REDO: 'redo',
    CLEAN_UP: 'cleanup',
    COLLAPSE_ALL: 'collapse',
    EXPAND_ALL: 'expand',
    EDIT_PROCEDURE: 'edit',
    RENAME_VARIABLE: 'edit',
    RENAME_LIST: 'edit',
    SHOW_PROCEDURE_DEFINITION: 'locate',
    PROCEDURES_TO_REPORTER: 'switch',
    PROCEDURES_TO_STATEMENT: 'switch',
    HELP: 'help'
};

// Script transfer 0.1 exposes the menu labels in English and Japanese without action IDs.
const transferActions = new Map([
    ['Export Script', 'export'], ['スクリプトを書き出し', 'export'],
    ['Import Script', 'import'], ['スクリプトを読み込み', 'import'],
    ['Copy', 'copy'], ['コピー', 'copy'],
    ['Paste', 'paste'], ['貼り付け', 'paste']
]);

const blockAddonActions = {
    'editor-devtools/paste': 'paste',
    'editor-devtools/make-space': 'space',
    'editor-devtools/copy-all': 'copy',
    'editor-devtools/copy-block': 'copy',
    'editor-devtools/cut-block': 'cut',
    'editor-devtools/swap': 'switch',
    'blocks2image/export_all_to_SVG': 'export',
    'blocks2image/export_all_to_PNG': 'export',
    'blocks2image/export_selected_to_SVG': 'export',
    'blocks2image/export_selected_to_PNG': 'export',
    'swap-local-global/edit-variable-option': 'edit',
    'swap-local-global/edit-list-option': 'edit',
    'swap-local-global/to-local': 'switch',
    'swap-local-global/to-global': 'switch'
};

const assetActions = {
    'gui.spriteSelectorItem.contextMenuDuplicate': 'duplicate',
    'gui.spriteSelectorItem.contextMenuExport': 'export',
    'tw.spriteSelectorItem.rename': 'edit',
    'gui.spriteSelectorItem.contextMenuDelete': 'delete'
};

const defaultAssetActions = new Map([
    ['duplicate', 'duplicate'], ['export', 'export'], ['rename', 'edit'], ['delete', 'delete'],
    ['Open', 'open'], ['開く', 'open']
]);

const assetAddonActions = {
    'move-to-top-bottom/top': 'moveTop',
    'move-to-top-bottom/bottom': 'moveBottom'
};

const folderActions = {
    'sa-folders-create-folder': 'folderAdd',
    'sa-folders-rename-folder': 'edit',
    'sa-folders-remove-folder': 'folderRemove',
    'sa-folders-remove-from-folder': 'folderRemove',
    'sa-folders-add-to-folder': 'folderMove'
};

// The GUI loads addon translations into this same catalog before registering their menus.
const addonMessages = typeof __TW_GUI_ADDON_MESSAGES__ === 'undefined' ? {} : __TW_GUI_ADDON_MESSAGES__;

const matchesMessage = (text, message, placeholder) => {
    if (typeof message !== 'string') return false;
    if (text === message) return true;
    const [prefix, suffix] = message.split(placeholder);
    return suffix !== undefined && text.length > prefix.length + suffix.length &&
        text.startsWith(prefix) && text.endsWith(suffix);
};

const localizedAction = (text: string, messages: Record<string, string>, actions: Record<string, string>, placeholder?: string) => {
    const id = Object.keys(actions).find(key => matchesMessage(text, messages[key], placeholder));
    return actions[id];
};

export const renderMenuIcon = action => paths[action] ? React.createElement('svg', {
    className: styles.icon, 'aria-hidden': 'true', focusable: 'false', viewBox: '0 0 24 24'
}, React.createElement('path', {d: paths[action]})) : null;

export const renderContextMenuIcon = action => enabled ? renderMenuIcon(action) : null;

const svgNamespace = 'http://www.w3.org/2000/svg';
const installed = new WeakSet();

function createContextMenuIcon (document, action) {
    if (!Object.hasOwn(paths, action)) return null;
    const icon = document.createElementNS(svgNamespace, 'svg');
    icon.setAttribute('class', styles.icon);
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('focusable', 'false');
    icon.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS(svgNamespace, 'path');
    path.setAttribute('d', paths[action]);
    icon.appendChild(path);
    return icon;
}

export function attachAssetContextMenuIcons (document, getMessages) {
    if (!enabled || !getMessages) return null;
    const window = document.defaultView;
    if (!window) return null;
    const onShow = ({detail}) => {
        const target = detail?.target;
        if (!target?.matches('[class*="sprite-selector-item_sprite-selector-item_"]')) return;
        const menu = target.querySelector('nav.react-contextmenu');
        if (!menu) return;
        const messages = getMessages() || {};
        for (const item of menu.children) {
            if (!item.classList.contains('react-contextmenu-item')) continue;
            if (item.hasAttribute('data-tw-plus-menu-icon')) continue;
            const text = item.textContent;
            const folderClass = Object.keys(folderActions).find(name => item.classList.contains(name));
            const action = item.classList.contains('sa-ctx-menu') ?
                folderActions[folderClass] || localizedAction(text, addonMessages, assetAddonActions) :
                localizedAction(text, messages, assetActions) || defaultAssetActions.get(text);
            item.querySelector(`.${styles.icon}`)?.remove();
            const icon = createContextMenuIcon(item.ownerDocument, action);
            if (icon) item.prepend(icon);
        }
    };
    window.addEventListener('REACT_CONTEXTMENU_SHOW', onShow);
    return {dispose: () => window.removeEventListener('REACT_CONTEXTMENU_SHOW', onShow)};
}

export function installBlockContextMenuIcons (ScratchBlocks, showIcons = enabled) {
    if (!showIcons || installed.has(ScratchBlocks)) return;
    const {ContextMenu, WidgetDiv} = ScratchBlocks;
    const populate = ContextMenu.populate_;
    const data = ScratchBlocks.Constants.Data;
    const variableOptionCallback = data.VARIABLE_OPTION_CALLBACK_FACTORY;
    const variableChoices = new WeakSet();

    // Blockly uses the project's variable or list name as the label for these choices.
    data.VARIABLE_OPTION_CALLBACK_FACTORY = function (...args) {
        const callback = variableOptionCallback.apply(this, args);
        variableChoices.add(callback);
        return callback;
    };

    // Decorate the final labels before Blockly measures the menu, after addons have read the strings.
    ContextMenu.populate_ = function (options, rtl) {
        const document = WidgetDiv.DIV.ownerDocument;
        const {Msg} = ScratchBlocks;
        const block = ScratchBlocks.mainWorkspace?.currentGesture_?.targetBlock_;
        const isArgument = block?.type === 'argument_reporter_string_number' ||
            block?.type === 'argument_reporter_boolean';
        const decorated = options.map(option => {
            const {text} = option;
            if (typeof text !== 'string') return option;
            const action = option.twPlusMenuIcon || (variableChoices.has(option.callback) && 'switch') ||
                localizedAction(text, Msg, messageActions, '%1') || transferActions.get(text) ||
                localizedAction(text, addonMessages, blockAddonActions, '{var}') ||
                ((isArgument || Object.keys(addonMessages).some(key => key.startsWith('block-switching/') &&
                    addonMessages[key] === text)) && 'switch');
            const icon = createContextMenuIcon(document, action);
            return icon ? {...option, text: [icon, document.createTextNode(text)]} : option;
        });
        return populate.call(this, decorated, rtl);
    };
    installed.add(ScratchBlocks);
}
