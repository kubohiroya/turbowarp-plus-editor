import {createLayout, createSplitter, splitAxis} from './index.js';
import {createTargetList} from './targets.js';

const isJapanese = locale => /^ja(?:-|$)/i.test(locale);
const minimumStandardTargets = 108;
const minimumDefaultTargetWidth = 174;
const minimumStandardEditor = 380;

export function createStandardLayout(React, {styles, targetStyles, context}) {
    const {createElement: element, Fragment, useContext, useLayoutEffect, useRef, useState} = React;
    const SplitLayout = createLayout(React);
    const Splitter = createSplitter(React);
    const targets = createTargetList(React, targetStyles);

    function AnchorButton({label, pressed, onClick}) {
        return element('button', {
            'aria-label': label, 'aria-pressed': pressed, className: styles.toggle,
            title: label, type: 'button', onClick
        }, element('svg', {
            'aria-hidden': true, className: styles.anchorIcon, viewBox: '0 0 24 24',
            fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round'
        },
        element('circle', {cx: 12, cy: 5, r: 3}),
        element('path', {d: 'M12 8v14M8 12h8M3 13a9 9 0 0 0 18 0M3 17v-4h4M21 17v-4h-4'})));
    }

    function StandardLayout({
        enabled, splitter, windowLayout, stageActionEnabled, onPaletteModeChange, windowTools, Container, render, ...props
    }) {
        const [showUndock, setShowUndock] = useState(false);
        const [plusSelected, setPlusSelected] = useState(enabled);
        const [showStage, setShowStage] = useState(true);
        const [size, setSize] = useState(null);
        const [targetRatio, setTargetRatio] = useState(null);
        const [preferredStageWidth, setPreferredStageWidth] = useState(null);
        const [stageActionMount, setStageActionMount] = useState(null);
        const body = useRef(null);
        const plusLayout = plusSelected && !props.fullscreen;
        const stageHidden = plusLayout && !showStage;
        const japanese = isJapanese(props.locale);
        const undockLabel = japanese ? 'アンドックボタンを表示' : 'Show undock buttons';
        const anchorLabel = japanese ? 'TurboWarp Plus 標準配置' : 'TurboWarp Plus layout';
        const stageLabel = japanese ? 'ステージを表示' : 'Show stage';
        const toggleUndock = () => setShowUndock(value => !value);
        const stageTools = element(Fragment, null,
            !enabled && windowLayout && element(Fragment, null,
                element(AnchorButton, {label: undockLabel, pressed: showUndock, onClick: toggleUndock}), windowTools),
            stageActionEnabled && element('span', {className: styles.stageActionSlot, ref: setStageActionMount}));
        const bodyWidth = size?.width ?? 1024;
        const defaultTargetWidth = Math.max(minimumDefaultTargetWidth, Math.min(bodyWidth * 0.18, 216));
        const targetSplit = plusLayout && splitter && size ? splitAxis(
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

        useLayoutEffect(() => {
            if (enabled) onPaletteModeChange?.(plusSelected);
        }, [enabled, onPaletteModeChange, plusSelected]);

        useLayoutEffect(() => {
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

        const renderEditorTabRow = (tabs, action) => element('div', {className: styles.tabRow}, tabs,
            element('div', {className: styles.layoutTools},
                element(AnchorButton, {label: anchorLabel, pressed: plusSelected,
                    onClick: () => setPlusSelected(value => !value)}),
                plusSelected && element('button', {
                    'aria-pressed': showStage, className: styles.stageToggle, type: 'button',
                    onClick: () => setShowStage(value => !value)
                }, stageLabel),
                windowLayout && element('details', {className: styles.layoutMenu},
                    element('summary', {'aria-label': japanese ? '配置メニュー' : 'Layout options'}, '⋯'),
                    element('button', {
                        'aria-pressed': showUndock, type: 'button',
                        onClick: event => {
                            toggleUndock();
                            const menu = event.currentTarget.parentElement;
                            menu.open = false;
                            menu.querySelector('summary').focus();
                        }
                    }, undockLabel)),
                windowTools), action);

        const applyStandardLayout = layout => {
            if (!enabled) return {...layout, stageClassName: styles.stagePanel};
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
            const columnSplitter = resizable ? element(Splitter, {
                axis: 'columns', split: targetSplit,
                label: japanese ? 'スプライト一覧と編集領域の幅' : 'Sprite list and editor width',
                className: `${styles.separator} ${styles.standardSeparator}`,
                onChange: setTargetRatio, onReset: () => setTargetRatio(null)
            }) : null;
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

        const layout = element(SplitLayout, {
            ...props,
            enabled: splitter && !plusLayout,
            labels: {
                columns: japanese ? '編集領域とステージ列の幅' : 'Editor and stage column width',
                rows: japanese ? 'ステージと対象領域の高さ' : 'Stage and target pane height'
            },
            minimumEditor: 500,
            minimumStageColumn: 350,
            minimumStageRow: 135,
            minimumTargets: 175,
            separatorClassName: styles.separator,
            stageTools,
            render: slots => render(applyStandardLayout(slots), showUndock)
        });
        return element(context.Provider, {value: {
            showUndock, plusLayout, stageHidden, stageResize, stageActionMount, locale: props.locale
        }},
            Container ? element(Container, {locale: props.locale}, layout) : layout);
    }

    function TargetLayout({compact, render}) {
        return render(useContext(context).plusLayout || compact);
    }

    function SpriteGrid(props) {
        const {plusLayout} = useContext(context);
        return element(targets.SpriteGrid, {...props, maximumColumns: plusLayout ? 2 : undefined});
    }

    function BackdropActions({compact, buttons, children}) {
        const {plusLayout, locale} = useContext(context);
        if (!plusLayout && !compact) return children;
        const unique = buttons.filter(({title}, index) => buttons.findIndex(button => button.title === title) === index);
        return element(targets.BackdropFooter, {buttons: unique, label: isJapanese(locale) ? '背景を追加' : 'Add a backdrop'});
    }

    function SpritePropertiesSection({fallback, children}) {
        const {plusLayout, locale} = useContext(context);
        return plusLayout ? element('details', {className: styles.spriteProperties},
            element('summary', null, isJapanese(locale) ? 'スプライト' : 'Sprite'), children) : fallback;
    }

    return {StandardLayout, TargetLayout, SpriteGrid, BackdropTile: targets.BackdropTile, BackdropActions, SpritePropertiesSection};
}
