import React from 'react';

type Action = () => void;
type Entry = [command: string, label: string, action: Action | undefined];
type FolderActions = {open: Action; save?: Action; detach: Action};
export type SaveFormat = 'current' | 'embedded';
type Serialize = <T>(run: () => T) => T;

export interface ProjectFileStorage {
    canSave: boolean;
    filename: string;
    overwrite?: Action;
    pick?: (filename: string) => Promise<FileSystemFileHandle>;
    write(handle: FileSystemFileHandle, serialize: Serialize, current: () => boolean): Promise<void>;
    download(filename: string, serialize: Serialize, current: () => boolean): Promise<void>;
    finish(handle: FileSystemFileHandle | null, title: string, unchanged: boolean): void;
    fail(error: unknown): void;
}

export function ProjectFileMenu({locale, MenuItem, MenuSection, close, entries}: {
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

export function projectSaveShortcut(storage: ProjectFileStorage, folder?: FolderActions, saveAs?: Action) {
    if (storage.canSave) (storage.overwrite || folder?.save || saveAs)?.();
}

export async function saveProjectAs(storage: ProjectFileStorage, name: string, {
    current, unchanged, serialize, committed
}: {
    current(): boolean;
    unchanged(): boolean;
    serialize<T>(title: string, run: () => T): T;
    committed(): void;
}) {
    if (!storage.canSave || !current()) return false;
    const filename = name + '.sb3';
    try {
        const handle = storage.pick ? await storage.pick(filename) : null;
        if (!current()) return false;
        const title = handle ? handle.name.replace(/\.sb3$/i, '').slice(0, 100) : name;
        const output: Serialize = run => {
            if (!current()) throw new DOMException('The project changed', 'AbortError');
            return serialize(title, run);
        };
        if (handle) await storage.write(handle, output, current);
        else await storage.download(filename, output, current);
        if (!current()) return false;
        committed();
        storage.finish(handle, title, unchanged());
        return true;
    } catch (error) {
        storage.fail(error);
        return false;
    }
}

export function renderSaveAsForm(document: Document, locale: string, storage: ProjectFileStorage,
    save: (name: string, format: SaveFormat, open: () => boolean) => Promise<boolean>, close: Action) {
    const ja = locale.startsWith('ja');
    const form = document.createElement('form');
    const row = (title: string, input: HTMLElement) => {
        const label = document.createElement('label');
        label.append(title, input);
        form.append(label);
    };
    const name = document.createElement('input');
    name.required = true;
    name.maxLength = 100;
    name.value = storage.filename.replace(/\.sb3$/i, '');
    row(ja ? '名前' : 'Name', name);
    const format = document.createElement('select');
    format.append(
        new Option(ja ? 'SB3（現在の格納方式）' : 'SB3 (current storage settings)', 'current'),
        new Option(ja ? 'SB3（設定対象の台本・素材を同梱）' : 'SB3 (embed configured scripts and assets)', 'embedded')
    );
    row(ja ? '保存形式' : 'Save format', format);
    const status = document.createElement('p');
    status.setAttribute('role', 'alert');
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = ja ? 'キャンセル' : 'Cancel';
    cancel.onclick = close;
    const submit = document.createElement('button');
    submit.textContent = storage.pick ? (ja ? '保存先を選ぶ…' : 'Choose Where to Save…') : (ja ? '保存' : 'Save');
    form.append(status, cancel, submit);
    form.onsubmit = async event => {
        event.preventDefault();
        const title = name.value.trim().replace(/\.sb3$/i, '');
        if (submit.disabled || !title) return;
        submit.disabled = true;
        status.textContent = '';
        try {
            if (await save(title, format.value as SaveFormat, () => form.isConnected)) close();
        } catch (error) {
            status.textContent = error.message;
        } finally {
            submit.disabled = false;
        }
    };
    return form;
}

export function renderExportView(document: Document, locale: string, close: Action, run: Action) {
    const ja = locale.startsWith('ja');
    const view = document.createElement('div');
    const explanation = document.createElement('p');
    explanation.textContent = ja ?
        '実行・配布用のファイルを作成します。書き出しに必要な作品データは出力に同梱されます。' :
        'Create a file for running or sharing the project. Project data needed for export is included in the output.';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = ja ? 'プロジェクトをパッケージ化する' : 'Package Project';
    button.onclick = () => {close(); run();};
    view.append(explanation, button);
    return view;
}

export type ExtensionStorage = 'remote-non-cacheable' | 'remote-cacheable' | 'embedded-file' | 'embedded-data';

export function renderExtensionsForm(document: Document, locale: string, close: Action, add: Action | undefined, {
    list, change
}: {
    list(): Promise<{id: string; format?: ExtensionStorage; editable?: boolean}[]>;
    change(changes: Map<string, ExtensionStorage>): Promise<void>;
}) {
    const ja = locale.startsWith('ja');
    const form = document.createElement('form');
    const entries = document.createElement('ul');
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = ja ? '確認中…' : 'Inspecting…';
    const done = document.createElement('button');
    done.type = 'button';
    done.textContent = ja ? '閉じる' : 'Close';
    done.onclick = close;
    const apply = document.createElement('button');
    apply.textContent = ja ? '格納方式を適用' : 'Apply Storage Settings';
    apply.disabled = true;
    form.append(entries, status, done, apply);
    if (add) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = ja ? '機能拡張の追加' : 'Add Extension';
        button.onclick = () => {close(); add();};
        form.append(button);
    }
    const labels = {
        'remote-non-cacheable': ja ? 'HTTPSから毎回取得' : 'Fetch from HTTPS each time',
        'remote-cacheable': ja ? 'HTTPSから取得・キャッシュ可' : 'Fetch from HTTPS, caching allowed',
        'embedded-file': ja ? 'SB3内のファイル' : 'File in the SB3',
        'embedded-data': ja ? '作品JSON内のデータ' : 'Data in the project JSON'
    };
    const choices = new Map<string, {original: ExtensionStorage; input: HTMLSelectElement}>();
    const changed = () => new Map([...choices].filter(([, choice]) => choice.input.value !== choice.original)
        .map(([id, choice]) => [id, choice.input.value as ExtensionStorage]));
    void list().then(items => {
        status.textContent = items.length ? '' : (ja ? '使用中の機能拡張はありません。' : 'No extensions in use.');
        for (const item of items) {
            const li = document.createElement('li');
            if (!item.editable) {
                li.textContent = item.format ? `${item.id} — ${labels[item.format]}` : item.id;
            } else {
                const label = document.createElement('label');
                const input = document.createElement('select');
                for (const [value, title] of Object.entries(labels)) input.add(new Option(title, value));
                input.value = item.format;
                input.onchange = () => {apply.disabled = !changed().size;};
                choices.set(item.id, {original: item.format, input});
                label.append(item.id, input);
                li.append(label);
            }
            entries.append(li);
        }
    }, error => {status.textContent = error.message;});
    form.onsubmit = async event => {
        event.preventDefault();
        if (apply.disabled) return;
        apply.disabled = true;
        status.textContent = ja ? '適用中…' : 'Applying…';
        for (const {input} of choices.values()) input.disabled = true;
        try {
            await change(changed());
            if (form.isConnected) close();
        } catch (error) {
            status.textContent = error.message;
            for (const {input} of choices.values()) input.disabled = false;
            apply.disabled = false;
        }
    };
    return form;
}
