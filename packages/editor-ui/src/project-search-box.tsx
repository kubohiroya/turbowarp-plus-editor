import React from 'react';
import {createPortal} from 'react-dom';
import {searchProject, searchYamlDocuments, type SearchKind, type SearchProject, type SearchResult} from './project-search.ts';
import {connectionFor, type SearchDocuments} from './project-search-connections.ts';
export {connectProjectSearchNavigation} from './project-search-connections.ts';
import styles from './project-search.css';

const pageSize = 60;
const filters: {kinds: SearchKind[]; label: [string, string]}[] = [
    {kinds: ['block'], label: ['ブロック名', 'Block names']},
    {kinds: ['variable', 'list'], label: ['変数・リスト名', 'Variable and list names']},
    {kinds: ['message'], label: ['メッセージ名', 'Broadcast names']},
    {kinds: ['argument'], label: ['引数の値', 'Argument values']},
    {kinds: ['extension'], label: ['機能拡張名', 'Extension names']},
    {kinds: ['comment'], label: ['コメント文', 'Comments']},
    {kinds: ['yaml'], label: ['YAML 本文', 'YAML text']},
    {kinds: ['costume', 'backdrop', 'sound'], label: ['素材名', 'Asset names']}
];
type SearchBoxProps = {
    locale: string;
    project: SearchProject;
    getMessages(): Record<string, string>;
    documents?: SearchDocuments;
    select(result: SearchResult): void;
};

function ProjectSearchBox({locale, project, getMessages, documents, select}: SearchBoxProps) {
    const japanese = /^ja(?:-|$)/i.test(locale);
    const [query, setQuery] = React.useState('');
    const [open, setOpen] = React.useState(false);
    const [limit, setLimit] = React.useState(pageSize);
    const [active, setActive] = React.useState<SearchResult>();
    const [kinds, setKinds] = React.useState(() => new Set(filters.flatMap(filter => filter.kinds)));
    const input = React.useRef<HTMLInputElement>();
    const popup = React.useRef<HTMLDivElement>();
    const searchYaml = open && kinds.has('yaml') && Boolean(query.trim());
    const yamlDocuments = React.useMemo(() => searchYaml ? documents?.getSearchableYamlDocuments() ?? [] : [],
        [searchYaml, documents]);
    const groups = React.useMemo(() => {
        if (!open) return [];
        const groups: {kind: SearchKind; title: string; results: SearchResult[]}[] =
            searchProject(project, getMessages(), query, japanese, kinds);
        const yaml = searchYamlDocuments(yamlDocuments, query, japanese);
        if (yaml.length) groups.push({kind: 'yaml', title: japanese ? 'YAML 本文' : 'YAML text', results: yaml});
        return groups;
    }, [open, project, getMessages, query, japanese, kinds, yamlDocuments]);
    const visible = groups.flatMap(group => group.results.slice(0, limit));
    const activeIndex = visible.indexOf(active);
    const show = open;
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

    function choose(result: SearchResult) {
        close();
        select(result);
    }

    return <div className={styles.field} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget) && !popup.current?.contains(event.relatedTarget)) close();
    }}>
        <input ref={input} type="search" role="combobox" autoComplete="off" aria-autocomplete="list"
            placeholder={japanese ? '検索' : 'Search'} aria-label={japanese ? '作品全体を検索' : 'Search project'}
            aria-expanded={show} aria-controls={show ? listId : undefined}
            aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined} value={query}
            onFocus={() => setOpen(true)} onPointerDown={event => {
                event.stopPropagation();
                setOpen(true);
            }}
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
                } else if (event.key === 'Tab' && !event.shiftKey && open) {
                    const firstFilter = popup.current?.querySelector<HTMLInputElement>('input[type=checkbox]');
                    if (firstFilter) {
                        event.preventDefault();
                        firstFilter.focus();
                    }
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
                onKeyDown={event => {
                    const backToSearch = event.key === 'Tab' && event.shiftKey &&
                        event.target === popup.current.querySelector('input[type=checkbox]');
                    if (event.key !== 'Escape' && !backToSearch) return;
                    event.preventDefault();
                    event.stopPropagation();
                    input.current.focus();
                    if (!backToSearch) close();
                }}
                onScroll={event => {
                    const panel = event.currentTarget;
                    if (more && panel.scrollHeight - panel.clientHeight - panel.scrollTop < 30) {
                        setLimit(limit + pageSize);
                    }
                }}>
                <fieldset className={styles.filters}>
                    <legend>{japanese ? '検索対象' : 'Search in'}</legend>
                    {filters.filter(filter => documents || !filter.kinds.includes('yaml')).map(filter =>
                        <label key={filter.kinds[0]}>
                            <input type="checkbox" checked={kinds.has(filter.kinds[0])} onChange={event => {
                                const checked = event.currentTarget.checked;
                                const next = new Set(kinds);
                                filter.kinds.forEach(kind => checked ? next.add(kind) : next.delete(kind));
                                setKinds(next);
                                setLimit(pageSize);
                                setActive(undefined);
                            }} />
                            {filter.label[japanese ? 0 : 1]}
                        </label>
                    )}
                </fieldset>
                <div role="listbox" id={listId} aria-label={japanese ? '検索結果' : 'Search results'}>
                    {groups.map(group => <div key={group.kind} role="group" aria-labelledby={`${listId}-${group.kind}`}>
                        <div id={`${listId}-${group.kind}`} className={styles.heading}>{group.title} <span>{group.results.length}</span></div>
                        {group.results.slice(0, limit).map(result => {
                            const index = visible.indexOf(result);
                            const name = result.kind === 'yaml' ? result.document.filename :
                                result.target.isStage ? (japanese ? 'ステージ' : 'Stage') : result.target.getName();
                            return <div key={index} id={optionId(index)} role="option" className={styles.option}
                                aria-selected={result === active} onPointerDown={event => event.preventDefault()}
                                onClick={() => choose(result)}>
                                <span>{result.label}</span>
                                <small>{[name, result.detail].filter(Boolean).join(' · ')}</small>
                            </div>;
                        })}
                    </div>)}
                </div>
                {query.trim() && !groups.length &&
                    <div className={styles.empty} role="status">{japanese ? '一致する項目がありません' : 'No matches'}</div>}
            </div>, input.current.ownerDocument.body)}
    </div>;
}

type Point = {x: number; y: number};
type VisibleComment = {
    setVisible?(visible: boolean): void;
    getBoundingRectangle(): {topLeft: Point; bottomRight: Point};
    select?(): void;
};
type CommentWorkspace = {
    getBlockById(id: string): {comment?: VisibleComment} | null;
    getCommentById(id: string): VisibleComment | null;
    getMetrics(): {contentLeft: number; contentTop: number; viewWidth: number; viewHeight: number};
    scrollbar?: {set(x: number, y: number): void};
    scale: number;
};
export function centerProjectComment(workspace: CommentWorkspace | undefined, id: string, blockId?: string | null) {
    if (!workspace?.scrollbar) return;
    const comment = blockId ? workspace.getBlockById(blockId)?.comment : workspace.getCommentById(id);
    if (!comment) return;
    comment.setVisible?.(true);
    const {topLeft, bottomRight} = comment.getBoundingRectangle();
    const {contentLeft, contentTop, viewWidth, viewHeight} = workspace.getMetrics();
    workspace.scrollbar.set(
        (topLeft.x + bottomRight.x) * workspace.scale / 2 - contentLeft - viewWidth / 2,
        (topLeft.y + bottomRight.y) * workspace.scale / 2 - contentTop - viewHeight / 2
    );
    comment.select?.();
}
export function ProjectSearch(search: Omit<SearchBoxProps, 'select' | 'documents'>) {
    const connection = connectionFor(search.project);
    const [navigation, setNavigation] = React.useState(connection.navigation);
    const [documents, setDocuments] = React.useState(connection.documents);
    const frame = React.useRef<number>();
    React.useLayoutEffect(() => {
        const update = () => {
            setNavigation(connection.navigation);
            setDocuments(connection.documents);
        };
        connection.listeners.add(update);
        update();
        return () => { connection.listeners.delete(update); };
    }, [connection]);
    React.useLayoutEffect(() => () => window.cancelAnimationFrame(frame.current), [navigation]);

    if (!navigation) return null;
    const select = (result: SearchResult) => {
        if (result.kind === 'yaml') {
            documents?.openYamlPreview(result.document.reference, result.range);
            return;
        }
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
            } else if (result.kind === 'comment') {
                if (target.comments?.[result.commentId] === result.comment) {
                    navigation.centerComment(result.commentId, result.comment.blockId);
                }
            } else if (target.blocks.getBlock(result.block.id) === result.block) {
                navigation.centerBlock(result.block.id);
            }
        });
    };
    return <ProjectSearchBox {...search} {...{documents, select}} />;
}
