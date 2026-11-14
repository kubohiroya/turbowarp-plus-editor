import {dialogAction, dialogActions} from './dialog-actions.ts';
import type {CreationInteraction, RepositoryCreationControls, RepositoryCreationProgress, RepositoryReceipt}
    from './project-repository-creation.ts';

export type Action = () => void;
export type FolderActions = {open: Action; save?: Action; detach: Action};
export type SaveFormat = 'current' | 'embedded' | 'folder';
type Serialize = <T>(run: () => T) => T;

export type GitHubVisibility = 'private' | 'public';
export interface GitHubCreationAccount {
    account: {login: string};
    owners: readonly {
        login: string;
        type: 'User' | 'Organization';
        canCreate: Record<GitHubVisibility, boolean>;
    }[];
}

export interface GitHubRepositoryDraft {
    account: string;
    owner: string;
    name: string;
    title: string;
    description: string;
    topics: readonly string[];
    license: string | null;
    visibility: GitHubVisibility;
}

export type SaveAsRequest =
    | {name: string; format: 'current' | 'embedded'}
    | {name: string; format: 'folder'; git?: GitHubRepositoryDraft};

export interface SaveAsFormOptions {
    openCommit?: Action;
    folder?: {
        overwriteWarning?: string;
        github?: {
            // The host can reuse a current session or open sign-in. The form retains its draft either way.
            connectForCreation(interaction: CreationInteraction): Promise<GitHubCreationAccount | null>;
            licenses?: readonly {id: string; label: string}[];
            publication?: RepositoryCreationControls;
        };
    };
}

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

/**
 * Saving over the last file or into the project folder first collects edits held by other windows,
 * as Save As does, so a save that does not move the focus to the editor misses nothing. A failed
 * collection reports the failure, does not save, and leaves those edits for a retry.
 */
export function collectBeforeSaving(storage: ProjectFileStorage, folder: FolderActions | undefined,
    collect: () => Promise<void>) {
    const first = (action?: Action) => action && (async () => {
        try {
            await collect();
        } catch (error) {
            storage.fail(error);
            return;
        }
        action();
    });
    return {
        storage: storage.overwrite ? {...storage, overwrite: first(storage.overwrite)} : storage,
        folder: folder?.save ? {...folder, save: first(folder.save)} : folder
    };
}

export function projectSaveShortcut(storage: ProjectFileStorage, folder?: FolderActions, saveAs?: Action) {
    if (storage.canSave) (storage.overwrite || folder?.save || saveAs)?.();
}

export async function saveProjectAs(storage: ProjectFileStorage, name: string, {
    current, unchanged, serialize, committed, collect
}: {
    current(): boolean;
    unchanged(): boolean;
    serialize<T>(title: string, run: () => T): T;
    committed(): void;
    // Collects edits still held by other windows. A failure leaves them there for a retry.
    collect?(): Promise<void>;
}) {
    if (!storage.canSave || !current()) return false;
    const filename = name + '.sb3';
    try {
        const handle = storage.pick ? await storage.pick(filename) : null;
        if (!current()) return false;
        await collect?.();
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

const validRepositoryName = (name: string) => /^[A-Za-z0-9_.-]{1,100}$/.test(name) &&
    name !== '.' && name !== '..' && !/\.git$/i.test(name);

function parseGitHubRepositoryUrl(url: string) {
    const match = /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,104})\/?$/i.exec(url.trim());
    const name = match?.[2].replace(/\.git$/iu, '');
    return name && validRepositoryName(name) ? {owner: match[1], name} : null;
}
const invalidDraft = (message: string) => Object.assign(new Error(message), {code: 'invalidDraft'});

const readTopics = (value: string) => value.split(',').map(topic => topic.trim()).filter(Boolean);
const validTopics = (topics: readonly string[]) => topics.length <= 20 &&
    topics.every(topic => /^[a-z0-9][a-z0-9-]{0,49}$/.test(topic));

function appendOption(select: HTMLSelectElement, title: string, value: string) {
    const option = select.ownerDocument.createElement('option');
    option.textContent = title;
    option.value = value;
    select.append(option);
}

function appendField(parent: HTMLElement, title: string, input: HTMLElement) {
    const label = parent.ownerDocument.createElement('label');
    label.append(title, input);
    parent.append(label);
    return label;
}

type GitHubCreationProvider = NonNullable<NonNullable<SaveAsFormOptions['folder']>['github']>;

function createGitHubFields(document: Document, label: (ja: string, en: string) => string,
    provider: GitHubCreationProvider, report: (message: string) => void) {
    const panel = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = label('GitHub リポジトリ', 'GitHub repository');
    const identity = document.createElement('p');
    identity.hidden = true;
    panel.append(legend, identity);

    const owner = document.createElement('select');
    owner.name = 'github-owner';
    owner.disabled = true;
    appendField(panel, label('作成先', 'Repository owner'), owner);
    const name = document.createElement('input');
    name.name = 'github-name';
    name.maxLength = 100;
    appendField(panel, label('リポジトリ名', 'Repository name'), name);
    const url = document.createElement('input');
    url.name = 'github-url';
    url.inputMode = 'url';
    url.placeholder = 'https://github.com/owner/repository';
    appendField(panel, label('GitHub URL（任意）', 'GitHub URL (optional)'), url);
    const description = document.createElement('input');
    description.name = 'github-description';
    description.maxLength = 350;
    appendField(panel, label('概要', 'Description'), description);
    const topics = document.createElement('input');
    topics.name = 'github-topics';
    appendField(panel, label('トピック（カンマ区切り）', 'Topics (comma separated)'), topics);
    const topicError = label('トピックは小文字・数字・ハイフンで、1件50文字以内、20件以内です。',
        'Use at most 20 topics, each up to 50 characters, with lowercase letters, digits, and hyphens.');
    topics.oninput = () => {
        const valid = validTopics(readTopics(topics.value));
        topics.setAttribute('aria-invalid', String(!valid));
        report(valid ? '' : topicError);
    };
    const license = document.createElement('select');
    license.name = 'github-license';
    appendOption(license, label('なし', 'None'), '');
    for (const choice of provider.licenses ?? []) appendOption(license, choice.label, choice.id);
    appendField(panel, label('ライセンス', 'License'), license);
    const visibility = document.createElement('select');
    visibility.name = 'github-visibility';
    appendOption(visibility, label('非公開', 'Private'), 'private');
    appendOption(visibility, label('公開', 'Public'), 'public');
    appendField(panel, label('公開範囲', 'Visibility'), visibility);

    let account: GitHubCreationAccount | null = null;
    let requestedOwner: string | null = null;
    const fillOwners = (current: GitHubCreationAccount) => {
        const expected = requestedOwner ?? owner.value;
        owner.replaceChildren();
        for (const choice of current.owners) appendOption(owner, choice.login, choice.login);
        const selected = [...owner.options].find(choice => choice.value.toLowerCase() === expected.toLowerCase());
        if (selected) owner.value = selected.value;
        else if (expected) {
            appendOption(owner, label(`${expected}（選択不可）`, `${expected} (unavailable)`), expected);
            owner.value = expected;
        }
    };
    owner.onchange = () => { requestedOwner = null; };

    return {
        panel,
        get connected() {return account !== null;},
        async connect(open: () => boolean, interaction: CreationInteraction) {
            const result = await provider.connectForCreation(interaction);
            if (!open() || !result) return false;
            account = result;
            identity.hidden = false;
            identity.textContent = label(`GitHub アカウント ${result.account.login}`, `GitHub account ${result.account.login}`);
            fillOwners(result);
            owner.disabled = false;
            return true;
        },
        applyUrl() {
            if (!url.value.trim()) return;
            const parsed = parseGitHubRepositoryUrl(url.value);
            if (!parsed) throw invalidDraft(label('https://github.com/所有者/リポジトリ名 の形式で入力してください。',
                'Enter a URL in the form https://github.com/owner/repository.'));
            requestedOwner = parsed.owner;
            name.value = parsed.name;
            url.value = '';
            if (account) fillOwners(account);
        },
        draft(title: string): GitHubRepositoryDraft {
            if (!validRepositoryName(name.value.trim())) throw invalidDraft(label('有効なリポジトリ名を入力してください。',
                'Enter a valid repository name.'));
            const topicValues = readTopics(topics.value);
            if (!validTopics(topicValues)) throw invalidDraft(topicError);
            const selectedVisibility = visibility.value === 'public' ? 'public' : 'private';
            const destination = account?.owners.find(choice => choice.login === owner.value);
            if (!account || !destination) throw invalidDraft(label('リポジトリを作成できる作成先を選んでください。',
                'Choose an owner where you can create a repository.'));
            if (!destination.canCreate[selectedVisibility]) throw invalidDraft(label('この作成先では選んだ公開範囲を使えません。',
                'The selected visibility is unavailable for this owner.'));
            return {account: account.account.login, owner: destination.login, name: name.value.trim(), title,
                description: description.value.trim(), topics: [...new Set(topicValues)], license: license.value || null,
                visibility: selectedVisibility};
        },
        review(draft: GitHubRepositoryDraft, container: HTMLElement) {
            const heading = document.createElement('h3');
            heading.textContent = label('GitHub リポジトリ作成の確認', 'Review GitHub repository creation');
            heading.tabIndex = -1;
            const details = document.createElement('dl');
            const empty = label('なし', 'None');
            for (const [title, value] of [
                [label('GitHub アカウント', 'GitHub account'), draft.account],
                [label('リポジトリ', 'Repository'), `https://github.com/${draft.owner}/${draft.name}`],
                [label('タイトル', 'Title'), draft.title],
                [label('概要', 'Description'), draft.description || empty],
                [label('トピック', 'Topics'), draft.topics.join(', ') || empty],
                [label('ライセンス', 'License'), license.selectedOptions[0]?.textContent || empty],
                [label('公開範囲', 'Visibility'), draft.visibility === 'private' ? label('非公開', 'Private') : label('公開', 'Public')]
            ]) {
                const term = document.createElement('dt');
                term.textContent = title;
                const definition = document.createElement('dd');
                definition.textContent = value;
                details.append(term, definition);
            }
            container.replaceChildren(heading, details);
            return heading;
        }
    };
}

export function renderSaveAsForm(document: Document, locale: string, storage: ProjectFileStorage,
    save: (request: SaveAsRequest, open: () => boolean, signal: AbortSignal) =>
        Promise<boolean | RepositoryCreationProgress | null>, close: Action,
    {folder, openCommit}: SaveAsFormOptions = {}) {
    const label = (ja: string, en: string) => locale.startsWith('ja') ? ja : en;
    const form = document.createElement('form');
    const fields = document.createElement('div');
    const name = document.createElement('input');
    name.name = 'title';
    name.required = true;
    name.maxLength = 100;
    name.value = storage.filename.replace(/\.sb3$/i, '');
    const nameField = appendField(fields, label('名前', 'Name'), name);
    const format = document.createElement('select');
    format.name = 'format';
    appendOption(format, label('SB3（現在の格納方式）', 'SB3 (current storage settings)'), 'current');
    appendOption(format, label('SB3（設定対象の台本・素材を同梱）', 'SB3 (embed configured scripts and assets)'), 'embedded');
    const picker = (document.defaultView as (Window & {showDirectoryPicker?: unknown}) | null)?.showDirectoryPicker;
    const folderAvailable = folder && typeof picker === 'function';
    if (folderAvailable) appendOption(format, label('プロジェクトフォルダ', 'Project folder'), 'folder');
    appendField(fields, label('保存形式', 'Save format'), format);

    const status = document.createElement('p');
    status.setAttribute('role', 'alert');
    const report = (message: string) => {status.textContent = message;};
    const git = document.createElement('input');
    git.type = 'checkbox';
    git.name = 'git';
    const gitChoice = document.createElement('div');
    appendField(gitChoice, label('Git でバージョン管理する', 'Use Git version control'), git);
    const github = folderAvailable && folder.github ? createGitHubFields(document, label, folder.github, report) : null;
    if (github) fields.append(gitChoice, github.panel);
    const overwriteWarning = document.createElement('p');
    if (folder?.overwriteWarning) {
        overwriteWarning.textContent = folder.overwriteWarning;
        fields.append(overwriteWarning);
    }
    const publication = github ? folder.github.publication : undefined;
    const pending = document.createElement('ul');
    pending.setAttribute('aria-label', label('未完了のリポジトリ作成', 'Pending repository setup'));
    const device = document.createElement('div');
    const controller = new AbortController();
    const interaction: CreationInteraction = {
        signal: controller.signal,
        deviceCode({userCode, verificationUri}) {
            if (!open()) return;
            const link = document.createElement('a');
            link.href = verificationUri;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = label('GitHub で認証する', 'Authorize on GitHub');
            const code = document.createElement('strong');
            code.textContent = userCode;
            device.replaceChildren(link, ' ', code);
        }
    };

    const review = document.createElement('div');
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = label('キャンセル', 'Cancel');
    let dismissed = false;
    const dismiss = () => {dismissed = true; controller.abort(); close();};
    cancel.onclick = dismiss;
    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = label('戻る', 'Back');
    const submit = document.createElement('button');
    submit.type = 'submit';
    const recoverAccess = document.createElement('button');
    recoverAccess.type = 'button';
    recoverAccess.textContent = label('ローカルフォルダへのアクセスを許可…', 'Grant Local Folder Access…');
    const actions = dialogActions(document, back, recoverAccess, dialogAction(cancel, 'cancel'),
        dialogAction(submit, 'confirm'));
    form.append(fields, pending, review, device, status, actions);
    const commit = document.createElement('button');
    if (openCommit) {
        commit.type = 'button';
        commit.textContent = label('保存してコミット…', 'Save and Commit…');
        commit.onclick = openCommit;
        actions.prepend(commit);
    }

    type FolderReview = {name: string; format: 'folder'; git: GitHubRepositoryDraft};
    let confirmedDraft: FolderReview | null = null;
    let task: RepositoryCreationProgress | null = null;
    let candidate: RepositoryReceipt | null = null;
    let needsAccess = false;
    let busy = false;
    const open = () => !dismissed && form.isConnected;
    const savingFolder = () => folderAvailable && format.value === 'folder';
    const selectedGitHub = () => savingFolder() && git.checked ? github : null;
    const phaseText = (phase: RepositoryCreationProgress['phase']) => ({
        create: label('GitHub リポジトリ作成待ち', 'Waiting to create the repository'),
        unknown: label('GitHub での作成結果を確認してください。', 'Check whether GitHub created the repository.'),
        prepare: label('GitHub リポジトリを作成しました。ローカルの初回コミットを準備します。',
            'GitHub repository created. The local initial commit is still being prepared.'),
        topics: label('ローカルの初回コミットを保存しました。GitHub のトピック設定を再試行できます。',
            'The local initial commit was saved. You can retry setting GitHub topics.'),
        push: label('ローカルの初回コミットを保存しました。GitHub への初回 push を承認してください。',
            'The local initial commit was saved. Authorize the initial push to GitHub.'),
        open: label('初回 push が完了しました。', 'The initial push is complete.')
    })[phase];
    const actionText = (phase: RepositoryCreationProgress['phase']) => ({
        create: label('リポジトリ作成を再開', 'Resume Repository Creation'),
        unknown: candidate ? label('確認したリポジトリで再開', 'Continue with This Repository') :
            label('作成結果を確認', 'Check Creation Result'),
        prepare: label('ローカルの準備を再開', 'Resume Local Setup'),
        topics: label('トピック設定を再試行', 'Retry Setting Topics'),
        push: label('初回 push を承認…', 'Authorize and Push…'),
        open: label('ローカルの作品を開く', 'Open the Local Project')
    })[phase];
    const refreshTask = () => {
        if (!task) return;
        const heading = document.createElement('h3');
        const link = document.createElement('a');
        link.href = `https://github.com/${task.owner}/${task.name}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = task.owner + '/' + task.name;
        heading.append(link);
        const state = document.createElement('p');
        state.textContent = phaseText(task.phase);
        review.replaceChildren(heading, state);
        if (candidate) {
            const detail = document.createElement('p');
            detail.textContent = label(`空のリポジトリ ID ${candidate.id} を確認しました。表示されたリポジトリで初回設定を続けます。`,
                `An empty repository with ID ${candidate.id} was found. Continue setup with the displayed repository.`);
            review.append(detail);
        }
    };
    const refresh = () => {
        const reviewing = confirmedDraft !== null || task !== null;
        const creation = selectedGitHub();
        const localFolder = savingFolder() && !creation;
        overwriteWarning.hidden = !localFolder;
        fields.hidden = reviewing;
        review.hidden = !reviewing;
        back.hidden = !confirmedDraft || task !== null;
        back.disabled = busy;
        nameField.hidden = localFolder;
        name.disabled = busy || reviewing || localFolder;
        format.disabled = busy || reviewing;
        git.disabled = busy || reviewing;
        gitChoice.hidden = !savingFolder();
        if (github) {
            github.panel.hidden = !selectedGitHub();
            github.panel.disabled = busy || reviewing || github.panel.hidden;
        }
        submit.disabled = busy;
        recoverAccess.hidden = !task || !needsAccess;
        recoverAccess.disabled = busy;
        commit.disabled = busy || reviewing;
        pending.hidden = reviewing || !pending.childElementCount;
        submit.textContent = task ? actionText(task.phase) : reviewing ? label('リポジトリを作成', 'Create Repository') : creation ?
            (creation.connected ? label('作成内容を確認', 'Review Repository') : label('GitHub へ接続…', 'Connect to GitHub…')) :
            (savingFolder() || storage.pick ? label('保存先を選ぶ…', 'Choose Where to Save…') : label('保存', 'Save'));
    };
    const loadPending = async () => {
        if (!publication) return [];
        const entries = await publication.list();
        if (!open()) return entries;
        const rows = entries.map(entry => {
            const row = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label(`${entry.owner}/${entry.name} の作成を再開`, `Resume setup for ${entry.owner}/${entry.name}`);
            button.onclick = () => {
                if (busy) return;
                task = entry;
                candidate = null;
                needsAccess = false;
                confirmedDraft = null;
                report('');
                refreshTask();
                refresh();
                submit.focus();
            };
            row.append(button);
            return row;
        });
        pending.replaceChildren(...rows);
        refresh();
        return entries;
    };
    const advance = async () => {
        if (task.phase === 'open') {
            if (await publication.open(task) && open()) dismiss();
            return;
        }
        const updated = await publication.advance(task, interaction, candidate?.id);
        if (!open()) return;
        task = updated.progress;
        candidate = updated.candidate ?? null;
        refreshTask();
        if (updated.candidate === null) report(label('再開できる空のリポジトリを確認できませんでした。',
            'No empty repository was verified for resuming this setup.'));
    };
    const showError = (error: unknown) => {
        const code = (error as {code?: string})?.code;
        switch (code) {
        case 'invalidDraft': return (error as Error).message;
        case 'directoryNotEmpty': return label('空のフォルダを選んでください。', 'Choose an empty directory.');
        case 'directoryPermission': return label('同じローカルフォルダへのアクセスを許可してから再開してください。',
            'Grant access to the same local folder before resuming.');
        case 'differentDirectory': return label('最初に選んだローカルフォルダを選び直してください。',
            'Choose the same local folder you selected initially.');
        case 'popupBlocked': return label('GitHub 認証のポップアップを許可して再試行してください。',
            'Allow the GitHub authorization popup and try again.');
        case 'unknown': return label('GitHub の作成結果を確認できませんでした。作成結果を照会してください。',
            'GitHub did not confirm the creation result. Check the recorded result.');
        case 'nameConflict': return label('同名のリポジトリがすでにあります。', 'A repository with this name already exists.');
        case 'pendingRepository': return label('同じリポジトリの設定を再開してください。', 'Resume the existing setup for this repository.');
        case 'insufficientPermission': case 'forbidden': case 'denied': case 'session':
            return label('GitHub のアカウントと権限を確認して再試行してください。', 'Check the GitHub account and permissions, then retry.');
        case 'rateLimited': return label('GitHub の利用上限に達しました。しばらくしてから再試行してください。',
            'GitHub rate limited this request. Try again later.');
        case 'diverged': return label('GitHub に異なる履歴があるため、初回 push を停止しました。',
            'The initial push stopped because the GitHub repository has different history.');
        case 'pushUnknown': return label('初回 push の結果を確認できません。再試行して GitHub の状態を確認してください。',
            'The initial push result could not be confirmed. Retry to check the GitHub repository.');
        default: return label('リポジトリの設定を完了できませんでした。', 'Could not complete repository setup.');
        }
    };
    recoverAccess.onclick = () => {
        if (!task || busy) return;
        busy = true;
        refresh();
        void publication.grantAccess(task).then(granted => {
            if (!granted || !open()) return;
            needsAccess = false;
            report('');
        }, error => {if (open()) report(showError(error));}).finally(() => {
            busy = false;
            if (open()) refresh();
        });
    };
    format.onchange = git.onchange = () => {report(''); refresh();};
    back.onclick = () => {
        confirmedDraft = null;
        report('');
        refresh();
        submit.focus();
    };
    refresh();
    if (publication) queueMicrotask(() => {if (open()) void loadPending().catch(error => report(showError(error)));});
    if (github && document.defaultView?.MutationObserver) {
        const observer = new document.defaultView.MutationObserver(() => {
            if (!open()) {observer.disconnect(); controller.abort();}
        });
        observer.observe(document.body, {childList: true, subtree: true});
    }

    form.onsubmit = async event => {
        event.preventDefault();
        const value = name.value.trim();
        const title = savingFolder() ? value : value.replace(/\.sb3$/i, '');
        if (!open() || busy || (!task && !confirmedDraft && !title && !name.disabled)) return;
        report('');
        busy = true;
        refresh();
        let focus: HTMLElement | null = null;
        try {
            if (task) {await advance(); return;}
            const creation = selectedGitHub();
            if (creation && !confirmedDraft) {
                creation.applyUrl();
                if (!creation.connected) {
                    report(label('GitHub に接続しています…', 'Connecting to GitHub…'));
                    if (await creation.connect(open, interaction)) focus = submit;
                    if (open()) report('');
                    return;
                }
                confirmedDraft = {name: title, format: 'folder', git: creation.draft(title)};
                focus = creation.review(confirmedDraft.git, review);
                return;
            }
            const request: SaveAsRequest = confirmedDraft ?? (savingFolder() ? {name: title, format: 'folder'} :
                {name: title, format: format.value === 'embedded' ? 'embedded' : 'current'});
            const result = await save(request, open, controller.signal);
            if (!open()) return;
            if (result === true) dismiss();
            else if (result && publication) {
                task = result;
                confirmedDraft = null;
                refreshTask();
                refresh();
                await advance();
            }
        } catch (error) {
            if (open() && publication && (task || confirmedDraft || selectedGitHub())) {
                const entries = await loadPending().catch(() => []);
                if (!open()) return;
                if (task) {
                    task = entries.find(entry => entry.operationId === task.operationId) ?? null;
                    candidate = null;
                    if ((error as {code?: string})?.code === 'directoryPermission') needsAccess = true;
                    refreshTask();
                }
                report(showError(error));
            } else if (open()) report(error instanceof Error ? error.message : String(error));
        } finally {
            device.replaceChildren();
            busy = false;
            if (open()) {refresh(); focus?.focus();}
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
    view.append(explanation, dialogActions(document, dialogAction(button, 'confirm')));
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
    const actions = dialogActions(document, dialogAction(done, 'close'), dialogAction(apply, 'confirm'));
    form.append(entries, status, actions);
    if (add) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = ja ? '機能拡張の追加' : 'Add Extension';
        button.onclick = () => {close(); add();};
        actions.prepend(button);
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
