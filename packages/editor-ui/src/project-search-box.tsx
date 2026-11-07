import React from 'react';
import {createPortal} from 'react-dom';
import {searchProject, type ProjectSearchResult, type SearchProject} from './project-search.ts';
import styles from './project-search.css';

const pageSize = 60;
type SearchBoxProps = {
    locale: string;
    project: SearchProject;
    getMessages(): Record<string, string>;
    select(result: ProjectSearchResult): void;
};

function ProjectSearchBox({locale, project, getMessages, select}: SearchBoxProps) {
    const japanese = /^ja(?:-|$)/i.test(locale);
    const [query, setQuery] = React.useState('');
    const [open, setOpen] = React.useState(false);
    const [limit, setLimit] = React.useState(pageSize);
    const [active, setActive] = React.useState<ProjectSearchResult>();
    const input = React.useRef<HTMLInputElement>();
    const popup = React.useRef<HTMLDivElement>();
    const groups = React.useMemo(() => open ? searchProject(project, getMessages(), query, japanese) : [],
        [open, project, getMessages, query, japanese]);
    const visible = groups.flatMap(group => group.results.slice(0, limit));
    const activeIndex = visible.indexOf(active);
    const show = open && Boolean(query.trim());
    const more = groups.some(group => group.results.length > limit);
    const listId = 'tw-plus-project-search-results';
    const optionId = (index: number) => `${listId}-${index}`;

    React.useEffect(() => {
        const field = input.current;
        const win = field.ownerDocument.defaultView;
        const shortcut = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey &&
                    event.key.toLowerCase() === 'f' && field.offsetWidth) {
                event.preventDefault();
                event.stopPropagation();
                field.focus();
                field.select();
            }
        };
        win.addEventListener('keydown', shortcut, true);
        return () => win.removeEventListener('keydown', shortcut, true);
    }, []);

    React.useLayoutEffect(() => {
        if (!show) return;
        const field = input.current;
        const panel = popup.current;
        const win = field.ownerDocument.defaultView;
        const place = () => {
            const rect = field.getBoundingClientRect();
            const width = Math.min(340, win.innerWidth - 16);
            const below = win.innerHeight - rect.bottom - 12;
            const above = rect.top - 12;
            const placeBelow = below >= 160 || below >= above;
            panel.style.width = `${width}px`;
            panel.style.left = `${Math.max(8, Math.min(rect.right - width, win.innerWidth - width - 8))}px`;
            panel.style.top = placeBelow ? `${rect.bottom + 4}px` : 'auto';
            panel.style.bottom = placeBelow ? 'auto' : `${win.innerHeight - rect.top + 4}px`;
            panel.style.maxHeight = `${Math.min(320, placeBelow ? below : above)}px`;
        };
        place();
        panel.showPopover?.();
        const observer = new win.ResizeObserver(place);
        observer.observe(field);
        win.addEventListener('resize', place);
        win.addEventListener('scroll', place, true);
        return () => {
            observer.disconnect();
            win.removeEventListener('resize', place);
            win.removeEventListener('scroll', place, true);
        };
    }, [show]);

    React.useLayoutEffect(() => {
        if (activeIndex >= 0) input.current.ownerDocument.getElementById(optionId(activeIndex))?.scrollIntoView({block: 'nearest'});
    }, [activeIndex]);

    function close() {
        setOpen(false);
        setActive(undefined);
    }

    function choose(result: ProjectSearchResult) {
        close();
        select(result);
    }

    return <div className={styles.field}>
        <input ref={input} type="search" role="combobox" autoComplete="off" aria-autocomplete="list"
            placeholder={japanese ? '検索' : 'Search'} aria-label={japanese ? '作品全体を検索' : 'Search project'}
            aria-expanded={show} aria-controls={show ? listId : undefined}
            aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined} value={query}
            onFocus={() => setOpen(true)} onBlur={close} onPointerDown={event => event.stopPropagation()}
            onChange={event => {
                setQuery(event.currentTarget.value);
                setLimit(pageSize);
                setActive(undefined);
                setOpen(true);
                if (popup.current) popup.current.scrollTop = 0;
            }}
            onKeyDown={event => {
                event.stopPropagation();
                if (event.nativeEvent.isComposing) return;
                if (event.key === 'Escape' && open) {
                    event.preventDefault();
                    close();
                } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    setOpen(true);
                    if (activeIndex === visible.length - 1 && more && event.key === 'ArrowDown') {
                        setLimit(limit + pageSize);
                    } else if (visible.length) {
                        const next = event.key === 'ArrowDown' ? activeIndex + 1 : (activeIndex < 0 ? -1 : activeIndex - 1);
                        setActive(visible[(next + visible.length) % visible.length]);
                    }
                } else if (event.key === 'Enter' && visible.length) {
                    event.preventDefault();
                    choose(active ?? visible[0]);
                }
            }} />
        {show && input.current && createPortal(
            <div ref={popup} className={styles.popup}
                {...(typeof input.current.showPopover === 'function' ? {popover: 'manual'} : {})}
                role="listbox" id={listId} aria-label={japanese ? '検索結果' : 'Search results'}
                onScroll={event => {
                    const panel = event.currentTarget;
                    if (more && panel.scrollHeight - panel.clientHeight - panel.scrollTop < 30) {
                        setLimit(limit + pageSize);
                    }
                }}>
                {groups.map(group => <div key={group.kind} role="group" aria-labelledby={`${listId}-${group.kind}`}>
                    <div id={`${listId}-${group.kind}`} className={styles.heading}>{group.title} <span>{group.results.length}</span></div>
                    {group.results.slice(0, limit).map(result => {
                        const index = visible.indexOf(result);
                        const name = result.target.isStage ? (japanese ? 'ステージ' : 'Stage') : result.target.getName();
                        return <div key={index} id={optionId(index)} role="option" className={styles.option}
                            aria-selected={result === active} onPointerDown={event => event.preventDefault()}
                            onClick={() => choose(result)}>
                            <span>{result.label}</span>
                            <small>{[name, result.detail].filter(Boolean).join(' · ')}</small>
                        </div>;
                    })}
                </div>)}
                {!groups.length && <div className={styles.empty} role="status">{japanese ? '一致する項目がありません' : 'No matches'}</div>}
            </div>, input.current.ownerDocument.body)}
    </div>;
}

type SearchView = {id: string; groupId: string; targetId: string; section: number};
type SearchViews = {
    views(): SearchView[];
    currentView(): SearchView | undefined;
    activateView(id: string): boolean;
    select(id: string): void;
    setViewSection(id: string, section: number): boolean;
    selectAsset(id: string, kind: 'costumes' | 'sounds', index: number): void;
};
type Target = ProjectSearchResult['target'];
type SearchNavigation = {
    getViews(): SearchViews | null;
    getTarget(id: string): Target | undefined;
    getEditingTarget(): Target | undefined;
    centerBlock(id: string): void;
};

type SearchConnection = {
    navigation?: SearchNavigation;
    listeners: Set<() => void>;
};
const connections = new WeakMap<SearchProject, SearchConnection>();

function connectionFor(project: SearchProject) {
    let connection = connections.get(project);
    if (!connection) {
        connection = {listeners: new Set()};
        connections.set(project, connection);
    }
    return connection;
}

export function connectProjectSearchNavigation(project: SearchProject, navigation: SearchNavigation) {
    const connection = connectionFor(project);
    connection.navigation = navigation;
    connection.listeners.forEach(listener => listener());
    return () => {
        if (connection.navigation !== navigation) return;
        connection.navigation = undefined;
        connection.listeners.forEach(listener => listener());
    };
}

export function ProjectSearch(search: Omit<SearchBoxProps, 'select'>) {
    const connection = connectionFor(search.project);
    const [navigation, setNavigation] = React.useState(connection.navigation);
    const frame = React.useRef<number>();
    React.useLayoutEffect(() => {
        const update = () => setNavigation(connection.navigation);
        connection.listeners.add(update);
        update();
        return () => { connection.listeners.delete(update); };
    }, [connection]);
    React.useLayoutEffect(() => () => window.cancelAnimationFrame(frame.current), [navigation]);

    if (!navigation) return null;
    const select = (result: ProjectSearchResult) => {
        const {target} = result;
        const views = navigation.getViews();
        if (!views || navigation.getTarget(target.id) !== target) return;
        const groupId = views.currentView()?.groupId;
        const localView = views.views().find(view => view.groupId === groupId && view.targetId === target.id);
        if (localView) views.activateView(localView.id);
        else views.select(target.id);
        const destination = views.currentView();
        if (destination?.targetId !== target.id) return;
        const section = result.kind === 'sound' ? 2 : 'asset' in result ? 1 : 0;
        views.setViewSection(destination.id, section);
        window.cancelAnimationFrame(frame.current);
        frame.current = window.requestAnimationFrame(() => {
            const current = views.currentView();
            if (navigation.getViews() !== views || navigation.getEditingTarget() !== target ||
                current?.id !== destination.id || current.section !== section) return;
            if ('asset' in result) {
                const kind = result.kind === 'sound' ? 'sounds' : 'costumes';
                const assets = kind === 'sounds' ? target.getSounds() : target.getCostumes();
                const index = assets.indexOf(result.asset);
                if (index >= 0) views.selectAsset(destination.id, kind, index);
            } else if (target.blocks.getBlock(result.block.id) === result.block) {
                navigation.centerBlock(result.block.id);
            }
        });
    };
    return <ProjectSearchBox {...search} select={select} />;
}
