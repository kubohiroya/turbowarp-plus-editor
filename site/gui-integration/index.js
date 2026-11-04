import React from 'react';
import StageControlsView from '../stage-controls/view.jsx';
import {hostIntegration, hostStageControls} from './lib/tw-plus-integration-points.js';

export * from './lib/tw-plus-integration-points.js';
export {renderFileMenu, loadedProjectTitle, restoreProjectTitle} from '../project-tools/index.js';
export * from './lib/tw-plus-transfer.js';
export * from './lib/tw-plus-extension-host.js';
export * from './lib/tw-plus-extension-permissions.js';
export * from './lib/tw-plus-extension-load-failure.js';
export {default as returnToEditorStart, returnToEditorStartAfterExtensionFailure}
    from './lib/tw-extension-security-cancel.js';
export {default as getBlockEditorService} from './lib/tw-block-editor-service.js';
export {default as createPreviewVm} from './lib/tw-preview-vm.js';
export {default as createBlocksWrapper} from './containers/tw-plus-blocks.jsx';
export {createWorkspaceAttachment} from './containers/tw-plus-workspace-attachment.jsx';

export const renderStageControls = ({vm, isSmall}) => {
    const service = hostStageControls(vm, hostIntegration());
    return service ? React.createElement(StageControlsView, {service, isSmall}) : null;
};
