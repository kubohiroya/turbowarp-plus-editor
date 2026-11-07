import React from 'react';
import {connect} from 'react-redux';
import {createAssetTransferPanel, type ProjectAssetTransferPort} from '@kubohiroya/turbowarp-script-transfer';
import {createSurface} from '@kubohiroya/turbowarp-editor-surfaces';
import {DockablePanel, OpenWindowButton, useWindowHost} from '@kubohiroya/turbowarp-plus-editor-layout/windows';
import {desktopCodeEnabled, openDesktopCode} from '../editor-views/desktop-code.ts';
import styles from '@kubohiroya/turbowarp-plus-editor-layout/editor.css';
import {useSpriteTabs} from '@kubohiroya/turbowarp-plus-editor-layout/sprite-tabs';
import type {SpriteVariable} from '@kubohiroya/turbowarp-plus-editor-layout/sprite-asset-pane';
import type {SpriteAssetKind, SpriteAssetPreviewData, SpriteAssetSelection} from '@kubohiroya/turbowarp-plus-editor-layout/sprite-tabs';
import '@kubohiroya/turbowarp-plus-editor-layout/dockview-styles';
import '@kubohiroya/turbowarp-plus-editor-layout/sprite-layout-menu.css';
import '@kubohiroya/turbowarp-plus-editor-layout/sprite-asset-pane.css';
import '@kubohiroya/turbowarp-plus-editor-layout/sprite-editor-toolbar.css';
import {dockviewMultiViewEnabled, dockviewSpriteTabsEnabled, desktopWorkspaceLayout, externalYamlPort, layoutFlags, WindowLayoutContext} from './index.tsx';
import {isProjectLoading, subscribeProjectLoad} from '../project-tools/index.ts';
import {StageDisplayMenuContext} from './context.ts';
import {attachBackpackDrop} from '../editor-backpack/integration.ts';
import {attachCodePreviewMinimap} from '../workspace-minimap/index.ts';
import {BackCodeWindows, CodePaneCostumeThumbnail, createCodePaneAdapter, SpriteCodeProvider, useCodeWindows} from '@kubohiroya/turbowarp-plus-editor-views/sprite-code-windows';

const codeTab = 0;
const soundsTab = 2;

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
    const stage = vm.runtime.getTargetForStage();
    if (!target) return [];
    const read = (owner, scope: SpriteVariable['scope']) =>
        Object.values(owner?.variables ?? {}).flatMap((variable: {id: string; name: string; type: string; value: unknown}) =>
            variable.type === '' && (typeof variable.value === 'string' || typeof variable.value === 'number') ?
                [{id: variable.id, name: variable.name, value: variable.value, scope}] : []);
    return target === stage ? read(stage, 'global') : [...read(target, 'local'), ...read(stage, 'global')];
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

function EditorTabs({vm, activeEditorTab, onActivateEditorTab, editorTargetIsStage, showUndock, locale, layout, render,
    soundRecorderVisible}) {
    const host = useWindowHost();
    const {plusLayout} = React.useContext(WindowLayoutContext);
    const stage = React.useContext(StageDisplayMenuContext)?.stage;
    // The stage uses the native fullscreen surface while Dockview keeps its panel and layout.
    const workspaceEnabled = plusLayout || Boolean(stage);
    const multiView = workspaceEnabled && dockviewMultiViewEnabled && typeof onActivateEditorTab === 'function';
    const layoutStorage = React.useMemo(() => {
        if (!multiView || (externalYamlPort && !desktopWorkspaceLayout)) return;
        try {
            const storage = desktopWorkspaceLayout ? {
                getItem: () => desktopWorkspaceLayout.read(),
                setItem: (_key: string, raw: string) => desktopWorkspaceLayout.write(raw)
            } : window.localStorage;
            return {storage, key: 'twPlusDockviewLayout',
                isProjectLoading: () => isProjectLoading(vm), subscribeProject: listener => subscribeProjectLoad(vm, listener)};
        } catch { /* Storage is optional. */ }
    }, [multiView, vm]);
    const codePaneAdapter = React.useMemo(() =>
        createCodePaneAdapter(vm, locale, layoutFlags.workspaceMinimap ? attachCodePreviewMinimap : undefined), [vm, locale]);
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

    const tabAction = showUndock && title && <div className={`${styles.tabAction} ${styles.openWindowAction}`} ref={action}>
        <OpenWindowButton label={openLabel} onOpen={open} disabled={Boolean(activeState && activeState.kind !== 'docked')} />
    </div>;
    const renderEditorTabRow = tabs => layout.renderEditorTabRow ? layout.renderEditorTabRow(tabs, tabAction) :
        <div className={styles.tabRow}>{tabs}{tabAction}</div>;
    const spriteTabs = useSpriteTabs({
        available: dockviewSpriteTabsEnabled, enabled: workspaceEnabled && dockviewSpriteTabsEnabled,
        vm, locale, className: styles.spriteTabs, activeSection: activeEditorTab,
        activateSection: onActivateEditorTab,
        resize: () => requestAnimationFrame(resizeCode),
        ...(multiView && {
            multiView, layoutStorage, stagePane: stage?.pane, activeTools: renderEditorTabRow(null), viewAdapter: codePaneAdapter,
            getAssetPreview: (id, kind) => readSpriteAssets(vm, id, kind),
            getVariables: id => readSpriteVariables(vm, id),
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
                const target = vm.runtime.getTargetById(id);
                const stage = vm.runtime.getTargetForStage();
                const owner = target?.variables[variableId] ? target : stage?.variables[variableId] ? stage : undefined;
                if (owner && vm.setVariableValue(owner.id, variableId, value)) vm.runtime.emitProjectChanged();
            },
            getCodeSearchItems(id) {
                if (vm.editingTarget?.id !== id) return [];
                const workspace = window.ScratchBlocks?.getMainWorkspace();
                return (workspace?.getAllBlocks(false) ?? []).filter(block => !block.isShadow())
                    .map(block => ({id: block.id, label: block.toString(160)}));
            },
            openCodeSearchResult(id, blockId) {
                if (vm.editingTarget?.id !== id) return;
                const workspace = window.ScratchBlocks?.getMainWorkspace();
                if (workspace?.getBlockById(blockId)) workspace.centerOnBlock(blockId);
            }
        })
    });
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
    return <SpriteCodeProvider value={editorCommands}>
        {content}
        {code && <BackCodeWindows vm={vm} windows={code.windows} front={code.front}
            attachBackpackDrop={attachBackpackDrop} />}
    </SpriteCodeProvider>;
}

export const EditorTabLayout = connect(state => ({
    soundRecorderVisible: state.scratchGui.modals.soundRecorder
}))(EditorTabs);
