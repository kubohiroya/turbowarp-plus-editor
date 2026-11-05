import React from 'react';
import {BasicPanel} from './basic-panel.jsx';
import {createDesktopPanelHost, createWebPanelHost} from './desktop-panel-host.js';
import {decorateSurface} from '../editor-backpack/surface-styles.js';
import {layoutFlags, layoutViews, WindowLayoutContext} from './index.jsx';
import styles from '@kubohiroya/turbowarp-editor-layout/editor.css';

const desktopPopout = createDesktopPanelHost('sprite-list', 'twPlusTargetPanelsPopout', 540, 420);
const externalHost = desktopPopout ?? (layoutFlags.standardLayout ? createWebPanelHost('sprite-list', 540, 420) : null);

function useJapaneseLabels() {
    const {locale} = React.useContext(WindowLayoutContext);
    return /^ja(?:-|$)/i.test(locale);
}

function DockableTargetList({children}) {
    const japanese = useJapaneseLabels();
    const {plusLayout, targetsPinned, setTargetsPinned} = React.useContext(WindowLayoutContext);
    const [searching, setSearching] = React.useState(false);
    const [query, setQuery] = React.useState('');
    const searchButton = React.useRef(null);
    const searchInput = React.useRef(null);
    const pinLabel = japanese ? 'スプライト一覧を固定表示' : 'Pin sprite list';
    const searchLabel = japanese ? 'スプライトを検索' : 'Search sprites';
    React.useLayoutEffect(() => {
        if (searching) searchInput.current?.focus({preventScroll: true});
    }, [searching]);
    function closeSearch() {
        setSearching(false);
        setQuery('');
        searchButton.current?.focus();
    }
    const dockHeading = openAction => <>
        <div className={styles.targetListTools} role="group" aria-label={japanese ? 'スプライト一覧の操作' : 'Sprite list tools'}>
            <button type="button" ref={searchButton} aria-label={searchLabel} aria-expanded={searching}
                title={searchLabel} onClick={() => searching ? closeSearch() : setSearching(true)}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none"
                    stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                    <circle cx="6.5" cy="6.5" r="4" />
                    <path d="m9.5 9.5 4 4" />
                </svg>
            </button>
            <button type="button" className={styles.drawerPin}
                aria-label={pinLabel} aria-pressed={targetsPinned} title={pinLabel}
                onClick={() => setTargetsPinned(value => !value)}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill={targetsPinned ? 'currentColor' : 'none'}
                    stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
                    <path d="M9 2 14 7 12 8l-2 3-5-5 3-2 1-2Z" />
                    <path d="m7.5 8.5-4 4" />
                </svg>
            </button>
            {openAction}
        </div>
        {searching && <input type="search" className={styles.targetListSearch} aria-label={searchLabel} ref={searchInput}
            placeholder={japanese ? '名前' : 'Name'} value={query} onChange={event => setQuery(event.currentTarget.value)}
            onKeyDown={event => {
                if (event.key === 'Escape') {
                    event.stopPropagation();
                    closeSearch();
                }
            }} />}
    </>;
    if (!plusLayout && !layoutFlags.targetList) return children;
    return <BasicPanel id="sprite-list" title={japanese ? 'スプライト一覧' : 'Sprite list'}
        className={styles.targetListPanel} externalHost={externalHost} decorate={decorateSurface}
        layer={plusLayout ? 'utility' : undefined} alwaysShowUndock={plusLayout} renderDockHeading={plusLayout ? dockHeading : undefined}
        openLabel={plusLayout ? (japanese ? 'アンドック' : 'Undock sprite list') : undefined}
        renderInExternalDocument>
        <layoutViews.TargetSearchProvider value={query}>
            <div className={styles.targetListContent}>{children}</div>
        </layoutViews.TargetSearchProvider>
    </BasicPanel>;
}

const targetListEnabled = layoutFlags.targetList || layoutFlags.standardLayout;
export const TargetListLayout = targetListEnabled ?
    props => <layoutViews.TargetLayout {...props} compact={layoutFlags.targetList} /> : undefined;
export const TargetListPanel = targetListEnabled ? DockableTargetList : undefined;
export const SpriteGrid = targetListEnabled ? layoutViews.SpriteGrid : undefined;
export const BackdropTile = targetListEnabled ? layoutViews.BackdropTile : undefined;
export const BackdropListActions = targetListEnabled ?
    props => <layoutViews.BackdropActions {...props} compact={layoutFlags.targetList} /> : undefined;
