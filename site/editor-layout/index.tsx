import React from 'react';
import type {ExternalYamlFilePort} from '@kubohiroya/turbowarp-document-editor';
import {IconMenuButton} from '@kubohiroya/turbowarp-plus-editor-ui';
import {createTargetSwitchFeedback} from '@kubohiroya/turbowarp-plus-editor-ui/busy-cursor';
import {connectDesktopWorkspaceLayouts, type DesktopWorkspaceLayouts} from './desktop-workspace-layout.ts';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';
import {getDocumentWorkspace, useDockviewStage} from '@kubohiroya/turbowarp-plus-editor-workbench/sprite-tabs';
import {createStandardLayout} from '@kubohiroya/turbowarp-plus-editor-workbench/standard-layout';
import styles from '@kubohiroya/turbowarp-plus-editor-workbench/editor.css';
import targetStyles from '@kubohiroya/turbowarp-plus-editor-workbench/targets.css';
import {EditorFullscreenButton, WindowDesktop, WindowList} from '@kubohiroya/turbowarp-plus-editor-windows';
import '@kubohiroya/turbowarp-plus-editor-windows/styles.css';
import {BasicPanel} from './basic-panel.tsx';
import {createWebPanelHost} from './desktop-panel-host.ts';
import {decorateSurface} from '../editor-backpack/surface-styles.ts';
import {EditorTabLayout} from './editor-tabs.tsx';
import {stageLauncherSlot, StageDisplayMenuContext, TargetSwitchContext, WindowLayoutContext} from './context.ts';
import {setHorizontalBlockPalette} from '../horizontal-block-palette/index.ts';
import {renderProjectFolderExplorer} from '@kubohiroya/turbowarp-plus-editor-project-folder/explorer';
import type {FollowExplorerGit, FollowFileStatuses} from '@kubohiroya/turbowarp-plus-editor-project-folder/explorer';
import {followExplorerGit, followFileStatuses, readProjectHeadFile, renderHistoryView} from '@kubohiroya/turbowarp-plus-editor-git';
import {createAiAgents} from '@kubohiroya/turbowarp-plus-editor-workbench/ai-agents';
import {projectFolderWorkflows} from '../project-folder-host.ts';
import {createFolderFromCurrentProject} from '../project-tools/index.ts';

export {WindowLayoutContext} from './context.ts';
const startupSearch = typeof window === 'undefined' ? '' : window.location.search;
const startupParams = new URLSearchParams(startupSearch);
export const layoutFlags = readWebStartupFeatureFlags(startupSearch);
export const dockviewSpriteTabsEnabled = layoutFlags.standardLayout &&
    startupParams.get('twPlusDockviewSpriteTabs') !== '0';
const desktopHost = typeof window !== 'undefined' && (window as Window & {
    EditorPreload?: {
        externalYaml?: ExternalYamlFilePort;
        /** The key the Dockview layout of an opened SB3 is kept under. */
        workspaceProjectKey?(fileId: string): string | null;
        workspaceLayouts?: DesktopWorkspaceLayouts | null;
    };
}).EditorPreload;
export const dockviewMultiViewEnabled = dockviewSpriteTabsEnabled && startupParams.get('twPlusDockview') !== '0' &&
    (typeof EditorPreload === 'undefined' || Boolean(desktopHost && desktopHost.externalYaml));
export const externalYamlPort = dockviewMultiViewEnabled && desktopHost && desktopHost.externalYaml;
export const desktopProjectKey = desktopHost && desktopHost.workspaceProjectKey;
export const desktopWorkspaceLayoutStore = desktopHost?.workspaceLayouts ?
    connectDesktopWorkspaceLayouts(desktopHost.workspaceLayouts) : undefined;
export const stageDrawerEnabled = layoutFlags.standardLayout && layoutFlags.stageDisplayMenu &&
    startupParams.get('twPlusStageDrawer') !== '0';
export const stageLauncherEnabled = stageDrawerEnabled && startupParams.get('twPlusStageLauncher') !== '0';
export const stageCanUndock = layoutFlags.stagePanel || (layoutFlags.standardLayout && layoutFlags.stageDisplayMenu);
const layoutMenuIcon = (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="6" cy="12" r="1.5" />
        <circle cx="12" cy="12" r="1.5" />
        <circle cx="18" cy="12" r="1.5" />
    </svg>
);

function LayoutMenu({label, undockLabel, showUndock, onToggle}) {
    return <IconMenuButton label={label} icon={layoutMenuIcon} className={styles.layoutMenu} items={[{
        id: 'show-undock', label: undockLabel, checked: showUndock, checkbox: true, onSelect: onToggle
    }]} />;
}

const drawerPanelHosts = {
    project: createWebPanelHost('project-folder', 540, 500),
    'git-history': createWebPanelHost('git-history', 540, 500),
    agents: createWebPanelHost('ai-agents', 400, 380)
};

function DrawerPanel({id, title, dockRequest, renderHeading, renderContent}) {
    const externalHost = drawerPanelHosts[id];
    return <BasicPanel id={id} title={title} externalHost={externalHost} externalOnly={Boolean(externalHost)}
        alwaysShowUndock dockRequest={dockRequest} renderDockHeading={renderHeading} render={renderContent}
        decorate={decorateSurface} renderInExternalDocument />;
}

export const layoutViews = createStandardLayout(React, {styles, targetStyles, context: WindowLayoutContext, LayoutMenu, DrawerPanel});

function LayoutDesktop(props) {
    return <WindowDesktop {...props} layoutMenu={layoutFlags.standardLayout} />;
}

const aiAgents = createAiAgents(React, {styles});

const getStorage = () => {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
};

const WebLayout = ({activeEditorTab, onActivateEditorTab, editorTargetIsStage, vm, ...props}) => {
    const {StandardLayout} = layoutViews;
    const [dockAction, setDockAction] = React.useState(null);
    const openDrawer = React.useRef<() => void>(null);
    const closeDrawer = React.useRef<() => void>(null);
    const targetSwitch = React.useMemo(() => createTargetSwitchFeedback(vm, document), [vm]);
    React.useLayoutEffect(() => targetSwitch.cancel, [targetSwitch]);
    const stage = useDockviewStage(dockviewMultiViewEnabled && layoutFlags.stageDisplayMenu, props.locale);
    const launcher = React.useMemo(() => stageLauncherEnabled ?
        {mount: stageLauncherSlot(vm), styles, MenuButton: IconMenuButton} : undefined, [vm]);
    // The project folder and the local Git panel need a folder picker; both views show what those already hold.
    // The AI agent menu needs nothing of the kind.
    const drawerViews = React.useMemo(() => {
        const agents = {id: 'agents' as const, render: aiAgents.renderPanel};
        if (typeof (window as Window & {showDirectoryPicker?: unknown}).showDirectoryPicker !== 'function') return {views: [agents]};
        const fileStatuses: FollowFileStatuses = (directory, update) => followFileStatuses(vm, directory, update);
        const git: FollowExplorerGit = (directory, update) => followExplorerGit(vm, directory, update);
        const readBaseline = (directory: FileSystemDirectoryHandle, path: string, limit: number) =>
            readProjectHeadFile(vm, directory, path, limit);
        const workspace = getDocumentWorkspace(vm);
        const followFileEdits = (directory: FileSystemDirectoryHandle, update: (paths: readonly string[]) => void) => {
            const publish = () => update(workspace.fileEdits().filter(file => file.directory === directory).map(file => file.path));
            publish();
            return workspace.subscribeSave(publish);
        };
        const onSelectionChange = view => workspace.setSaveScope(view === 'project' ? 'tab' : 'project');
        const createFolder = () => createFolderFromCurrentProject(vm, projectFolderWorkflows(vm)?.createFolder);
        return {onSelectionChange, views: [
            {id: 'project' as const, searchLabel: locale => /^ja(?:-|$)/i.test(locale) ? '作品のファイルを検索' : 'Search project files',
                render: ({locale, query}) =>
                    renderProjectFolderExplorer(React.createElement, {vm, locale, query, createFolder, fileStatuses, git,
                        openFile: workspace.open, readBaseline, followFileEdits})},
            {id: 'git-history' as const, searchLabel: locale => /^ja(?:-|$)/i.test(locale) ? 'コミットを検索' : 'Search commits',
                render: ({locale, query}) => renderHistoryView(React.createElement, {vm, locale, query})},
            agents
        ]};
    }, [vm]);
    const resizeStage = React.useCallback((surface: HTMLElement) => {
        const renderer = vm.renderer;
        if (!renderer?.canvas || !surface.contains(renderer.canvas)) return;
        const {width, height} = renderer.canvas.getBoundingClientRect();
        if (width > 0 && height > 0) renderer.resize(width, height);
    }, [vm]);
    const layout = (
        <StandardLayout
            {...props}
            enabled={layoutFlags.standardLayout}
            splitter={layoutFlags.splitter}
            windowLayout={layoutFlags.windowLayout}
            stageDrawer={stageDrawerEnabled}
            stageActionEnabled={layoutFlags.stagePanel && !layoutFlags.stageDisplayMenu}
            storage={getStorage()}
            storageKey="twPlusEditorLayout"
            drawerViews={drawerViews}
            stageDrawerLayout={stage?.drawerLayout}
            updateStageDrawer={stage?.updateDrawer}
            onPaletteModeChange={setHorizontalBlockPalette}
            Container={layoutFlags.internalWindows || layoutFlags.standardLayout || stageCanUndock ? LayoutDesktop : undefined}
            windowTools={<>
                {layoutFlags.internalWindows && <EditorFullscreenButton className={styles.toggle} locale={props.locale} />}
                <WindowList />
            </>}
            render={layoutFlags.internalWindows || layoutFlags.standardLayout ? (layout, showUndock) => <EditorTabLayout
                vm={vm}
                activeEditorTab={activeEditorTab}
                onActivateEditorTab={onActivateEditorTab}
                editorTargetIsStage={editorTargetIsStage}
                showUndock={layoutFlags.standardLayout || showUndock}
                layout={layout}
                locale={props.locale}
                render={props.render}
            /> : props.render}
        />
    );
    return <TargetSwitchContext.Provider value={targetSwitch}>
        <StageDisplayMenuContext.Provider value={{dockAction, setDockAction, stage, resizeStage, launcher, openDrawer, closeDrawer}}>
            {layout}
        </StageDisplayMenuContext.Provider>
    </TargetSwitchContext.Provider>;
};

export const EditorLayout = layoutFlags.standardLayout || layoutFlags.splitter || layoutFlags.windowLayout ? WebLayout : undefined;
