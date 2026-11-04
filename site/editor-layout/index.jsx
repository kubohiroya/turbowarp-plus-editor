import React from 'react';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';
import {createLayout} from '@kubohiroya/turbowarp-editor-layout';
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
    const stageTools = (
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
    return (
        <WindowLayoutContext.Provider value={{enabled, locale: props.locale}}>
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
        </WindowLayoutContext.Provider>
    );
};

export const EditorLayout = layoutFlags.windowLayout ? WebLayout : undefined;
