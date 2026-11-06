import React from 'react';
import {createFileMenuItem as createIconFileMenuItem, renderExtensionFileMenu} from '@kubohiroya/turbowarp-plus-editor-layout/extension-file-menu';
import {renderFileMenu as renderProjectFileMenu} from '../project-tools/index.ts';
import StageControlsView from '../stage-controls/view.tsx';
import {attachBackpackDrop, receiveBackpackDrop} from '../editor-backpack/index.tsx';
import {attachDesktopCode, desktopCodeEnabled} from '../editor-views/desktop-code.ts';
import {hostIntegration, hostStageControls} from './lib/tw-plus-integration-points.ts';
import {attachHostScriptTransfer as attachScriptTransfer} from './lib/tw-plus-transfer.ts';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';
import {attachCodeWorkspace} from '@kubohiroya/turbowarp-editor-views/sprite-code-windows';

export * from './lib/tw-plus-integration-points.ts';
export {loadedProjectTitle, restoreProjectTitle} from '../project-tools/index.ts';
export {ProjectInfoMenu} from '../project-tools/info-menu.tsx';
export * from './lib/tw-plus-transfer.ts';
export * from './lib/tw-plus-extension-host.ts';
export * from './lib/tw-plus-extension-permissions.ts';
export * from './lib/tw-plus-extension-load-failure.ts';
export {recoverProjectLoad} from './lib/tw-extension-security-cancel.ts';
export {default as getBlockEditorService} from './lib/tw-block-editor-service.ts';
export {default as createPreviewVm} from './lib/tw-preview-vm.ts';
export {default as createBlocksWrapper} from './containers/tw-plus-blocks.tsx';
export {createWorkspaceAttachment} from './containers/tw-plus-workspace-attachment.tsx';

export const renderStageControls = ({vm, isSmall}) => {
    const service = hostStageControls(vm, hostIntegration());
    return service ? React.createElement(StageControlsView, {service, isSmall}) : null;
};

export const attachHostScriptTransfer = (context, integration) => {
    const transfer = attachScriptTransfer(context, integration, attachBackpackDrop);
    const code = attachDesktopCode({...context, receiveBackpackDrop});
    if (!code) return transfer;
    return {dispose() {
        code.dispose();
        transfer?.dispose();
    }};
};

export {EditorLayout} from '../editor-layout/index.tsx';

/* global __TW_SPRITE_PROPERTIES_PANEL__ */
const startupSearch = typeof window === 'undefined' ? '' : window.location.search;
const startup = readWebStartupFeatureFlags(startupSearch);
export const attachSpriteCodeWorkspace = (startup.spriteCodeWindows || startup.standardLayout) && !desktopCodeEnabled ? attachCodeWorkspace : undefined;
export {useSpriteCodeWindows} from '@kubohiroya/turbowarp-editor-views/sprite-code-windows';
export const SpritePropertiesPanel = (startup.spriteProperties || startup.standardLayout) &&
    typeof __TW_SPRITE_PROPERTIES_PANEL__ !== 'undefined' ? __TW_SPRITE_PROPERTIES_PANEL__ : undefined;

export {BackpackSurface} from '../editor-backpack/index.tsx';
export {StagePanel, attachStageMonitorDrag} from '../editor-layout/stage-panel.tsx';
export {StageDisplayMenu} from '../editor-layout/stage-display-menu.tsx';
export {TargetListLayout, TargetListPanel, SpriteGrid, BackdropTile, BackdropListActions} from '../editor-layout/target-list.tsx';

export const extensionInFileMenu = startup.extensionFileMenu;
export const createFileMenuItem = extensionInFileMenu ? createIconFileMenuItem : undefined;
export const renderFileMenu = props => React.createElement(React.Fragment, null,
    renderProjectFileMenu(props), extensionInFileMenu && renderExtensionFileMenu(props));
