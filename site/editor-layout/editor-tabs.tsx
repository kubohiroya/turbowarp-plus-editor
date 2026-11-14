import React from 'react';
import {connect} from 'react-redux';
import {createAssetTransferPanel, type ProjectAssetTransferPort} from '@kubohiroya/turbowarp-script-transfer';
import {createSurface} from '@kubohiroya/turbowarp-editor-surfaces';
import {DockablePanel, OpenWindowButton, useWindowHost} from '@kubohiroya/turbowarp-plus-editor-windows';
import {desktopCodeEnabled, openDesktopCode} from '../editor-views/desktop-code.ts';
import styles from '@kubohiroya/turbowarp-plus-editor-workbench/editor.css';
import {SpriteTargetTabsContext, useSpriteTabs} from '@kubohiroya/turbowarp-plus-editor-workbench/sprite-tabs';
import {editSpriteVariable, readSpriteVariable, showSpriteVariableOnStage, writeSpriteVariableValue} from '@kubohiroya/turbowarp-plus-editor-project-model/sprite-variable-edit';
import {SpriteEditorToolbar, spriteEditorSections} from '@kubohiroya/turbowarp-plus-editor-sprite-panes/sprite-editor-toolbar';
import {editClonedSpriteVariable, SpriteCloneInspector, SpriteClonePagination, SpriteCloneVariables}
    from '@kubohiroya/turbowarp-plus-editor-sprite-panes/sprite-clone-inspector';
import {activateTargetView, centerProjectComment, connectProjectSearchNavigation, countVariableAccesses,
    openVariableSearch, renameProjectMessage,
    type SearchNavigation} from '@kubohiroya/turbowarp-plus-editor-ui/project-search';
import {scanTargetMessages} from '@kubohiroya/turbowarp-plus-editor-project-model/project-messages';
import type {SpriteVariable} from '@kubohiroya/turbowarp-plus-editor-sprite-panes/sprite-asset-pane';
import type {MessagePaneData} from '@kubohiroya/turbowarp-plus-editor-sprite-panes/sprite-message-pane';
import type {SpriteAssetKind, SpriteAssetPreviewData, SpriteAssetSelection} from '@kubohiroya/turbowarp-plus-editor-workbench/sprite-tabs';
import '@kubohiroya/turbowarp-plus-editor-workbench/dockview-styles';
import '@kubohiroya/turbowarp-plus-editor-workbench/sprite-layout-menu.css';
import '@kubohiroya/turbowarp-plus-editor-sprite-panes/sprite-asset-pane.css';
import '@kubohiroya/turbowarp-plus-editor-sprite-panes/sprite-editor-toolbar.css';
import type {WorkspaceProjectIdentity} from '@kubohiroya/turbowarp-plus-editor-workbench/sprite-tabs';
import {desktopProjectKey, desktopWorkspaceLayoutStore, dockviewMultiViewEnabled, dockviewSpriteTabsEnabled,
    layoutFlags, WindowLayoutContext} from './index.tsx';
import {isProjectLoading, loadedProjectTitle, subscribeProjectLoad} from '../project-tools/index.ts';
import {projectFolderDirectory} from '../project-folder-host.ts';
import {StageDisplayMenuContext, TargetSwitchContext} from './context.ts';
import {openDetachedBlockPalette} from '../horizontal-block-palette/index.ts';
import {resources as categoryArtwork} from '@tw-plus/gui-block-category-artwork';
import {decorateSurface} from '../editor-backpack/surface-styles.ts';
import {attachBackpackDrop} from '../editor-backpack/integration.ts';
import {attachCodePreviewMinimap} from '../workspace-minimap/index.ts';
import {BackCodeWindows, CodePaneCostumeThumbnail, createCodePaneAdapter, SpriteCodeProvider, useCodeWindows} from '@kubohiroya/turbowarp-plus-editor-views/sprite-code-windows';

const codeTab = 0;
const soundsTab = 2;
const categoryIcons = {
    motion: categoryArtwork['icons/motion_icon.svg'],
    looks: categoryArtwork['icons/looks_icon.svg'],
    sound: categoryArtwork['icons/sound_icon.svg'],
    events: categoryArtwork['icons/events_icon.svg'],
    control: categoryArtwork['icons/control_icon.svg'],
    sensing: categoryArtwork['icons/sensing_icon.svg'],
    operators: categoryArtwork['icons/operators_icon.svg'],
    variables: categoryArtwork['icons/variables_icon.svg'],
    lists: categoryArtwork['icons/list_icon.svg'],
    myBlocks: categoryArtwork['icons/block_icon.svg']
};

function AttachedCodePanel({children}: {children: React.ReactNode}) {
    const [attached, setAttached] = React.useState(false);
    // Blockly injects synchronously once cached. DockablePanel attaches its portal during commit.
    React.useLayoutEffect(() => setAttached(true), []);
    return attached ? children : null;
}

const thumbnails = new WeakMap<object, string>();
function assetImage(asset) {
    if (!asset?.encodeDataURI) return undefined;
    if (!thumbnails.has(asset)) thumbnails.set(asset, asset.encodeDataURI());
    return thumbnails.get(asset);
}

function readSpriteAssets(vm, targetId: string, kind: SpriteAssetKind): SpriteAssetPreviewData {
    const target = vm.runtime.getTargetById(targetId);
    if (!target) return {items: []};
    if (kind === 'costumes') {
        return {
            defaultAsset: target.getCurrentCostume(),
            items: target.getCostumes().map(costume => ({
                asset: costume, name: costume.name, imageUrl: assetImage(costume.asset)
            }))
        };
    }
    const bank = target.sprite.soundBank;
    return {items: target.getSounds().map(sound => ({
        asset: sound, name: sound.name,
        buffer: sound.soundId ? bank?.getSoundPlayer(sound.soundId)?.buffer : undefined,
        duration: sound.rate ? sound.sampleCount / sound.rate : undefined
    }))};
}

function readSpriteVariables(vm, id: string): SpriteVariable[] {
    const target = vm.runtime.getTargetById(id);
    const variables = Object.values<Parameters<typeof readSpriteVariable>[0]>(target?.variables ?? {})
        .flatMap(variable => readSpriteVariable(variable) ?? []);
    if (!variables.length) return variables;
    const counts = countVariableAccesses(vm.runtime, id);
    const monitors = vm.runtime.getMonitorState();
    return variables.map(variable => ({
        ...variable,
        monitor: {
            visible: Boolean(monitors.get(variable.id)?.visible),
            setVisible: visible => showSpriteVariableOnStage(vm.runtime, id, variable.id, visible)
        },
        accesses: {
            ...counts.get(variable.id) ?? {read: 0, write: 0},
            open: access => openVariableSearch(vm.runtime, {ownerId: id, variableId: variable.id, access})
        }
    }));
}
const resizeCode = () => {
    const blocks = window.ScratchBlocks;
    const workspace = blocks?.getMainWorkspace();
    if (workspace?.getInjectionDiv()?.clientWidth) blocks.svgResize(workspace);
};

type TransferKind = 'costume' | 'sound';
const assetTransferPort = () => (window as Window & {
    EditorPreload?: {projectAssetTransfer?: ProjectAssetTransferPort};
}).EditorPreload?.projectAssetTransfer;

function DesktopAssetPanel({vm, kind, locale, port, selection, child}: {
    vm: Parameters<typeof createAssetTransferPanel>[0];
    kind: TransferKind;
    locale: string;
    port: ProjectAssetTransferPort;
    selection?: SpriteAssetSelection;
    child: React.ReactElement<{assetSelection?: SpriteAssetSelection}>;
}) {
    const container = React.useRef<HTMLDivElement>(null);
    const toolbar = React.useRef<HTMLDivElement>(null);
    const controller = React.useMemo(() => createAssetTransferPanel(vm, kind, locale, port), [vm, kind, locale, port]);
    React.useLayoutEffect(() => controller.mount(toolbar.current, container.current), [controller]);
    const bridge = React.useMemo<SpriteAssetSelection>(() => ({
        ...selection,
        restore: selection?.restore ?? (() => undefined),
        remember(target, asset, select) {
            selection?.remember(target, asset, select);
            controller.remember(target, asset);
        }
    }), [controller, selection]);
    return <div ref={container} style={{display: 'flex', flex: 1, flexDirection: 'column', minWidth: 0, minHeight: 0}}>
        <div ref={toolbar} />
        {React.cloneElement(child, {assetSelection: bridge})}
    </div>;
}

type OpenedFile = {id?: string; name?: string; isSameEntry?: unknown};

/** Tell the loaded project apart by the folder or file it came from, so each one keeps its own Dockview layout. */
function identifyProject(vm): WorkspaceProjectIdentity {
    const name = loadedProjectTitle(vm) ?? '';
    const directory = projectFolderDirectory(vm);
    if (directory) return {kind: 'directory', name: directory.name, handle: directory};
    const file = (window as Window & {ReduxStore?: {getState(): {scratchGui: {tw: {fileHandle: OpenedFile | null}}}}})
        .ReduxStore?.getState().scratchGui.tw.fileHandle;
    if (file && typeof file.isSameEntry === 'function') {
        return {kind: 'file', name: file.name ?? name, handle: file as unknown as FileSystemFileHandle};
    }
    // The desktop app gives its own handles; it keys each SB3 by its path.
    const key = file?.id && desktopProjectKey ? desktopProjectKey(file.id) : null;
    if (key) return {kind: 'desktop', name: file.name ?? name, key};
    return {kind: 'anonymous', name};
}

function EditorTabs({vm, activeEditorTab, onActivateEditorTab, editorTargetIsStage, showUndock, locale, layout, render,
    soundRecorderVisible}) {
    const host = useWindowHost();
    const {plusLayout} = React.useContext(WindowLayoutContext);
    const stage = React.useContext(StageDisplayMenuContext)?.stage;
    const targetSwitch = React.useContext(TargetSwitchContext);
    // The stage uses the native fullscreen surface while Dockview keeps its panel and layout.
    const workspaceEnabled = plusLayout || Boolean(stage);
    const multiView = workspaceEnabled && dockviewMultiViewEnabled && typeof onActivateEditorTab === 'function';
    const workspaceLayout = React.useMemo(() => multiView ? {
        store: desktopWorkspaceLayoutStore,
        identify: () => identifyProject(vm),
        isProjectLoading: () => isProjectLoading(vm), subscribeProject: listener => subscribeProjectLoad(vm, listener)
    } : undefined, [multiView, vm]);
    const codePaneAdapter = React.useMemo(() =>
        createCodePaneAdapter(vm, locale, layoutFlags.workspaceMinimap ? attachCodePreviewMinimap : undefined), [vm, locale]);
    const popouts = React.useMemo(() => ({
        url: new URL('dockview-popout.html', window.location.href).href,
        openPalette: () => openDetachedBlockPalette({locale, categoryIcons, decorate: decorateSurface})
    }), [locale]);
    const code = useCodeWindows({vm, host, locale,
        enabled: !multiView && (layoutFlags.spriteCodeWindows || layoutFlags.standardLayout) && !desktopCodeEnabled});
    const [states, setStates] = React.useState([]);
    const action = React.useRef(null);
    const previousActive = React.useRef(null);
    const surfaces = React.useMemo(() => [0, 1, 2].map(index => createSurface(host, state => {
        setStates(previous => {
            const next = [...previous];
            next[index] = state;
            return next;
        });
    })), [host]);
    React.useLayoutEffect(() => () => surfaces.forEach(surface => surface.dock()), [surfaces]);

    const japanese = /^ja(?:-|$)/i.test(locale);
    const openLabel = japanese ? '別画面で開く' : 'Open in another window';
    const dockLabel = japanese ? 'ここに戻す' : 'Return here';
    const titles = japanese ? ['コード', editorTargetIsStage ? '背景' : 'コスチューム', '音'] :
        ['Code', editorTargetIsStage ? 'Backdrops' : 'Costumes', 'Sounds'];
    const title = titles[activeEditorTab];
    const activeState = states[activeEditorTab];
    React.useLayoutEffect(() => {
        const previous = previousActive.current;
        previousActive.current = {index: activeEditorTab, kind: activeState?.kind};
        if (showUndock && previous?.index === activeEditorTab && previous.kind === 'external' &&
                activeState?.kind === 'docked') {
            action.current?.querySelector('button')?.focus();
        }
    }, [activeEditorTab, activeState, showUndock]);
    React.useLayoutEffect(() => {
        const tabs = action.current?.parentElement?.parentElement;
        if (!tabs) return;
        const enableCodeFocus = event => {
            // Blockly focuses its SVG on mouse down, so make it programmatically focusable first.
            const svg = event.target.closest('.blocklySvg');
            if (svg && !svg.hasAttribute('tabindex')) svg.setAttribute('tabindex', '-1');
        };
        const focusPanel = event => {
            const panel = event.target.closest('[role="tabpanel"]');
            if (!panel || panel.contains(panel.ownerDocument.activeElement)) return;
            if (!panel.hasAttribute('tabindex')) panel.tabIndex = -1;
            panel.focus({preventScroll: true});
        };
        tabs.addEventListener('pointerdown', enableCodeFocus, true);
        tabs.addEventListener('click', focusPanel);
        return () => {
            tabs.removeEventListener('pointerdown', enableCodeFocus, true);
            tabs.removeEventListener('click', focusPanel);
        };
    }, [showUndock, title]);
    const getMount = index => {
        if (index === codeTab && code?.front) return code.front.mount;
        return states[index]?.kind === 'external' ? states[index].target.mount : undefined;
    };

    function open() {
        if (activeEditorTab === codeTab && desktopCodeEnabled) {
            openDesktopCode();
            return;
        }
        if (code && activeEditorTab === codeTab && !editorTargetIsStage) {
            code.openCurrent();
            return;
        }
        surfaces[activeEditorTab].undock({id: `basic-editor-tab-${activeEditorTab}`, title, rememberPlacement: true});
    }

    const tabAction = showUndock && title && (!multiView || activeEditorTab !== codeTab) && (
        <div className={`${styles.tabAction} ${styles.openWindowAction}`} ref={action}>
            <OpenWindowButton label={openLabel} onOpen={open} disabled={Boolean(activeState && activeState.kind !== 'docked')} />
        </div>
    );
    const renderEditorTabRow = tabs => layout.renderEditorTabRow ? layout.renderEditorTabRow(tabs, tabAction) :
        <div className={styles.tabRow}>{tabs}{tabAction}</div>;
    // The message section opens blocks through the same navigation the project search uses.
    const navigation = React.useRef<SearchNavigation | null>(null);
    const spriteTabs = useSpriteTabs({
        available: dockviewSpriteTabsEnabled, enabled: workspaceEnabled && dockviewSpriteTabsEnabled,
        vm, locale, className: styles.spriteTabs, activeSection: activeEditorTab,
        activateSection: onActivateEditorTab,
        ...{runTargetSwitch: targetSwitch?.select},
        resize: () => requestAnimationFrame(resizeCode),
        ...(multiView && {
            multiView, workspaceLayout, stagePane: stage?.pane, viewAdapter: codePaneAdapter, popouts,
            renderToolbar(view, actions) {
                const section = spriteEditorSections[view.section] ?? 'code';
                return <SpriteEditorToolbar viewId={view.id} locale={locale} section={section} isStage={view.isStage}
                    activeGroup={view.groupActive} propertiesInVariables
                    onSectionChange={next => actions.setSection(spriteEditorSections.indexOf(next))}
                    actions={section === 'variables' && !view.isStage ?
                        <SpriteClonePagination viewId={view.id} targetId={view.targetId} locale={locale} /> :
                        view.active && section !== 'variables' && section !== 'messages' ?
                        renderEditorTabRow(null) : undefined} />;
            },
            wrapVariablePane: (viewId, targetId, editable, pane) => vm.runtime.getTargetById(targetId)?.isStage ?
                React.cloneElement(pane, {global: {canAddCloudVariable: vm.runtime.canAddCloudVariable()}}) :
                <SpriteCloneVariables {...{viewId, targetId, locale, editable}}>{pane}</SpriteCloneVariables>,
            getAssetPreview: (id, kind) => readSpriteAssets(vm, id, kind),
            getVariables: id => readSpriteVariables(vm, id),
            editVariable: (id, edit) => editClonedSpriteVariable(vm, id, edit, () => editSpriteVariable(vm, id, edit)),
            getProperties(id) {
                const target = vm.runtime.getTargetById(id);
                if (!target || target.isStage) return;
                const {x, y, size, direction, visible, rotationStyle} = target;
                return {name: target.getName(), x, y, size, direction, visible, rotationStyle};
            },
            writeProperties(id, {name, ...patch}) {
                const target = vm.runtime.getTargetById(id);
                if (!target || target !== vm.editingTarget || target.isStage || (vm._dragTarget && vm._dragTarget !== target)) return;
                if (name !== undefined) {
                    const trimmed = name.trim();
                    if (trimmed && trimmed !== target.getName()) vm.renameSprite(id, trimmed);
                } else vm.postSpriteInfo(patch);
            },
            writeVariable(id, variableId, value) {
                if (writeSpriteVariableValue(vm, id, variableId, value)) {
                    vm.runtime.emitProjectChanged();
                }
            },
            getMessages: (id): MessagePaneData => ({
                ...scanTargetMessages(vm.runtime, id),
                getThumbnailUrl: targetId => assetImage(vm.runtime.getTargetById(targetId)?.getCurrentCostume()?.asset)
            }),
            openMessage(use) {
                const search = navigation.current;
                if (!search || !activateTargetView(search, use.targetId, codeTab)) return;
                requestAnimationFrame(() => search.centerBlock(use.blockId));
            },
            openMessageTarget(id) {
                if (navigation.current) activateTargetView(navigation.current, id, codeTab);
            },
            renameMessage(message, name) {
                const workspace = window.ScratchBlocks?.getMainWorkspace();
                if (!workspace || !message.id) return 'unavailable';
                const outcome = renameProjectMessage(vm.runtime, workspace, message.id, name);
                return outcome === 'applied' ? undefined : outcome === 'conflict' ? 'duplicateName' : 'unavailable';
            }
        })
    });
    React.useLayoutEffect(() => {
        if (!multiView) return;
        const current: SearchNavigation = {
            getViews: () => spriteTabs.controller.current,
            getTarget: id => vm.runtime.getTargetById(id),
            getEditingTarget: () => vm.editingTarget,
            centerBlock(id) {
                const workspace = window.ScratchBlocks?.getMainWorkspace();
                if (workspace?.getBlockById(id)) workspace.centerOnBlock(id);
            },
            centerComment(id, blockId) {
                centerProjectComment(window.ScratchBlocks?.getMainWorkspace(), id, blockId);
            },
            replacementContext() {
                const Blockly = window.ScratchBlocks;
                const workspace = Blockly?.getMainWorkspace();
                return workspace?.isVisible() ? {workspace, Blockly} : undefined;
            }
        };
        navigation.current = current;
        const disconnect = connectProjectSearchNavigation(vm.runtime, current);
        let refreshFrame: number | undefined;
        const refreshVariables = () => {
            const views = spriteTabs.controller.current;
            if (refreshFrame !== undefined || !views?.views().some(view => view.section === spriteEditorSections.indexOf('variables'))) return;
            refreshFrame = requestAnimationFrame(() => {
                refreshFrame = undefined;
                spriteTabs.controller.current?.refreshSurfaces();
            });
        };
        let visibleMonitors = new Set<string>();
        const refreshMonitorVisibility = monitors => {
            const next = new Set<string>();
            for (const monitor of monitors.values()) {
                if (monitor.visible && (monitor.opcode === 'data_variable' || monitor.opcode === 'data_listcontents')) next.add(monitor.id);
            }
            if (next.size === visibleMonitors.size && [...next].every(id => visibleMonitors.has(id))) return;
            visibleMonitors = next;
            refreshVariables();
        };
        vm.on('PROJECT_CHANGED', refreshVariables);
        vm.on('MONITORS_UPDATE', refreshMonitorVisibility);
        refreshMonitorVisibility(vm.runtime.getMonitorState());
        return () => {
            vm.removeListener('PROJECT_CHANGED', refreshVariables);
            vm.removeListener('MONITORS_UPDATE', refreshMonitorVisibility);
            if (refreshFrame !== undefined) cancelAnimationFrame(refreshFrame);
            if (navigation.current === current) navigation.current = null;
            disconnect();
        };
    }, [multiView, vm, spriteTabs.controller]);
    const connectAssetSelection = (index: number, child: React.ReactNode) => {
        const assetSelection = index === 1 ? spriteTabs.assetSelections?.costumes : index === 2 ? spriteTabs.assetSelections?.sounds : undefined;
        if (!React.isValidElement<{assetSelection?: SpriteAssetSelection}>(child)) return child;
        const kind = index === 1 ? 'costume' : index === 2 ? 'sound' : undefined;
        const port = kind && assetTransferPort();
        if (port) return <DesktopAssetPanel {...{vm, kind, locale, port, selection: assetSelection, child}} />;
        return assetSelection ? React.cloneElement(child, {assetSelection}) : child;
    };

    const content = render({...layout,
        renderEditorTabRow: tabs => {
            const row = multiView ? tabs : renderEditorTabRow(tabs);
            return spriteTabs.renderEditorTabRow ? spriteTabs.renderEditorTabRow(row) : row;
        },
        // The recorder is hosted by the sound panel and must survive editor tab switches.
        isEditorPanelOpen: index => Boolean(getMount(index)) || (index === soundsTab && soundRecorderVisible),
        renderEditorPanel: (index, children) => {
            const panel = <DockablePanel
                dockLabel={dockLabel}
                mount={getMount(index)}
                onDock={() => index === codeTab && code?.front ? code.front.connection.close() : surfaces[index].dock()}
                onResize={index === codeTab ? resizeCode : undefined}
            >{index === codeTab ? <AttachedCodePanel>
                {children}
                {multiView && <CodePaneCostumeThumbnail adapter={codePaneAdapter} />}
            </AttachedCodePanel> :
                connectAssetSelection(index, children)}</DockablePanel>;
            return spriteTabs.renderEditorPanel ? spriteTabs.renderEditorPanel(index, panel) : panel;
        }
    });
    const selection = spriteTabs.context;
    const editorCommands = selection && code ? {...selection, open: code.context.open} : selection ?? code?.context ?? null;
    return <SpriteTargetTabsContext.Provider value={spriteTabs.listTabs}><SpriteCodeProvider value={editorCommands}>
        <SpriteCloneInspector vm={vm}>{content}</SpriteCloneInspector>
        {code && <BackCodeWindows vm={vm} windows={code.windows} front={code.front}
            attachBackpackDrop={attachBackpackDrop} />}
    </SpriteCodeProvider></SpriteTargetTabsContext.Provider>;
}

export const EditorTabLayout = connect(state => ({
    soundRecorderVisible: state.scratchGui.modals.soundRecorder
}))(EditorTabs);
