import React from 'react';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';
import {createLayout} from '@kubohiroya/turbowarp-editor-layout';
import {EditorFullscreenButton, WindowDesktop, WindowList} from '@kubohiroya/turbowarp-editor-windows';
import '@kubohiroya/turbowarp-editor-windows/styles.css';
import styles from './layout.css';
import {EditorTabLayout} from './editor-tabs.jsx';

export const layoutFlags = readWebStartupFeatureFlags(typeof window === 'undefined' ? '' : window.location.search);
export const WindowLayoutContext = React.createContext({showUndock: false, locale: 'en'});
const SplitLayout = createLayout(React);
const storageKey = 'twPlusEditorLayout';

const getStorage = () => {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
};

const WebLayout = ({activeEditorTab, editorTargetIsStage, ...props}) => {
    const [showUndock, setShowUndock] = React.useState(false);
    const japanese = props.locale === 'ja' || props.locale?.startsWith('ja-');
    const toggleLabel = japanese ? 'アンドックボタンを表示' : 'Show undock buttons';
    const toggle = (
        <button
            aria-label={toggleLabel}
            aria-pressed={showUndock}
            className={styles.toggle}
            title={toggleLabel}
            type="button"
            onClick={() => setShowUndock(value => !value)}
        >
            <span aria-hidden="true">⚓</span>
        </button>
    );
    const stageTools = layoutFlags.internalWindows ? <>
        {toggle}
        <EditorFullscreenButton className={styles.toggle} locale={props.locale} />
        <WindowList />
    </> : (layoutFlags.windowLayout ? toggle : null);
    const layout = (
        <SplitLayout
            {...props}
            enabled={layoutFlags.splitter}
            labels={{
                columns: japanese ? '編集領域とステージ列の幅' : 'Editor and stage column width',
                rows: japanese ? 'ステージと対象領域の高さ' : 'Stage and target pane height'
            }}
            minimumEditor={500}
            minimumStageColumn={350}
            minimumStageRow={135}
            minimumTargets={175}
            separatorClassName={styles.separator}
            stageTools={stageTools}
            storage={getStorage()}
            storageKey={storageKey}
            render={layoutFlags.internalWindows ? layout => <EditorTabLayout
                activeEditorTab={activeEditorTab}
                editorTargetIsStage={editorTargetIsStage}
                showUndock={showUndock}
                layout={layout}
                locale={props.locale}
                render={props.render}
            /> : props.render}
        />
    );
    return (
        <WindowLayoutContext.Provider value={{showUndock, locale: props.locale}}>
            {layoutFlags.internalWindows ? <WindowDesktop locale={props.locale}>{layout}</WindowDesktop> : layout}
        </WindowLayoutContext.Provider>
    );
};

export const EditorLayout = layoutFlags.splitter || layoutFlags.windowLayout ? WebLayout : undefined;
