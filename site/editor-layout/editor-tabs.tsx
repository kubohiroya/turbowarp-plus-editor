import {connect} from 'react-redux';
import {desktopCodeEnabled, openDesktopCode} from '../editor-views/desktop-code.ts';
import styles from '@kubohiroya/turbowarp-plus-editor-workbench/editor.css';
import '@kubohiroya/turbowarp-plus-editor-workbench/dockview-styles';
import '@kubohiroya/turbowarp-plus-editor-workbench/sprite-layout-menu.css';
import '@kubohiroya/turbowarp-plus-editor-sprite-panes/sprite-asset-pane.css';
import '@kubohiroya/turbowarp-plus-editor-sprite-panes/sprite-editor-toolbar.css';
import {desktopProjectKey, desktopWorkspaceLayoutStore, dockviewMultiViewEnabled, dockviewSpriteTabsEnabled,
    layoutFlags} from './config.ts';
import {WindowLayoutContext} from './context.ts';
import {isProjectLoading, loadedProjectTitle, projectScreenState, subscribeProjectLoad} from '../project-tools/index.ts';
import {projectFolderDirectory} from '../project-folder-host.ts';
import {StageDisplayMenuContext, TargetSwitchContext} from './context.ts';
import {openDetachedBlockPalette} from '../horizontal-block-palette/index.ts';
import {resources as categoryArtwork} from '@tw-plus/gui-block-category-artwork';
import {decorateSurface} from '../editor-backpack/surface-styles.ts';
import {plusCatalog} from '../plus-catalog.ts';
import loadPlusExtensions from '../extension-library/load-extensions.ts';
import {beginPlusReview, canLoadPlusExtension} from '../gui-integration/lib/tw-plus-extension-permissions.ts';
import {attachBackpackDrop} from '../editor-backpack/integration.ts';
import {attachCodePreviewMinimap} from '../workspace-minimap/index.ts';
import {hostIntegration} from '../gui-integration/lib/tw-plus-integration-points.ts';
import {createEditorTabLayout} from '@kubohiroya/turbowarp-plus-editor-workbench/editor-tabs';

export const {EditorTabLayout} = createEditorTabLayout({
    desktopCodeEnabled,
    openDesktopCode,
    styles,
    desktopProjectKey,
    desktopWorkspaceLayoutStore,
    dockviewMultiViewEnabled,
    dockviewSpriteTabsEnabled,
    layoutFlags,
    WindowLayoutContext,
    isProjectLoading,
    loadedProjectTitle,
    projectScreenState,
    subscribeProjectLoad,
    projectFolderDirectory,
    StageDisplayMenuContext,
    TargetSwitchContext,
    openDetachedBlockPalette,
    categoryArtwork,
    decorateSurface,
    plusCatalog,
    loadPlusExtensions,
    beginPlusReview,
    canLoadPlusExtension,
    attachBackpackDrop,
    attachCodePreviewMinimap,
    attachCodeNavigation: (workspace, blocks) => (hostIntegration() as {
        attachWorkspaceMinimap?: (workspace: object, blocks: object) => {dispose(): void};
    }).attachWorkspaceMinimap?.(workspace, blocks),
    getScratchBlocks: () => window.ScratchBlocks,
    assetTransferPort: () => (window as Window & {EditorPreload?: {projectAssetTransfer?: unknown}}).EditorPreload?.projectAssetTransfer,
    readOpenedFile: () => window.ReduxStore?.getState().scratchGui.tw.fileHandle,
    popupURL: typeof window === 'undefined' ? '' : new URL('dockview-popout.html', window.location.href).href,
    connectEditorTabs: component => connect(state => ({soundRecorderVisible: state.scratchGui.modals.soundRecorder}))(component)
});
