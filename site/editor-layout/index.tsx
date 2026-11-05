import React from 'react';
import {IconMenuButton} from '@kubohiroya/turbowarp-plus-editor-ui';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';
import {createStandardLayout} from '@kubohiroya/turbowarp-editor-layout/standard-layout';
import styles from '@kubohiroya/turbowarp-editor-layout/editor.css';
import targetStyles from '@kubohiroya/turbowarp-editor-layout/targets.css';
import {EditorFullscreenButton, WindowDesktop, WindowList} from '@kubohiroya/turbowarp-editor-windows';
import '@kubohiroya/turbowarp-editor-windows/styles.css';
import {EditorTabLayout} from './editor-tabs.tsx';
import {StageDisplayMenuContext, WindowLayoutContext} from './context.ts';
import {setHorizontalBlockPalette} from '../horizontal-block-palette/index.ts';

export {WindowLayoutContext} from './context.ts';
export const layoutFlags = readWebStartupFeatureFlags(typeof window === 'undefined' ? '' : window.location.search);
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

const WebLayout = ({activeEditorTab, editorTargetIsStage, vm, ...props}) => {
    const {StandardLayout} = layoutViews;
    const [dockAction, setDockAction] = React.useState(null);
    return <StageDisplayMenuContext.Provider value={{dockAction, setDockAction}}>
        <StandardLayout
            {...props}
            enabled={layoutFlags.standardLayout}
            splitter={layoutFlags.splitter}
            windowLayout={layoutFlags.windowLayout}
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
