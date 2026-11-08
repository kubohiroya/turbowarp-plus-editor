import React from 'react';
import type {Action, FolderActions, ProjectFileStorage} from './project-file-dialogs.ts';

type Entry = [command: string, label: string, action: Action | undefined];

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
            <span role="button" aria-disabled={!run || undefined} tabIndex={run ? 0 : -1}
                style={!run ? {opacity: 0.5, cursor: 'default'} : undefined} onKeyDown={event => {
                    if (!run || (event.key !== 'Enter' && event.key !== ' ')) return;
                    event.preventDefault();
                    event.stopPropagation();
                    run();
                }}>{label}</span>
        </MenuItem>;
    };
    const e = entries;
    const action = e.storage.canSave && (e.storage.overwrite || e.folder?.save) || undefined;
    return <>
        {item(['new', ja ? '新しいプロジェクトを作成' : 'Create New Project', e.create])}
        {e.newWindow && item(['window', ja ? '新しいウィンドウ' : 'New Window', e.newWindow])}
        <MenuSection>
            {item(['open', ja ? 'SB3ファイルを開く…' : 'Open SB3 File…', e.open])}
            {e.folder && item(['project-folder-open', ja ? 'プロジェクトフォルダを開く…' : 'Open Project Folder…', e.folder.open])}
            {e.externalYaml}
        </MenuSection>
        <MenuSection>
            {item(['save', ja ? '保存' : 'Save', action])}
            {item(['save-as', ja ? '名前を変えて保存…' : 'Save As…', e.storage.canSave ? e.saveAs : undefined])}
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
