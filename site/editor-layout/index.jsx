import React from 'react';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';
import {createLayout} from '@kubohiroya/turbowarp-editor-layout';
import {EditorFullscreenButton, WindowDesktop, WindowList} from '@kubohiroya/turbowarp-editor-windows';
import '@kubohiroya/turbowarp-editor-windows/styles.css';
import styles from './layout.css';
import {EditorTabLayout} from './editor-tabs.jsx';
import {setHorizontalBlockPalette} from '../horizontal-block-palette/index.js';

export const layoutFlags = readWebStartupFeatureFlags(typeof window === 'undefined' ? '' : window.location.search);
export const WindowLayoutContext = React.createContext({showUndock: false, plusLayout: false, locale: 'en'});
const SplitLayout = createLayout(React);
const storageKey = 'twPlusEditorLayout';

const getStorage = () => {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
};

function AnchorButton({label, pressed, onClick}) {
    return <button aria-label={label} aria-pressed={pressed} className={styles.toggle}
        title={label} type="button" onClick={onClick}>
        <svg aria-hidden="true" className={styles.anchorIcon} viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="5" r="3" />
            <path d="M12 8v14M8 12h8M3 13a9 9 0 0 0 18 0M3 17v-4h4M21 17v-4h-4" />
        </svg>
    </button>;
}

const WebLayout = ({activeEditorTab, editorTargetIsStage, vm, ...props}) => {
    const [showUndock, setShowUndock] = React.useState(false);
    const [plusSelected, setPlusSelected] = React.useState(layoutFlags.standardLayout);
    const [showStage, setShowStage] = React.useState(true);
    const [size, setSize] = React.useState(null);
    const body = React.useRef(null);
    const plusLayout = plusSelected && !props.fullscreen;
    const stageHidden = plusLayout && !showStage;
    const japanese = /^ja(?:-|$)/i.test(props.locale);
    const undockLabel = japanese ? 'アンドックボタンを表示' : 'Show undock buttons';
    const anchorLabel = japanese ? 'TurboWarp Plus 標準配置' : 'TurboWarp Plus layout';
    const stageLabel = japanese ? 'ステージを表示' : 'Show stage';
    const toggleUndock = () => setShowUndock(value => !value);
    const legacyAnchor = <AnchorButton label={undockLabel} pressed={showUndock} onClick={toggleUndock} />;
    const windowTools = layoutFlags.internalWindows && <>
        <EditorFullscreenButton className={styles.toggle} locale={props.locale} />
        <WindowList />
    </>;
    const stageTools = !layoutFlags.standardLayout && layoutFlags.windowLayout ?
        <>{legacyAnchor}{windowTools}</> : null;

    React.useLayoutEffect(() => {
        if (layoutFlags.standardLayout) setHorizontalBlockPalette(plusSelected);
    }, [plusSelected]);

    React.useLayoutEffect(() => {
        const node = body.current;
        const Observer = node?.ownerDocument.defaultView.ResizeObserver;
        if (!Observer) return;
        const measure = () => {
            const {clientWidth: width, clientHeight: height} = node;
            setSize(previous => previous?.width === width && previous.height === height ? previous : {width, height});
        };
        const observer = new Observer(measure);
        measure();
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    const renderEditorTabRow = layoutFlags.standardLayout ? (tabs, action) => (
        <div className={styles.tabRow}>
            {tabs}
            {action}
            <div className={styles.layoutTools}>
                <AnchorButton label={anchorLabel} pressed={plusSelected} onClick={() => setPlusSelected(value => !value)} />
                {plusSelected && <button aria-pressed={showStage} className={styles.stageToggle} type="button"
                    onClick={() => setShowStage(value => !value)}>{stageLabel}</button>}
                {layoutFlags.windowLayout && <details className={styles.layoutMenu}>
                    <summary aria-label={japanese ? '配置メニュー' : 'Layout options'}>⋯</summary>
                    <button aria-pressed={showUndock} type="button" onClick={event => {
                        toggleUndock();
                        event.currentTarget.parentElement.open = false;
                        event.currentTarget.parentElement.querySelector('summary').focus();
                    }}>{undockLabel}</button>
                </details>}
                {windowTools}
            </div>
        </div>
    ) : undefined;

    const applyStandardLayout = layout => {
        if (!layoutFlags.standardLayout) return layout;
        const stageWidth = Math.max(1, Math.floor(Math.min(props.defaultStageWidth, 360,
            (size?.width ?? 1024) / 2, ((size?.height ?? 640) - 112) * props.stageAspect)));
        const shared = {
            ...layout,
            renderEditorTabRow,
            observe: node => {
                layout.observe(node);
                body.current = node;
            }
        };
        if (!plusLayout) return shared;
        return {
            ...shared,
            bodyClassName: styles.standardBody,
            bodyStyle: {display: 'grid', '--plus-stage-overlap': showStage ? `${stageWidth + 16}px` : '0px'},
            editorStyle: {gridArea: 'editor', minWidth: 0, minHeight: 0},
            stageColumnStyle: {display: 'contents'},
            stageClassName: stageHidden ? `${styles.floatingStage} ${styles.stageHidden}` : styles.floatingStage,
            targetClassName: styles.standardTargets,
            stageDisplayWidth: stageWidth,
            editorWidth: size?.width
        };
    };

    const render = layout => {
        const configured = applyStandardLayout(layout);
        return layoutFlags.internalWindows ? <EditorTabLayout
            vm={vm}
            activeEditorTab={activeEditorTab}
            editorTargetIsStage={editorTargetIsStage}
            showUndock={showUndock}
            layout={configured}
            locale={props.locale}
            render={props.render}
        /> : props.render(configured);
    };

    const layout = (
        <SplitLayout
            {...props}
            enabled={layoutFlags.splitter && !plusLayout}
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
            render={render}
        />
    );
    return (
        <WindowLayoutContext.Provider value={{showUndock, plusLayout, stageHidden, locale: props.locale}}>
            {layoutFlags.internalWindows ? <WindowDesktop locale={props.locale}>{layout}</WindowDesktop> : layout}
        </WindowLayoutContext.Provider>
    );
};

export const EditorLayout = layoutFlags.standardLayout || layoutFlags.splitter || layoutFlags.windowLayout ? WebLayout : undefined;
