import React from 'react';
import {IconMenuButton} from '@kubohiroya/turbowarp-plus-editor-ui';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';
import {useDockviewStage} from '@kubohiroya/turbowarp-plus-editor-layout/sprite-tabs';
import {createStandardLayout} from '@kubohiroya/turbowarp-plus-editor-layout/standard-layout';
import styles from '@kubohiroya/turbowarp-plus-editor-layout/editor.css';
import targetStyles from '@kubohiroya/turbowarp-plus-editor-layout/targets.css';
import {EditorFullscreenButton, WindowDesktop, WindowList} from '@kubohiroya/turbowarp-plus-editor-layout/windows';
import '@kubohiroya/turbowarp-plus-editor-layout/windows.css';
import {EditorTabLayout} from './editor-tabs.tsx';
import {StageDisplayMenuContext, WindowLayoutContext} from './context.ts';
import {setHorizontalBlockPalette} from '../horizontal-block-palette/index.ts';

export {WindowLayoutContext} from './context.ts';
const startupSearch = typeof window === 'undefined' ? '' : window.location.search;
const startupParams = new URLSearchParams(startupSearch);
export const layoutFlags = readWebStartupFeatureFlags(startupSearch);
export const dockviewSpriteTabsEnabled = layoutFlags.standardLayout &&
    startupParams.get('twPlusDockviewSpriteTabs') !== '0';
export const dockviewMultiViewEnabled = dockviewSpriteTabsEnabled &&
    startupParams.get('twPlusDockview') === '1' && typeof EditorPreload === 'undefined';
export const stageDrawerEnabled = layoutFlags.standardLayout && layoutFlags.stageDisplayMenu &&
    startupParams.get('twPlusStageDrawer') !== '0';
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

export const layoutViews = createStandardLayout(React, {styles, targetStyles, context: WindowLayoutContext, LayoutMenu});

function LayoutDesktop(props) {
    return <WindowDesktop {...props} layoutMenu={layoutFlags.standardLayout} />;
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
    const [dockAction, setDockAction] = React.useState(null);
    const stage = useDockviewStage(dockviewMultiViewEnabled && layoutFlags.stageDisplayMenu, props.locale);
    const resizeStage = React.useCallback((surface: HTMLElement) => {
        const renderer = vm.renderer;
        if (!renderer?.canvas || !surface.contains(renderer.canvas)) return;
        const {width, height} = renderer.canvas.getBoundingClientRect();
        if (width > 0 && height > 0) renderer.resize(width, height);
    }, [vm]);
    return <StageDisplayMenuContext.Provider value={{dockAction, setDockAction, stage, resizeStage}}>
        <StandardLayout
            {...props}
            enabled={layoutFlags.standardLayout}
            splitter={layoutFlags.splitter}
            windowLayout={layoutFlags.windowLayout}
            stageDrawer={stageDrawerEnabled}
            stageActionEnabled={layoutFlags.stagePanel && !layoutFlags.stageDisplayMenu}
            storage={getStorage()}
            storageKey="twPlusEditorLayout"
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
    </StageDisplayMenuContext.Provider>;
};

export const EditorLayout = layoutFlags.standardLayout || layoutFlags.splitter || layoutFlags.windowLayout ? WebLayout : undefined;
