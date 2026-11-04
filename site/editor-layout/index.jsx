import React from 'react';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';
import {createLayout} from '@kubohiroya/turbowarp-editor-layout';
import {WindowDesktop, WindowList} from '@kubohiroya/turbowarp-editor-windows';
import '@kubohiroya/turbowarp-editor-windows/styles.css';
import styles from './layout.css';

export const layoutFlags = readWebStartupFeatureFlags(typeof window === 'undefined' ? '' : window.location.search);
export const WindowLayoutContext = React.createContext({enabled: false, locale: 'en'});
const SplitLayout = createLayout(React);
const storageKey = 'twPlusEditorLayout';

const getStorage = () => {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
};

const WebLayout = props => {
    const [enabled, setEnabled] = React.useState(false);
    const japanese = props.locale === 'ja' || props.locale?.startsWith('ja-');
    const toggleLabel = japanese ? '自由配置モード' : 'Flexible layout mode';
    const toggle = (
        <button
            aria-label={toggleLabel}
            aria-pressed={enabled}
            className={styles.toggle}
            title={toggleLabel}
            type="button"
            onClick={() => setEnabled(value => !value)}
        >
            <span aria-hidden="true">⚓</span>
        </button>
    );
    const stageTools = layoutFlags.internalWindows && enabled ? <>{toggle}<WindowList /></> : toggle;
    const layout = (
        <SplitLayout
            {...props}
            enabled={enabled}
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
        />
    );
    return (
        <WindowLayoutContext.Provider value={{enabled, locale: props.locale}}>
            {layoutFlags.internalWindows ? <WindowDesktop locale={props.locale}>{layout}</WindowDesktop> : layout}
        </WindowLayoutContext.Provider>
    );
};

export const EditorLayout = layoutFlags.windowLayout ? WebLayout : undefined;
