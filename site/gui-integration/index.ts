import React from 'react';
import {connect} from 'react-redux';
import {createExternalYamlMenuAction} from '@kubohiroya/turbowarp-document-editor';
import {getDocumentWorkspace} from '@kubohiroya/turbowarp-plus-editor-layout/sprite-tabs';
import {externalYamlPort} from '../editor-layout/index.tsx';
import {createSpriteInfoAdapter} from '@kubohiroya/turbowarp-plus-editor-layout/sprite-properties';
import '@kubohiroya/turbowarp-plus-editor-layout/sprite-properties.css';
import {createFileMenuItem as createIconFileMenuItem, renderExtensionFileMenu} from '@kubohiroya/turbowarp-plus-editor-layout/extension-file-menu';
import {projectFileActions, renderFileMenu as renderProjectFileMenu} from '../project-tools/index.ts';
import {renderGitMenu} from '@kubohiroya/turbowarp-plus-editor-git';
import '@kubohiroya/turbowarp-plus-editor-git/style.css';
import ProjectFileMenu from '@kubohiroya/turbowarp-plus-editor-ui/project-file-menu';
import {projectSaveShortcut} from '@kubohiroya/turbowarp-plus-editor-ui/project-file-dialogs';
import {projectFolderActions, renderProjectFolderMenu} from '@kubohiroya/turbowarp-plus-editor-project-folder';
import StageControlsView from '@kubohiroya/turbowarp-plus-editor-ui/stage-controls-view';
import {attachBackpackDrop, receiveBackpackDrop} from '../editor-backpack/index.tsx';
import {attachDesktopCode, desktopCodeEnabled} from '../editor-views/desktop-code.ts';
import {hostIntegration, hostStageControls} from './lib/tw-plus-integration-points.ts';
import {SpritePropertiesPanel} from './lib/tw-sprite-properties-panel.tsx';
import {attachHostScriptTransfer as attachScriptTransfer} from './lib/tw-plus-transfer.ts';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';
import {attachDockedCodeExtensions, attachStageCodePrewarm} from '@kubohiroya/turbowarp-plus-editor-views';
import {attachCodeWorkspace} from '@kubohiroya/turbowarp-plus-editor-views/sprite-code-windows';
import {ProjectSearch} from '@kubohiroya/turbowarp-plus-editor-ui/project-search';
import {attachEditMenuWorkspace, renderEditMenu} from '@kubohiroya/turbowarp-plus-editor-ui/edit-menu';

export * from './lib/tw-plus-integration-points.ts';
export {renderEditMenu};
export {loadedProjectTitle, restoreProjectTitle} from '../project-tools/index.ts';
export {ProjectInfoMenu} from '../project-tools/info-menu.tsx';
const getProjectSearchMessages = () => window.ScratchBlocks?.Msg ?? {};
export const renderProjectSearch = ({vm, locale}) => React.createElement(ProjectSearch, {
    project: vm.runtime, locale, getMessages: getProjectSearchMessages
});
export * from './lib/tw-plus-transfer.ts';
export * from './lib/tw-plus-extension-host.ts';
export * from './lib/tw-plus-extension-permissions.ts';
export * from './lib/tw-plus-extension-load-failure.ts';
export {recoverProjectLoad} from './lib/tw-extension-security-cancel.ts';
export {default as getBlockEditorService} from './lib/tw-block-editor-service.ts';
export {default as createPreviewVm} from './lib/tw-preview-vm.ts';
export {default as createBlocksWrapper} from './containers/tw-plus-blocks.tsx';
export {createWorkspaceAttachment} from './containers/tw-plus-workspace-attachment.tsx';

const ExtensionControls = connect(({scratchGui: {mode}}) => ({
    stageOnly: mode.isPlayerOnly || mode.isFullScreen
}))(({vm, isSmall, menuLocale, stageOnly}) => {
    if (stageOnly !== (menuLocale === undefined)) return null;
    const service = hostStageControls(vm, hostIntegration());
    return service ? React.createElement(StageControlsView, {service, isSmall, menuLocale}) : null;
});
export const renderStageControls = props => React.createElement(ExtensionControls, props);

export const attachHostScriptTransfer = (context, integration) => {
    const transfer = attachScriptTransfer(context, integration, attachBackpackDrop);
    const code = attachDesktopCode({...context, receiveBackpackDrop});
    const extensions = attachDockedCodeExtensions(context);
    const prewarm = startup.stageCodePrewarm ? attachStageCodePrewarm(context) : undefined;
    const editMenu = attachEditMenuWorkspace(context);
    return {dispose() {
        editMenu.dispose();
        prewarm?.dispose();
        extensions.dispose();
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
const externalYamlActions = new WeakMap<object, {locale: string; action: ReturnType<typeof createExternalYamlMenuAction>}>();
const renderExternalYamlMenu = ({vm, locale, MenuItem, MenuSection, onRequestClose}) => {
    if (!externalYamlPort || !vm) return null;
    let entry = externalYamlActions.get(vm);
    if (!entry || entry.locale !== locale) {
        const action = createExternalYamlMenuAction({vm, locale, port: externalYamlPort,
            openPanel: request => getDocumentWorkspace(vm).open({...request, transient: true}), document});
        entry = {locale, action};
        externalYamlActions.set(vm, entry);
    }
    const {action} = entry;
    return React.createElement(MenuSection, null,
        React.createElement(MenuItem, {command: 'open-external-yaml', onClick: () => {
            onRequestClose();
            void action.open();
        }}, action.label));
};
export const renderFileMenu = props => React.createElement(React.Fragment, null,
    renderProjectFileMenu(props), renderProjectFolderMenu(React.createElement, props), renderGitMenu(React.createElement, props), renderExternalYamlMenu(props), extensionInFileMenu && renderExtensionFileMenu(props));

export {saveProjectForPackager as serializeProjectForExport} from '../project-payloads/host.ts';

export const projectFileTypes = [
    {description: 'Scratch 3 Project', accept: {'*/*': ['.sb3']}},
    {description: 'Scratch 1 and 2 Projects', accept: {'*/*': ['.sb', '.sb2']}}
];

export const renderProjectFileWorkflow = ({
    vm, locale = 'en', MenuItem, MenuSection, close, storage, create, newWindow, open, restore, exportProject, addExtension
}) => {
    const folder = projectFolderActions(vm, locale);
    const actions = projectFileActions(vm, locale, storage, () => folder?.detach(), addExtension);
    const inline = {vm, locale, MenuItem, MenuSection: React.Fragment, onRequestClose: close};
    return React.createElement(ProjectFileMenu, {locale, MenuItem, MenuSection, close, entries: {
        ...actions, saveAs: actions.saveAs, create, newWindow, open, storage, folder, restore,
        exportProject: exportProject && (actions.exportProject ? () => actions.exportProject(exportProject) : exportProject),
        externalYaml: renderExternalYamlMenu(inline),
        git: renderGitMenu(React.createElement, inline)
    }});
};

export const saveProjectFromFileMenu = (vm, storage, promptForTarget) => {
    const locale = document.documentElement.lang || 'en';
    const folder = projectFolderActions(vm, locale);
    projectSaveShortcut(storage, folder, promptForTarget ?
        () => projectFileActions(vm, locale, storage, () => folder?.detach()).saveAs?.() : undefined);
};
