import React from 'react';
import StageControlsView from '../stage-controls/view.jsx';
import {attachBackpackDrop, receiveBackpackDrop} from '../editor-backpack/index.jsx';
import {attachDesktopCode, desktopCodeEnabled} from '../editor-views/desktop-code.js';
import {hostIntegration, hostStageControls} from './lib/tw-plus-integration-points.js';
import {attachHostScriptTransfer as attachScriptTransfer} from './lib/tw-plus-transfer.js';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';
import {attachCodeWorkspace} from '@kubohiroya/turbowarp-editor-views/sprite-code-windows';

export * from './lib/tw-plus-integration-points.js';
export {renderFileMenu, loadedProjectTitle, restoreProjectTitle} from '../project-tools/index.js';
export * from './lib/tw-plus-transfer.js';
export * from './lib/tw-plus-extension-host.js';
export * from './lib/tw-plus-extension-permissions.js';
export * from './lib/tw-plus-extension-load-failure.js';
export {recoverProjectLoad} from './lib/tw-extension-security-cancel.js';
export {default as getBlockEditorService} from './lib/tw-block-editor-service.js';
export {default as createPreviewVm} from './lib/tw-preview-vm.js';
export {default as createBlocksWrapper} from './containers/tw-plus-blocks.jsx';
export {createWorkspaceAttachment} from './containers/tw-plus-workspace-attachment.jsx';

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

export {EditorLayout} from '../editor-layout/index.jsx';

/* global __TW_SPRITE_PROPERTIES_PANEL__ */
const startupSearch = typeof window === 'undefined' ? '' : window.location.search;
const startup = readWebStartupFeatureFlags(startupSearch);
export const attachSpriteCodeWorkspace = startup.spriteCodeWindows && !desktopCodeEnabled ? attachCodeWorkspace : undefined;
export {useSpriteCodeWindows} from '@kubohiroya/turbowarp-editor-views/sprite-code-windows';
export const SpritePropertiesPanel = (startup.spriteProperties || startup.standardLayout) &&
    typeof __TW_SPRITE_PROPERTIES_PANEL__ !== 'undefined' ? __TW_SPRITE_PROPERTIES_PANEL__ : undefined;

export {BackpackSurface} from '../editor-backpack/index.jsx';
export {StagePanel, attachStageMonitorDrag} from '../editor-layout/stage-panel.jsx';
export {TargetListLayout, TargetListPanel, SpriteGrid, BackdropTile, BackdropListActions} from '../editor-layout/target-list.jsx';
