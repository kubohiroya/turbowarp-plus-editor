import React from 'react';
import {renderContextMenuIcon} from '../../context-menu-icons/index.js';
import styles from './tw-stage-transfer-menu.css';

// Optional transfer sockets. With no host, the GUI keeps its own menus and clipboard.
export const attachHostScriptTransfer = (context, integration, attachBackpackDrop) => {
    const existing = integration?.scriptTransfer?.attach?.(context) || null;
    const backpack = attachBackpackDrop?.(context);
    if (!backpack) return existing;
    return {dispose() {
        backpack.dispose();
        existing?.dispose();
    }};
};

const stageTransferMenuId = 'tw-plus-stage-transfer';

export const hostStageTransferMenu = (context, integration) => {
    const menu = integration?.scriptTransfer?.stageMenu?.(context);
    if (!menu) return null;
    const {contextItems, backdropItems} = menu;
    return {
        backdropButtons: icon => backdropItems.map(({label, onClick}) => ({title: label, img: icon, onClick})),
        wrap (content, {ContextMenuTrigger, ContextMenu, MenuItem}, {includeBackdropItems = false} = {}) {
            const createItem = ({label, onClick}, action) => {
                const icon = renderContextMenuIcon(action);
                return React.createElement(MenuItem,
                    {key: label, onClick}, icon ? React.createElement(React.Fragment, null, icon, label) : label);
            };
            const items = contextItems.map(item => createItem(item, 'export'));
            if (includeBackdropItems) items.push(...backdropItems.map(item => createItem(item, 'import')));
            if (!items.length) return content;
            const contextMenu = React.createElement(ContextMenu, {id: stageTransferMenuId}, items);
            return React.createElement(ContextMenuTrigger,
                {id: stageTransferMenuId, attributes: {className: styles.contextMenuWrapper}}, content, contextMenu);
        }
    };
};

export const finalizeHostTransferMenu = (items, integration) =>
    integration?.scriptTransfer?.finalizeMenu?.(items) || items;
