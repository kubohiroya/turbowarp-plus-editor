import React from 'react';
import {createExternalYamlMenuAction} from '@kubohiroya/turbowarp-document-editor';
import {getDocumentWorkspace} from '@kubohiroya/turbowarp-plus-editor-layout/sprite-tabs';
import {externalYamlPort} from '../editor-layout/index.tsx';
import {createSpriteInfoAdapter} from '@kubohiroya/turbowarp-plus-editor-layout/sprite-properties';
import '@kubohiroya/turbowarp-plus-editor-layout/sprite-properties.css';
import {createFileMenuItem as createIconFileMenuItem, renderExtensionFileMenu} from '@kubohiroya/turbowarp-plus-editor-layout/extension-file-menu';
import {renderFileMenu as renderProjectFileMenu} from '../project-tools/index.ts';
import StageControlsView from '../stage-controls/view.tsx';
import {attachBackpackDrop, receiveBackpackDrop} from '../editor-backpack/index.tsx';
import {attachDesktopCode, desktopCodeEnabled} from '../editor-views/desktop-code.ts';
import {hostIntegration, hostStageControls} from './lib/tw-plus-integration-points.ts';
import {SpritePropertiesPanel} from './lib/tw-sprite-properties-panel.tsx';
import {attachHostScriptTransfer as attachScriptTransfer} from './lib/tw-plus-transfer.ts';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';
import {attachDockedDynamicBranches} from '@kubohiroya/turbowarp-plus-editor-views';
import {attachCodeWorkspace} from '@kubohiroya/turbowarp-plus-editor-views/sprite-code-windows';

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
    const branches = attachDockedDynamicBranches(context);
    return {dispose() {
        branches.dispose();
        code?.dispose();
        transfer?.dispose();
    }};
};

export {EditorLayout} from '../editor-layout/index.tsx';

const startupSearch = typeof window === 'undefined' ? '' : window.location.search;
const startup = readWebStartupFeatureFlags(startupSearch);
export const attachSpriteCodeWorkspace = (startup.spriteCodeWindows || startup.standardLayout) && !desktopCodeEnabled ?
    context => attachCodeWorkspace({...context, presentationElements: injection => {
        const wrapper = injection.closest('[class*="gui_blocks-wrapper_"]');
        return {
            wrapper,
            extensionButton: wrapper?.parentElement.querySelector<HTMLElement>(':scope > [class*="gui_extension-button-container_"]'),
            watermark: wrapper?.parentElement.querySelector<HTMLElement>(':scope > [class*="gui_watermark_"]')
        };
    }}) : undefined;
export {useSpriteCodeWindows} from '@kubohiroya/turbowarp-plus-editor-views/sprite-code-windows';
export const wrapSpriteInfo = (startup.spriteProperties || startup.standardLayout) ?
    Fallback => createSpriteInfoAdapter(Fallback, SpritePropertiesPanel) : undefined;
export {spriteListClasses} from '@kubohiroya/turbowarp-plus-editor-layout/sprite-properties';

export {BackpackSurface} from '../editor-backpack/index.tsx';
export {attachStageInput} from '@kubohiroya/turbowarp-plus-editor-layout';
export {StagePanel, attachStageMonitorDrag} from '../editor-layout/stage-panel.tsx';
export {StageDisplayMenu} from '../editor-layout/stage-display-menu.tsx';
export {TargetListLayout, TargetListPanel, SpriteGrid, BackdropTile, BackdropListActions} from '../editor-layout/target-list.tsx';

export const extensionInFileMenu = startup.extensionFileMenu;
export const createFileMenuItem = extensionInFileMenu ? createIconFileMenuItem : undefined;
const externalYamlActions = new WeakMap<object, ReturnType<typeof createExternalYamlMenuAction>>();
const renderExternalYamlMenu = ({vm, locale, MenuItem, MenuSection, onRequestClose}) => {
    if (!externalYamlPort || !vm) return null;
    let entry = externalYamlActions.get(vm);
    if (!entry) {
        entry = createExternalYamlMenuAction({vm, locale, port: externalYamlPort,
            openPanel: request => getDocumentWorkspace(vm).open(request), document});
        externalYamlActions.set(vm, entry);
    }
    const action = entry;
    return React.createElement(MenuSection, null,
        React.createElement(MenuItem, {command: 'open-external-yaml', onClick: () => {
            onRequestClose();
            void action.open();
        }}, action.label));
};
export const renderFileMenu = props => React.createElement(React.Fragment, null,
    renderProjectFileMenu(props), renderExternalYamlMenu(props), extensionInFileMenu && renderExtensionFileMenu(props));
