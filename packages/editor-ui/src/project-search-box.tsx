import React from 'react';
import {createPortal} from 'react-dom';
import {searchProject, searchYamlDocuments, type ProjectSearchResult, type SearchKind, type SearchProject, type SearchResult} from './project-search.ts';
import {activateTargetView, connectProjectReplaceOpener, connectionFor, projectReplaceShortcut,
    type SearchDocuments} from './project-search-connections.ts';
import {applyProjectSearchReplacement, replacementText, type ReplaceOutcome} from './project-search-replace.ts';
export {connectProjectSearchNavigation} from './project-search-connections.ts';
export {activateTargetView, type SearchNavigation} from './project-search-connections.ts';
export {renameProjectMessage} from './project-search-replace.ts';
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
    replace(result: SearchResult, value: string): Promise<ReplaceOutcome>;
};

const pickMatch: [string, string] = ['置換する項目を一覧から選んでください。', 'Select a match in the list to replace.'];
const replaceMessages: Record<ReplaceOutcome, [string, string]> = {
    applied: ['置換しました。', 'Replaced.'],
    staged: ['YAML の置換内容を確認してください。', 'Review the replacement in the YAML preview.'],
    stale: ['対象が変更されました。もう一度検索してください。', 'The match changed. Search again.'],
    conflict: ['同じ名前が既に使われています。', 'That name is already in use.'],
    invalid: ['この項目に使える値を入力してください。', 'Enter a value this item accepts.'],
    'read-only': ['この項目は置換できません。', 'This result cannot be replaced.']
};

function ProjectSearchBox({locale, project, getMessages, documents, select, replace}: SearchBoxProps) {
    const japanese = /^ja(?:-|$)/i.test(locale);
    const [query, setQuery] = React.useState('');
    const [open, setOpen] = React.useState(false);
    const [replacement, setReplacement] = React.useState('');
    const [outcome, setOutcome] = React.useState<ReplaceOutcome>();
    const [replacing, setReplacing] = React.useState(false);
    const [revision, setRevision] = React.useState(0);
    const [limit, setLimit] = React.useState(pageSize);
    const [active, setActive] = React.useState<SearchResult>();
    const [kinds, setKinds] = React.useState(() => new Set(filters.flatMap(filter => filter.kinds)));
    const input = React.useRef<HTMLInputElement>();
    const box = React.useRef<HTMLDivElement>();
    const popup = React.useRef<HTMLDivElement>();
    const replaceField = React.useRef<HTMLInputElement>();
    const replacingMatch = React.useRef(false);
    const revealing = React.useRef(0);
    const searchYaml = open && kinds.has('yaml') && Boolean(query.trim());
    const yamlDocuments = React.useMemo(() => searchYaml ? documents?.getSearchableYamlDocuments() ?? [] : [],
        [searchYaml, documents, revision]);
    const groups = React.useMemo(() => {
        if (!open) return [];
        const groups: {kind: SearchKind; title: string; results: SearchResult[]}[] =
            searchProject(project, getMessages(), query, japanese, kinds);
        const yaml = searchYamlDocuments(yamlDocuments, query, japanese);
        if (yaml.length) groups.push({kind: 'yaml', title: japanese ? 'YAML 本文' : 'YAML text', results: yaml});
        return groups;
    }, [open, project, getMessages, query, japanese, kinds, yamlDocuments, revision]);
    const visible = groups.flatMap(group => group.results.slice(0, limit));
    const activeIndex = visible.indexOf(active);
    const show = open;
    const more = groups.some(group => group.results.length > limit);
    const listId = 'tw-plus-project-search-results';
    const optionId = (index: number) => `${listId}-${index}`;
    const canEdit = (result: SearchResult) => result.kind === 'yaml' ? Boolean(documents?.stageYamlReplacement) : Boolean(result.edit);
    const proposed = active && canEdit(active) ? replacementText(active, query, replacement) : undefined;

    React.useLayoutEffect(() => {
        const field = input.current;
        const win = field.ownerDocument.defaultView;
        const focusSearch = () => {
            field.focus();
            field.select();
        };
        const openReplace = () => {
            setOpen(true);
            if (!field.value.trim()) {
                focusSearch();
                return;
            }
            // The popup may mount in this update, so wait for it before reaching into it.
            const focusReplacement = (retries: number) => {
                const target = replaceField.current;
                if (!target) {
                    if (retries) win.requestAnimationFrame(() => focusReplacement(retries - 1));
                    else focusSearch();
                    return;
                }
                target.focus();
                target.select();
            };
            win.requestAnimationFrame(() => focusReplacement(2));
        };
        const disconnectReplace = connectProjectReplaceOpener(project, openReplace);
        const shortcut = (event: KeyboardEvent) => {
            const replace = projectReplaceShortcut.matches(event);
            const find = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey &&
                event.key.toLowerCase() === 'f';
            if (!field.offsetWidth || (!find && !replace)) return;
            event.preventDefault();
            event.stopPropagation();
            if (find) focusSearch();
            else if (!event.repeat) openReplace();
        };
        win.addEventListener('keydown', shortcut, true);
        return () => {
            win.removeEventListener('keydown', shortcut, true);
            disconnectReplace();
        };
    }, [project]);

    React.useLayoutEffect(() => {
        if (!show) return;
        const field = input.current;
        const panel = popup.current;
        const win = field.ownerDocument.defaultView;
        const place = () => {
            const rect = field.getBoundingClientRect();
            const width = Math.min(430, win.innerWidth - 16);
            const below = win.innerHeight - rect.bottom - 12;
            const above = rect.top - 12;
            const placeBelow = below >= 160 || below >= above;
            panel.style.width = `${width}px`;
            panel.style.left = `${Math.max(8, Math.min(rect.right - width, win.innerWidth - width - 8))}px`;
            panel.style.top = placeBelow ? `${rect.bottom + 4}px` : 'auto';
            panel.style.bottom = placeBelow ? 'auto' : `${win.innerHeight - rect.top + 4}px`;
            panel.style.maxHeight = `${Math.min(450, placeBelow ? below : above)}px`;
        };
        place();
        if (panel.showPopover && !panel.matches(':popover-open')) panel.showPopover();
        // Revealing a result keeps the panel open, so a press anywhere else has to dismiss it:
        // blur cannot tell the editor taking focus from the reader turning to something else.
        const dismiss = (event: Event) => {
            const target = event.target as Node;
            if (box.current?.contains(target) || panel.contains(target)) return;
            close();
        };
        const observer = new win.ResizeObserver(place);
        observer.observe(field);
        win.addEventListener('pointerdown', dismiss, true);
        win.addEventListener('resize', place);
        win.addEventListener('scroll', place, true);
        return () => {
            observer.disconnect();
            win.removeEventListener('pointerdown', dismiss, true);
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

    function reveal(result: SearchResult) {
        const win = input.current.ownerDocument.defaultView;
        // Revealing a result moves the editor, and a YAML preview takes focus when it opens. Keep
        // the panel open through that so the same result is still the one the replacement applies
        // to, and leave focus wherever the destination put it.
        revealing.current += 1;
        select(result);
        win.setTimeout(() => { revealing.current -= 1; }, 1000);
    }

    function choose(result: SearchResult) {
        setActive(result);
        setOutcome(undefined);
        reveal(result);
    }

    function jump(result: SearchResult) {
        close();
        select(result);
    }

    async function replaceSelected() {
        if (replacingMatch.current || !active || proposed === undefined) return;
        replacingMatch.current = true;
        setReplacing(true);
        setOutcome(undefined);
        try {
            const result = await replace(active, proposed);
            setOutcome(result);
            if (result === 'staged') close();
            if (result === 'applied' || result === 'stale') {
                setActive(undefined);
                setRevision(value => value + 1);
            }
            if (result !== 'staged' && !popup.current?.contains(input.current?.ownerDocument.activeElement)) {
                input.current?.focus({preventScroll: true});
            }
        } catch {
            setOutcome('invalid');
        } finally {
            replacingMatch.current = false;
            setReplacing(false);
        }
    }

    return <div ref={box} className={styles.field} onBlur={event => {
        if (!replacingMatch.current && !revealing.current && !event.currentTarget.contains(event.relatedTarget) &&
            !popup.current?.contains(event.relatedTarget)) close();
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
                setOutcome(undefined);
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
                    const first = popup.current?.querySelector<HTMLElement>('input, button');
                    if (first) {
                        event.preventDefault();
                        first.focus();
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
                    jump(active ?? visible[0]);
                }
            }} />
        {show && input.current && createPortal(
            <div ref={popup} className={styles.popup}
                {...(typeof input.current.showPopover === 'function' ? {popover: 'manual'} : {})}
                onKeyDown={event => {
                    const backToSearch = event.key === 'Tab' && event.shiftKey &&
                        event.target === popup.current.querySelector('input, button');
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
                <div className={styles.replaceTools}>
                    <input ref={replaceField} type="text" autoComplete="off" value={replacement}
                        placeholder={japanese ? '置換後の文字列' : 'Replace with'}
                        aria-label={japanese ? '置換後の文字列' : 'Replace with'}
                        onChange={event => {setReplacement(event.currentTarget.value); setOutcome(undefined);}} />
                    <button type="button" disabled={replacing || proposed === undefined}
                        onClick={() => void replaceSelected()}>
                        {active?.kind === 'yaml' ? (japanese ? 'プレビューで置換' : 'Replace in preview') :
                            (japanese ? '選択箇所を置換' : 'Replace selected match')}
                    </button>
                </div>
                {outcome ? <div className={styles.empty} role="status">{replaceMessages[outcome][japanese ? 0 : 1]}</div> :
                    replacement && !active ?
                        <div className={styles.empty} role="status">{pickMatch[japanese ? 0 : 1]}</div> : null}
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
                                <small>{[name, result.detail, !canEdit(result) &&
                                    (japanese ? '閲覧専用' : 'Read only')].filter(Boolean).join(' · ')}</small>
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
export function ProjectSearch(search: Omit<SearchBoxProps, 'select' | 'replace' | 'documents'>) {
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
    const moveToResult = (result: ProjectSearchResult) => {
        const {target} = result;
        if (navigation.getTarget(target.id) !== target) return;
        const moved = activateTargetView(navigation, target.id,
            result.kind === 'sound' ? 2 : 'asset' in result ? 1 : 0);
        if (!moved) return;
        return () => {
            const current = moved.views.currentView();
            return connection.navigation === navigation && navigation.getViews() === moved.views &&
                navigation.getEditingTarget() === target && current?.id === moved.viewId &&
                current.section === moved.section;
        };
    };
    const select = (result: SearchResult) => {
        if (result.kind === 'yaml') {
            documents?.openYamlPreview(result.document.reference, result.range);
            return;
        }
        const {target} = result;
        const isDestination = moveToResult(result);
        if (!isDestination) return;
        window.cancelAnimationFrame(frame.current);
        frame.current = window.requestAnimationFrame(() => {
            if (!isDestination()) return;
            if ('asset' in result) {
                const kind = result.kind === 'sound' ? 'sounds' : 'costumes';
                const assets = kind === 'sounds' ? target.getSounds() : target.getCostumes();
                const index = assets.indexOf(result.asset);
                if (index >= 0) {
                    const views = navigation.getViews();
                    views.selectAsset(views.currentView().id, kind, index);
                }
            } else if (result.kind === 'comment') {
                if (target.comments?.[result.commentId] === result.comment) {
                    navigation.centerComment(result.commentId, result.comment.blockId);
                }
            } else if (target.blocks.getBlock(result.block.id) === result.block) {
                navigation.centerBlock(result.block.id);
            }
        });
    };
    const replace = async (result: SearchResult, value: string): Promise<ReplaceOutcome> => {
        if (result.kind === 'yaml') {
            return documents?.stageYamlReplacement?.(result.document.reference, result.range, result.document.source, value) ?
                'staged' : 'stale';
        }
        if (!result.edit) return 'read-only';
        const isDestination = moveToResult(result);
        if (!isDestination) return 'stale';
        await new Promise(resolve => window.requestAnimationFrame(resolve));
        if (!isDestination()) return 'stale';
        const context = navigation.replacementContext?.();
        if (!context) return 'read-only';
        const outcome = applyProjectSearchReplacement(search.project, context.workspace, context.Blockly, result, value);
        // Let the workspace deliver its change event to the VM before querying it again.
        if (outcome === 'applied') await new Promise(resolve => window.setTimeout(resolve, 0));
        return outcome;
    };
    return <ProjectSearchBox {...search} {...{documents, select, replace}} />;
}
