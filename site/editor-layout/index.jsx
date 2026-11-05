import React from 'react';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';
import {createLayout, createSplitter, splitAxis} from '@kubohiroya/turbowarp-editor-layout';
import {EditorFullscreenButton, WindowDesktop, WindowList} from '@kubohiroya/turbowarp-editor-windows';
import '@kubohiroya/turbowarp-editor-windows/styles.css';
import styles from './layout.css';
import {EditorTabLayout} from './editor-tabs.jsx';
import {setHorizontalBlockPalette} from '../horizontal-block-palette/index.js';

export const layoutFlags = readWebStartupFeatureFlags(typeof window === 'undefined' ? '' : window.location.search);
export const WindowLayoutContext = React.createContext({showUndock: false, plusLayout: false, locale: 'en'});
const SplitLayout = createLayout(React);
const Splitter = createSplitter(React);
const minimumStandardTargets = 174;
const minimumStandardEditor = 380;
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
    const [targetRatio, setTargetRatio] = React.useState(null);
    const [preferredStageWidth, setPreferredStageWidth] = React.useState(null);
    const [stageActionMount, setStageActionMount] = React.useState(null);
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
    const stageTools = <>
        {!layoutFlags.standardLayout && layoutFlags.windowLayout && <>{legacyAnchor}{windowTools}</>}
        {layoutFlags.stagePanel && <span className={styles.stageActionSlot} ref={setStageActionMount} />}
    </>;
    const bodyWidth = size?.width ?? 1024;
    const defaultTargetWidth = Math.max(minimumStandardTargets, Math.min(bodyWidth * 0.18, 216));
    const targetSplit = plusLayout && layoutFlags.splitter && size ? splitAxis(
        bodyWidth, targetRatio, defaultTargetWidth, minimumStandardTargets, minimumStandardEditor
    ) : null;
    const resizable = targetSplit && targetSplit.maximum > targetSplit.minimum;
    const editorSpace = resizable ? targetSplit.second : bodyWidth - defaultTargetWidth;
    const maximumStageWidth = Math.max(1, Math.floor(Math.min(editorSpace - 24,
        ((size?.height ?? 640) - 112) * props.stageAspect)));
    const defaultStageWidth = Math.min(maximumStageWidth, Math.floor(Math.min(props.defaultStageWidth, 360, bodyWidth / 2)));
    const minimumStageWidth = Math.min(defaultStageWidth, 280);
    const stageWidth = Math.max(minimumStageWidth, Math.min(maximumStageWidth, preferredStageWidth ?? defaultStageWidth));
    const stageResize = plusLayout && maximumStageWidth > minimumStageWidth ?
        {minimum: minimumStageWidth, maximum: maximumStageWidth, resize: setPreferredStageWidth} : null;

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
            {action}
        </div>
    ) : undefined;

    const applyStandardLayout = layout => {
        if (!layoutFlags.standardLayout) return {...layout, stageClassName: styles.stagePanel};
        const shared = {
            ...layout,
            stageClassName: styles.stagePanel,
            renderEditorTabRow,
            observe: node => {
                layout.observe(node);
                body.current = node;
            }
        };
        if (!plusLayout) return shared;
        const bodyStyle = {display: 'grid', '--plus-stage-overlap': showStage ? `${stageWidth + 16}px` : '0px'};
        if (resizable) {
            bodyStyle['--plus-target-width'] = `${targetSplit.first}px`;
            bodyStyle['--plus-target-divider-width'] = `${size.width - targetSplit.available}px`;
        }
        // The target list is on the physical left in both text directions.
        const columnSplitter = resizable ? <Splitter axis="columns" split={targetSplit}
            label={japanese ? 'スプライト一覧と編集領域の幅' : 'Sprite list and editor width'}
            className={`${styles.separator} ${styles.standardSeparator}`}
            onChange={setTargetRatio} onReset={() => setTargetRatio(null)} /> : null;
        return {
            ...shared,
            bodyClassName: styles.standardBody,
            bodyStyle,
            columnSplitter,
            editorStyle: {gridArea: 'editor', minWidth: 0, minHeight: 0},
            stageColumnStyle: {display: 'contents'},
            stageClassName: `${styles.stagePanel} ${styles.floatingStage}${stageHidden ? ` ${styles.stageHidden}` : ''}`,
            targetClassName: styles.standardTargets,
            stageDisplayWidth: stageWidth,
            handleStagePreset: () => setPreferredStageWidth(null),
            editorWidth: resizable ? targetSplit.second : size?.width
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
        <WindowLayoutContext.Provider value={{showUndock, plusLayout, stageHidden, stageResize, stageActionMount, locale: props.locale}}>
            {layoutFlags.internalWindows ? <WindowDesktop locale={props.locale}>{layout}</WindowDesktop> : layout}
        </WindowLayoutContext.Provider>
    );
};

export const EditorLayout = layoutFlags.standardLayout || layoutFlags.splitter || layoutFlags.windowLayout ? WebLayout : undefined;
