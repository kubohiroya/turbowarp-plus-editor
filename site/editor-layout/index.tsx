import React from 'react';
import {createTargetSwitchFeedback} from '@kubohiroya/turbowarp-plus-editor-workbench/busy-cursor';
import {getDocumentWorkspace, useDockviewStage} from '@kubohiroya/turbowarp-plus-editor-workbench/sprite-tabs';
import {createStandardLayout} from '@kubohiroya/turbowarp-plus-editor-workbench/standard-layout';
import {useLayoutPreference} from '@kubohiroya/turbowarp-plus-editor-workbench/layout-preference';
import styles from '@kubohiroya/turbowarp-plus-editor-workbench/editor.css';
import targetStyles from '@kubohiroya/turbowarp-plus-editor-workbench/targets.css';
import {EditorFullscreenButton, IconMenuButton, WindowDesktop, WindowList} from '@kubohiroya/turbowarp-plus-editor-windows';
import '@kubohiroya/turbowarp-plus-editor-windows/styles.css';
import {BasicPanel} from './basic-panel.tsx';
import {createWebPanelHost} from './desktop-panel-host.ts';
import {decorateSurface} from '../editor-backpack/surface-styles.ts';
import {EditorTabLayout} from './editor-tabs.tsx';
import {stageLauncherSlot, StageDisplayMenuContext, TargetSwitchContext, WindowLayoutContext} from './context.ts';
import {setHorizontalBlockPalette} from '../horizontal-block-palette/index.ts';
import {explorerSearchLabel, renderProjectFolderExplorer} from '@kubohiroya/turbowarp-plus-editor-project-folder/explorer';
import type {FollowExplorerGit, FollowFileStatuses} from '@kubohiroya/turbowarp-plus-editor-project-folder/explorer';
import {followExplorerGit, followFileStatuses, historySearchLabel, readProjectHeadFile, renderHistoryView} from '@kubohiroya/turbowarp-plus-editor-git';
import {aiAgents} from '../project-tools/info-menu.tsx';
import {projectFolderWorkflows} from '../project-folder-host.ts';
import {testRunMenuItems} from '../test-run/editor.ts';
import {createFolderFromCurrentProject, projectScreenState} from '../project-tools/index.ts';

export {WindowLayoutContext} from './context.ts';
export {layoutFlags, dockviewSpriteTabsEnabled, dockviewMultiViewEnabled, externalYamlPort,
    desktopProjectKey, desktopWorkspaceLayoutStore, stageDrawerEnabled, stageLauncherEnabled, stageCanUndock} from './config.ts';
import {layoutFlags, dockviewSpriteTabsEnabled, dockviewMultiViewEnabled, externalYamlPort,
    desktopWorkspaceLayoutStore, stageDrawerEnabled, stageLauncherEnabled, stageCanUndock, layoutPreference} from './config.ts';
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
    const {plusLayout} = React.useContext(WindowLayoutContext);
    return <WindowDesktop {...props} layoutMenu={plusLayout} />;
}

const getStorage = () => {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
};

const WebLayout = ({activeEditorTab, onActivateEditorTab, editorTargetIsStage, vm, ...props}) => {
    const {StandardLayout} = layoutViews;
    const newLayoutEnabled = useLayoutPreference(layoutPreference);
    const [dockAction, setDockAction] = React.useState(null);
    const openDrawer = React.useRef<() => void>(null);
    const closeDrawer = React.useRef<() => void>(null);
    const targetSwitch = React.useMemo(() => createTargetSwitchFeedback(vm, document), [vm]);
    React.useLayoutEffect(() => targetSwitch.cancel, [targetSwitch]);
    const stage = useDockviewStage(dockviewMultiViewEnabled && layoutFlags.stageDisplayMenu, props.locale, newLayoutEnabled);
    const launcher = React.useMemo(() => stageLauncherEnabled && newLayoutEnabled ?
        {mount: stageLauncherSlot(vm), styles, MenuButton: IconMenuButton, menuItems: testRunMenuItems} : undefined, [vm, newLayoutEnabled]);
    // The project folder and the local Git panel need a folder picker, or the browser's own storage (OPFS) where there is
    // none, as in Safari and Firefox (#660); both views show what those already hold. The AI agent menu needs neither.
    const drawerViews = React.useMemo(() => {
        const agents = {id: 'agents' as const, render: aiAgents.renderPanel};
        const picker = typeof (window as Window & {showDirectoryPicker?: unknown}).showDirectoryPicker === 'function';
        if (!picker && typeof navigator.storage?.getDirectory !== 'function') return {views: [agents]};
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
            {id: 'project' as const, searchLabel: explorerSearchLabel,
                render: ({locale, query}) =>
                    renderProjectFolderExplorer(React.createElement, {vm, locale, query, createFolder, fileStatuses, git,
                        openFile: workspace.open, readBaseline, followFileEdits})},
            ...(layoutFlags.localGit ? [
                {id: 'git-history' as const, searchLabel: historySearchLabel,
                    render: ({locale, query}) => renderHistoryView(React.createElement, {vm, locale, query})}
            ] : []),
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
            enabled={newLayoutEnabled}
            splitter={layoutFlags.splitter}
            windowLayout={layoutFlags.windowLayout}
            stageDrawer={stageDrawerEnabled}
            stageActionEnabled={layoutFlags.stagePanel && !layoutFlags.stageDisplayMenu}
            storage={getStorage()}
            storageKey="twPlusEditorLayout"
            drawerViews={drawerViews}
            screenState={projectScreenState(vm)}
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
                showUndock={newLayoutEnabled || showUndock}
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
