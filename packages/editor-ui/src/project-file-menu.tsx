import React from 'react';
import styles from './project-file-menu.css';
import type {Action, FolderActions, ProjectFileStorage} from './project-file-dialogs.ts';

type Entry = [command: string, label: string, action: Action | undefined];

type SaveEntries = {storage: ProjectFileStorage; folder?: FolderActions; saveAs?: Action};

function saveEntries(locale: string, {storage, folder, saveAs}: SaveEntries): Entry[] {
    const ja = locale.startsWith('ja');
    return [
        ['save', ja ? '保存' : 'Save', storage.canSave ? storage.overwrite || folder?.save : undefined],
        ['save-as', ja ? '名前を変えて保存…' : 'Save As…', storage.canSave ? saveAs : undefined]
    ];
}

export function ProjectSaveMenu({locale, entries}: {locale: string; entries: SaveEntries}) {
    const label = locale.startsWith('ja') ? '未保存の変更があります。保存メニューを開く' :
        'Unsaved changes. Open the save menu';
    const [open, setOpen] = React.useState(false);
    const trigger = React.useRef<HTMLButtonElement>(null);
    const root = React.useRef<HTMLDivElement>(null);
    const close = () => {
        setOpen(false);
        trigger.current?.focus();
    };
    React.useEffect(() => {
        if (!open || !root.current) return;
        const node = root.current;
        const dismiss = (event: PointerEvent) => {
            if (!node.contains(event.target as Node)) setOpen(false);
        };
        node.ownerDocument.addEventListener('pointerdown', dismiss, true);
        return () => node.ownerDocument.removeEventListener('pointerdown', dismiss, true);
    }, [open]);
    const actions = saveEntries(locale, entries).filter(([, , action]) => action);
    return <div className={styles.saveMenu} ref={root}
        onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
        }} onKeyDown={event => {
            if (open && event.key === 'Escape') {
                event.stopPropagation();
                close();
            }
        }}>
        <button type="button" ref={trigger} className={styles.saveMarker} data-tw-plus-unsaved-marker aria-label={label}
            aria-expanded={actions.length ? open : undefined} disabled={!actions.length}
            onClick={() => setOpen(previous => !previous)}>*</button>
        {!open && <span className={styles.saveHint} aria-hidden="true">{label}</span>}
        {open && actions.length > 0 && <div className={styles.saveActions}>
            {actions.map(([command, name, action]) => <button type="button" key={command} onClick={() => {
                close();
                action();
            }}>{name}</button>)}
        </div>}
    </div>;
}

export default function ProjectFileMenu({locale, MenuItem, MenuSection, close, entries}: {
    locale: string;
    MenuItem: React.ElementType;
    MenuSection: React.ElementType;
    close: Action;
    entries: {
        create: Action;
        newWindow?: Action;
        open: Action;
        externalYaml?: React.ReactNode;
        folder?: FolderActions;
        storage: ProjectFileStorage;
        saveAs?: Action;
        exportProject?: Action;
        properties?: Action;
        diagnostics?: Action;
        payloads?: Action;
        extensions?: Action;
        restore: Action;
        git?: React.ReactNode;
    };
}) {
    const ja = locale.startsWith('ja');
    const item = ([command, label, action]: Entry) => {
        const run = action && (() => {close(); action();});
        return <MenuItem key={command} command={command} onClick={run}>
            <span className={styles.item} role="button" aria-disabled={!run || undefined} tabIndex={run ? 0 : -1}
                style={!run ? {opacity: 0.5, cursor: 'default'} : undefined} onKeyDown={event => {
                    if (!run || (event.key !== 'Enter' && event.key !== ' ')) return;
                    event.preventDefault();
                    event.stopPropagation();
                    run();
                }}>{label}</span>
        </MenuItem>;
    };
    const e = entries;
    return <>
        {item(['new', ja ? '新しいプロジェクトを作成' : 'Create New Project', e.create])}
        {e.newWindow && item(['window', ja ? '新しいウィンドウ' : 'New Window', e.newWindow])}
        <MenuSection>
            {item(['open', ja ? 'SB3ファイルを開く…' : 'Open SB3 File…', e.open])}
            {e.folder && item(['project-folder-open', ja ? 'プロジェクトフォルダを開く…' : 'Open Project Folder…', e.folder.open])}
            {e.externalYaml}
        </MenuSection>
        <MenuSection>
            {saveEntries(locale, e).map(item)}
            {e.exportProject && item(['package', ja ? '書き出し…' : 'Export…', e.exportProject])}
        </MenuSection>
        {(e.properties || e.payloads || e.extensions || e.diagnostics) && <MenuSection>
            {([
                ['properties', ja ? '作品のプロパティ' : 'Project Properties', e.properties],
                ['payloads', ja ? '組み込みデータ…' : 'Project Data…', e.payloads],
                ['extension', ja ? '機能拡張…' : 'Extensions…', e.extensions],
                ['diagnostics', ja ? '作品の診断…' : 'Project Diagnostics…', e.diagnostics]
            ] as Entry[]).filter(([, , callback]) => callback).map(item)}
        </MenuSection>}
        <MenuSection>
            {item(['restore', ja ? '復元ポイント' : 'Restore Points', e.restore])}
            {e.git}
        </MenuSection>
    </>;
}
