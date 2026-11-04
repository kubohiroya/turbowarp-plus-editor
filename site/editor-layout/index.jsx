import React from 'react';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';
import {createLayout} from '@kubohiroya/turbowarp-editor-layout';
import styles from './layout.css';

const splitterEnabled = readWebStartupFeatureFlags(typeof window === 'undefined' ? '' : window.location.search).splitter;
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
    const japanese = props.locale === 'ja' || props.locale?.startsWith('ja-');
    return (
        <SplitLayout
            {...props}
            enabled={splitterEnabled}
            labels={{
                columns: japanese ? '編集領域とステージ列の幅' : 'Editor and stage column width',
                rows: japanese ? 'ステージと対象領域の高さ' : 'Stage and target pane height'
            }}
            minimumEditor={500}
            minimumStageColumn={350}
            minimumStageRow={135}
            minimumTargets={175}
            separatorClassName={styles.separator}
            storage={getStorage()}
            storageKey={storageKey}
        />
    );
};

export const EditorLayout = splitterEnabled ? WebLayout : undefined;
