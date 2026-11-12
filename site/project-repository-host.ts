import {createProjectRepositoryWorkflow, creationError, repositoryCreationJournal}
    from '@kubohiroya/turbowarp-plus-editor-ui/project-repository-creation';
import type {CreationInteraction, RepositoryCreationInspection, RepositoryCreationProvider, RepositoryDeviceCode, RepositoryReceipt}
    from '@kubohiroya/turbowarp-plus-editor-ui/project-repository-creation';
import type {GitHubCreationAccount, GitHubRepositoryDraft} from '@kubohiroya/turbowarp-plus-editor-ui/project-file-dialogs';
import type {GitAuthProvider, GitProxyConnection, GitProxySession} from '@kubohiroya/turbowarp-plus-editor-auth';

type Author = {name: string; email: string};
type Grant = {scope: 'repository-creation'; connection: GitProxyConnection; account: {login: string}; bearer: string;
    expiresAt: number};
type Session = Grant & GitHubCreationAccount;
type Intent = Parameters<RepositoryCreationProvider<Session>['create']>[1];
type WriteGrant = {remote: string; repositoryId: number; session: GitProxySession};
type Target = Omit<WriteGrant, 'session'>;
type Cloudflare = {bffOrigin: string; proxyOrigin: string};
type SeedFile = {path: string; bytes: Uint8Array};
type DiskRepository = Target & {directory: FileSystemDirectoryHandle; operationId: string; signal: AbortSignal};

export interface DesktopRepositoryCreation {
    getConnection(): Promise<GitProxyConnection>;
    begin(): Promise<RepositoryDeviceCode>;
    finish(): Promise<Grant | null>;
    getGrant(): Promise<Grant | null>;
    authorizeInitialPush(operationId: string, repositoryId: number): Promise<WriteGrant | null>;
    revokeInitialPush?(operationId: string, repositoryId: number, bearer: string): Promise<void>;
    inspectCreation?(operationId: string): Promise<RepositoryCreationInspection>;
    inspectUnknown(operationId: string): Promise<RepositoryReceipt | null>;
    adoptUnknown(operationId: string, repositoryId: number): Promise<RepositoryReceipt | null>;
    disconnect(): Promise<void>;
}

interface CreationClient {
    connectForCreation(signal: AbortSignal): Promise<Session | null>;
    createRepository: RepositoryCreationProvider<Session>['create'];
    setRepositoryTopics: RepositoryCreationProvider<Session>['topics'];
    inspectCreation?: RepositoryCreationProvider<Session>['inspect'];
    inspectUnknown?(session: Session, operationId: string, signal: AbortSignal): Promise<RepositoryReceipt | null>;
    adoptUnknown?: RepositoryCreationProvider<Session>['adopt'];
}

declare const __TW_PLUS_CREATE_REPOSITORY_CLIENT__: (options: {connection: GitProxyConnection;
    authorize(signal?: AbortSignal): Promise<Grant | null>}) => CreationClient;
declare const __TW_PLUS_CREATE_CLOUDFLARE_REPOSITORY_AUTH__: (options: {bffOrigin: string;
    openAuthorization(url: string): void}) => {connection: GitProxyConnection; authorize(signal?: AbortSignal): Promise<Grant | null>;
        disconnect(): Promise<void>};
declare const __TW_PLUS_CREATE_CLOUDFLARE_GIT_AUTH__: (options: Cloudflare & Target & {write: true;
    openAuthorization(url: string): void}) => GitAuthProvider;
declare const __TW_PLUS_COMPOSE_REPOSITORY_SEED__: (project: ReadonlyMap<string, Uint8Array>, metadata: {
    title: string; description: string; language: 'ja' | 'en'; license?: {name: string; text: string};
}, toolchainVersion: string) => ReadonlyMap<string, Uint8Array>;
declare const __TW_PLUS_SB3_TOOLCHAIN_VERSION__: string;
declare const __TW_PLUS_REPOSITORY_LICENSES__: readonly {id: string; text: string}[];
declare const __TW_PLUS_PREPARE_INITIAL_REPOSITORY__: (options: DiskRepository & {
    files: readonly SeedFile[]; author: Author; timestamp: number}) => Promise<{oid: string}>;
declare const __TW_PLUS_PUSH_INITIAL_REPOSITORY__: (options: DiskRepository & {
    oid: string; getWriteGrant(): Promise<WriteGrant | null>}) => Promise<{oid: string}>;

type CreationWindow = Window & {showDirectoryPicker?(options: {id: string; mode: 'readwrite'}):
    Promise<FileSystemDirectoryHandle>};

function reserveAuthorization(view: Window) {
    const popup = view.open('about:blank', '_blank');
    if (!popup) throw creationError('popupBlocked');
    popup.opener = null;
    return {
        open(url: string) {
            if (popup.closed) throw creationError('denied');
            popup.location.replace(url);
        },
        close: () => popup.close(),
        closed: () => popup.closed
    };
}

function delay(view: Window, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const stop = () => {view.clearTimeout(timer); reject(signal.reason);};
        const timer = view.setTimeout(() => {signal.removeEventListener('abort', stop); resolve();}, 1500);
        signal.addEventListener('abort', stop, {once: true});
        if (signal.aborted) stop();
    });
}

function desktopProvider(bridge: DesktopRepositoryCreation) {
    let client: Promise<CreationClient>;
    let interaction: CreationInteraction;
    const getClient = () => client ??= bridge.getConnection().then(connection => __TW_PLUS_CREATE_REPOSITORY_CLIENT__({
        connection,
        async authorize(signal) {
            const existing = await bridge.getGrant();
            signal?.throwIfAborted();
            if (existing) return existing;
            const abort = () => {void bridge.disconnect().catch(() => {});};
            signal?.addEventListener('abort', abort, {once: true});
            try {
                const code = await bridge.begin();
                signal?.throwIfAborted();
                if (code.verificationUri !== 'https://github.com/login/device' || !/^[A-Za-z0-9-]{4,20}$/u.test(code.userCode) ||
                    !Number.isFinite(code.expiresAt) || code.expiresAt <= Date.now()) throw creationError('denied');
                interaction.deviceCode(code);
                const grant = await bridge.finish();
                signal?.throwIfAborted();
                return grant;
            } finally {
                signal?.removeEventListener('abort', abort);
            }
        }
    })).catch(error => {client = undefined; throw error;});
    return {
        mode: 'desktop',
        connect(controls) {
            interaction = controls;
            return getClient().then(creation => creation.connectForCreation(controls.signal));
        },
        async create(session, intent, signal) {return (await getClient()).createRepository(session, intent, signal);},
        async topics(session, repository, signal) {return (await getClient()).setRepositoryTopics(session, repository, signal);},
        async inspect(_session, operationId) {
            if (bridge.inspectCreation) return bridge.inspectCreation(operationId);
            return {status: 'unknown', candidate: await bridge.inspectUnknown(operationId)};
        },
        adopt: (_session, intent, id) => bridge.adoptUnknown(intent.operationId, id)
    } satisfies RepositoryCreationProvider<Session>;
}

function cloudflareProvider(view: Window, {bffOrigin}: Cloudflare) {
    let popup: ReturnType<typeof reserveAuthorization>;
    let session: Session | null = null;
    const auth = __TW_PLUS_CREATE_CLOUDFLARE_REPOSITORY_AUTH__({bffOrigin, openAuthorization: url => popup.open(url)});
    const client = __TW_PLUS_CREATE_REPOSITORY_CLIENT__({connection: auth.connection, authorize: auth.authorize});
    return {
        mode: 'cloudflare',
        async connect({signal}) {
            signal.throwIfAborted();
            if (session?.expiresAt > Date.now()) return session;
            if (popup) throw creationError('denied');
            popup = reserveAuthorization(view);
            try {
                session = await client.connectForCreation(signal);
                return session;
            } catch (error) {
                void auth.disconnect().catch(() => {});
                throw error;
            } finally {
                popup.close();
                popup = undefined;
            }
        },
        create: client.createRepository,
        topics: client.setRepositoryTopics,
        async inspect(session, operationId, signal) {
            if (client.inspectCreation) return client.inspectCreation(session, operationId, signal);
            return {status: 'unknown', candidate: await client.inspectUnknown?.(session, operationId, signal) ?? null};
        },
        adopt: client.adoptUnknown
    } satisfies RepositoryCreationProvider<Session>;
}

export function bindProjectRepositoryCreation({view, desktop, cloudflare, locale, author, prepareSource, openProject}: {
    view: CreationWindow;
    desktop?: DesktopRepositoryCreation;
    cloudflare?: Cloudflare;
    locale: string;
    author(): Promise<Author | undefined>;
    prepareSource(serialize: () => Promise<Uint8Array>, current: () => boolean, title: string): Promise<ReadonlyMap<string, Uint8Array>>;
    openProject(directory: FileSystemDirectoryHandle, root: FileSystemDirectoryHandle): Promise<boolean>;
}) {
    if (!view.indexedDB || !view.navigator.locks || !view.showDirectoryPicker || !view.crypto?.subtle ||
        typeof __TW_PLUS_CREATE_REPOSITORY_CLIENT__ !== 'function' || typeof __TW_PLUS_COMPOSE_REPOSITORY_SEED__ !== 'function' ||
        typeof __TW_PLUS_PREPARE_INITIAL_REPOSITORY__ !== 'function' || typeof __TW_PLUS_PUSH_INITIAL_REPOSITORY__ !== 'function' ||
        typeof __TW_PLUS_SB3_TOOLCHAIN_VERSION__ !== 'string') return undefined;
    if (!desktop && (!cloudflare || typeof __TW_PLUS_CREATE_CLOUDFLARE_REPOSITORY_AUTH__ !== 'function' ||
        typeof __TW_PLUS_CREATE_CLOUDFLARE_GIT_AUTH__ !== 'function')) return undefined;
    const provider = desktop ? desktopProvider(desktop) : cloudflareProvider(view, cloudflare);
    const licenses = typeof __TW_PLUS_REPOSITORY_LICENSES__ === 'undefined' ? [] : __TW_PLUS_REPOSITORY_LICENSES__;
    const pickDirectory = async () => {
        try {
            return await view.showDirectoryPicker({id: 'turbowarp-plus-new-git-repository', mode: 'readwrite'});
        } catch (error) {
            if ((error as DOMException).name === 'AbortError') return null;
            throw error;
        }
    };
    const workflow = createProjectRepositoryWorkflow({
        provider,
        journal: repositoryCreationJournal(view.indexedDB),
        exclusive: (id, run) => view.navigator.locks.request('tw-plus-github-create:' + id, run),
        prepare: ({repository, ...input}) => __TW_PLUS_PREPARE_INITIAL_REPOSITORY__({...input,
            remote: repository.remote, repositoryId: repository.id}),
        async startWrite(progress, interaction) {
            const {repository, account, operationId} = progress;
            const {signal} = interaction;
            if (!repository) throw creationError('pendingRepository');
            const {remote, id: repositoryId} = repository;
            if (desktop) {
                const session = await provider.connect(interaction);
                if (session?.account.login.toLowerCase() !== account.toLowerCase()) throw creationError('denied');
                signal.throwIfAborted();
                const grant = await desktop.authorizeInitialPush(operationId, repositoryId);
                if (!grant) return null;
                const revoke = async () => {await desktop.revokeInitialPush?.(operationId, repositoryId, grant.session.bearer);};
                if (signal.aborted) {
                    void revoke().catch(() => {});
                    signal.throwIfAborted();
                }
                return {grant, revoke};
            }
            const popup = reserveAuthorization(view);
            const auth = __TW_PLUS_CREATE_CLOUDFLARE_GIT_AUTH__({...cloudflare, remote, repositoryId, write: true,
                openAuthorization: popup.open});
            const lifetime = AbortSignal.any([signal, AbortSignal.timeout(10 * 60_000)]);
            let granted = false;
            try {
                await auth.connect(lifetime);
                while (true) {
                    lifetime.throwIfAborted();
                    const session = await auth.getSession();
                    lifetime.throwIfAborted();
                    if (session) {
                        if (session.account.login.toLowerCase() !== account.toLowerCase()) throw creationError('denied');
                        granted = true;
                        return {grant: {remote, repositoryId, session}, revoke: () => auth.disconnect()};
                    }
                    if (popup.closed()) break;
                    if ((await auth.getState()).status !== 'connecting') break;
                    await delay(view, lifetime);
                }
                return null;
            } finally {
                popup.close();
                if (!granted) void auth.disconnect().catch(() => {});
            }
        },
        releaseWrite: ({revoke}) => revoke(),
        async push({repository, grant: {grant}, ...input}) {
            await __TW_PLUS_PUSH_INITIAL_REPOSITORY__({...input, remote: repository.remote, repositoryId: repository.id,
                getWriteGrant: async () => grant});
        },
        openProject,
        pickDirectory
    });
    return {
        ...workflow,
        licenses: licenses.map(({id}) => ({id, label: id})),
        async start(draft: GitHubRepositoryDraft, serialize: () => Promise<Uint8Array>, current: () => boolean, signal: AbortSignal) {
            const directory = await pickDirectory();
            if (!directory || !current()) return null;
            for await (const _entry of (directory as FileSystemDirectoryHandle & {values(): AsyncIterable<FileSystemHandle>}).values())
                throw creationError('directoryNotEmpty');
            const project = await prepareSource(serialize, current, draft.title).catch(error => {
                if ((error as DOMException).name === 'AbortError') return null;
                throw error;
            });
            if (!project || !current()) return null;
            const selected = licenses.find(({id}) => id === draft.license);
            if (draft.license && !selected) throw creationError('invalidRequest');
            const seed = __TW_PLUS_COMPOSE_REPOSITORY_SEED__(project, {title: draft.title, description: draft.description,
                language: locale.startsWith('ja') ? 'ja' : 'en', license: selected && {name: selected.id, text: selected.text}},
            __TW_PLUS_SB3_TOOLCHAIN_VERSION__);
            const identity = await author() ?? {name: draft.account, email: draft.account + '@users.noreply.github.com'};
            if (!current()) return null;
            return workflow.start({directory, draft, author: identity, files: [...seed].map(([path, bytes]) => ({path, bytes})), signal});
        }
    };
}
