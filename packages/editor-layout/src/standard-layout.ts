import {createLayout, createSplitter, splitAxis} from './index.ts';
import {createTargetList} from './targets.ts';

const isJapanese = locale => /^ja(?:-|$)/i.test(locale);
const singleColumnTargetWidth = 108;
const minimumStandardEditor = 380;

export function createStandardLayout(React, {styles, targetStyles, context, LayoutMenu}) {
    const {createElement: element, useContext, useLayoutEffect, useRef, useState} = React;
    const SplitLayout = createLayout(React);
    const Splitter = createSplitter(React);
    const targets = createTargetList(React, targetStyles);
    const targetSearch = React.createContext('');

    function StandardLayout({
        enabled, splitter, windowLayout, stageActionEnabled, onPaletteModeChange, windowTools, Container, render, ...props
    }) {
        const [showUndock, setShowUndock] = useState(false);
        const [targetsPinned, setTargetsPinned] = useState(false);
        const [showStage, setShowStage] = useState(true);
        const [size, setSize] = useState(null);
        const [targetRatio, setTargetRatio] = useState(null);
        const [preferredStageWidth, setPreferredStageWidth] = useState(null);
        const [stageActionMount, setStageActionMount] = useState(null);
        const body = useRef(null);
        const plusLayout = enabled && !props.fullscreen;
        const stageHidden = plusLayout && !showStage;
        const japanese = isJapanese(props.locale);
        const undockLabel = japanese ? 'アンドックボタンを表示' : 'Show undock buttons';
        const layoutMenuLabel = japanese ? '配置メニュー' : 'Layout options';
        const toggleUndock = () => setShowUndock(value => !value);
        const layoutMenu = windowLayout && (LayoutMenu ? element(LayoutMenu, {
            label: layoutMenuLabel, undockLabel, showUndock, onToggle: toggleUndock
        }) : element('details', {className: styles.layoutMenu},
            element('summary', {'aria-label': layoutMenuLabel}, '⋯'),
            element('button', {
                'aria-pressed': showUndock, type: 'button',
                onClick: event => {
                    toggleUndock();
                    const menu = event.currentTarget.parentElement;
                    menu.open = false;
                    menu.querySelector('summary').focus();
                }
            }, undockLabel)));
        const stageTools = stageActionEnabled &&
            element('span', {className: styles.stageActionSlot, ref: setStageActionMount});
        const bodyWidth = size?.width ?? 1024;
        const targetSplit = plusLayout && splitter && size ? splitAxis(
            bodyWidth, targetRatio, singleColumnTargetWidth, singleColumnTargetWidth, minimumStandardEditor
        ) : null;
        const resizable = targetSplit && targetSplit.maximum > targetSplit.minimum;
        const editorSpace = targetsPinned ? (targetSplit?.second ?? bodyWidth - singleColumnTargetWidth) : bodyWidth;
        const maximumStageWidth = Math.max(1, Math.floor(Math.min(editorSpace - 24,
            ((size?.height ?? 640) - 112) * props.stageAspect)));
        const defaultStageWidth = Math.min(maximumStageWidth, Math.floor(Math.min(props.defaultStageWidth, 360, bodyWidth / 2)));
        const minimumStageWidth = Math.min(defaultStageWidth, 280);
        const stageWidth = Math.max(minimumStageWidth, Math.min(maximumStageWidth, preferredStageWidth ?? defaultStageWidth));
        const stageResize = plusLayout && maximumStageWidth > minimumStageWidth ?
            {minimum: minimumStageWidth, maximum: maximumStageWidth, resize: setPreferredStageWidth} : null;

        useLayoutEffect(() => {
            if (enabled) onPaletteModeChange?.(true);
        }, [enabled, onPaletteModeChange]);

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
            (layoutMenu || windowTools) && element('div', {className: styles.layoutTools}, layoutMenu, windowTools), action);

        const applyStandardLayout = layout => {
            if (!enabled) return {...layout, stageClassName: styles.stagePanel,
                renderEditorTabRow: windowLayout ? renderEditorTabRow : undefined};
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
            const stageOverlap = `${stageWidth + 20}px`;
            const bodyStyle = {
                display: 'grid',
                '--plus-stage-overlap': showStage ? stageOverlap : '0px',
                '--plus-stage-tab-inset': showStage ? stageOverlap : '3rem'
            };
            if (resizable) {
                bodyStyle['--plus-target-width'] = `${targetSplit.first}px`;
                bodyStyle['--plus-target-divider-width'] = `${size.width - targetSplit.available}px`;
            }
            // The target list is on the physical left in both text directions.
            const columnSplitter = targetsPinned && resizable ? element(Splitter, {
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
                targetClassName: targetsPinned ? styles.standardTargets :
                    `${styles.standardTargets} ${styles.retractedTargets}`,
                stageDisplayWidth: stageWidth,
                handleStagePreset: () => setPreferredStageWidth(null),
                editorWidth: targetsPinned && resizable ? targetSplit.second : size?.width
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
            showUndock, plusLayout, targetsPinned, setTargetsPinned, stageHidden, setStageVisible: setShowStage, stageResize, stageActionMount, locale: props.locale
        }},
            Container ? element(Container, {locale: props.locale}, layout) : layout);
    }

    function EdgeDrawer({edge, label, pinned = false, onOpenChange, children}) {
        const [hovered, setHovered] = useState(false);
        const [engaged, setEngaged] = useState(false);
        const trigger = useRef(null);
        const panel = useRef(null);
        const open = pinned || hovered || engaged;

        useLayoutEffect(() => {onOpenChange?.(open);}, [open, onOpenChange]);

        return element('div', {
            className: styles.edgeDrawer,
            'data-edge': edge,
            'data-pinned': pinned || undefined,
            onPointerEnter: event => {
                if (event.pointerType === 'mouse') setHovered(true);
            },
            onPointerLeave: () => setHovered(false),
            onFocus: event => {
                if (panel.current.contains(event.target)) setEngaged(true);
            },
            onBlur: event => {
                if (!event.currentTarget.contains(event.relatedTarget)) setEngaged(false);
            },
            onKeyDown: event => {
                if (event.key !== 'Escape' || pinned || !open || event.defaultPrevented) return;
                setHovered(false);
                setEngaged(false);
                trigger.current.focus();
                event.stopPropagation();
            }
        },
        element('button', {
            type: 'button',
            className: styles.edgeTrigger,
            hidden: pinned,
            'aria-label': label,
            'aria-expanded': open,
            ref: trigger,
            onClick: () => {
                setEngaged(true);
                const frame = trigger.current.ownerDocument.defaultView;
                frame.requestAnimationFrame(() => {
                    if (panel.current && !panel.current.hidden) panel.current.focus({preventScroll: true});
                });
            }
        }, edge === 'left' ? '›' : '⌃'),
        element('div', {className: styles.edgePanel, ref: panel, tabIndex: -1, hidden: !open}, children));
    }

    function TargetLayout({compact, render}) {
        const {plusLayout, targetsPinned, locale} = useContext(context);
        const panel = render(plusLayout || compact);
        return plusLayout ? element(EdgeDrawer, {
            edge: 'left', pinned: targetsPinned,
            label: isJapanese(locale) ? 'スプライト一覧を展開' : 'Reveal sprite list'
        }, panel) : panel;
    }

    function SpriteGrid(props) {
        const {plusLayout} = useContext(context);
        return element(targets.SpriteGrid, {...props, query: useContext(targetSearch), standard: plusLayout});
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

    return {StandardLayout, EdgeDrawer, TargetLayout, TargetSearchProvider: targetSearch.Provider, SpriteGrid, BackdropTile: targets.BackdropTile, BackdropActions, SpritePropertiesSection};
}
