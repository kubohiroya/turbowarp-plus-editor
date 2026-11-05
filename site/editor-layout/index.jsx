import React from 'react';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';
import {createStandardLayout} from '@kubohiroya/turbowarp-editor-layout/standard-layout';
import styles from '@kubohiroya/turbowarp-editor-layout/editor.css';
import targetStyles from '@kubohiroya/turbowarp-editor-layout/targets.css';
import {EditorFullscreenButton, WindowDesktop, WindowList} from '@kubohiroya/turbowarp-editor-windows';
import '@kubohiroya/turbowarp-editor-windows/styles.css';
import {EditorTabLayout} from './editor-tabs.jsx';
import {StageDisplayMenuContext, WindowLayoutContext} from './context.js';
import {setHorizontalBlockPalette} from '../horizontal-block-palette/index.js';

export {WindowLayoutContext} from './context.js';
export const layoutFlags = readWebStartupFeatureFlags(typeof window === 'undefined' ? '' : window.location.search);
export const layoutViews = createStandardLayout(React, {styles, targetStyles, context: WindowLayoutContext});

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
            Container={layoutFlags.internalWindows ? WindowDesktop : undefined}
            windowTools={layoutFlags.internalWindows && <>
                <EditorFullscreenButton className={styles.toggle} locale={props.locale} />
                <WindowList />
            </>}
            render={layoutFlags.internalWindows ? (layout, showUndock) => <EditorTabLayout
                vm={vm}
                activeEditorTab={activeEditorTab}
                editorTargetIsStage={editorTargetIsStage}
                showUndock={showUndock}
                layout={layout}
                locale={props.locale}
                render={props.render}
            /> : props.render}
        />
    </StageDisplayMenuContext.Provider>;
};

export const EditorLayout = layoutFlags.standardLayout || layoutFlags.splitter || layoutFlags.windowLayout ? WebLayout : undefined;
