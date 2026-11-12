export type PublicationStatus = 'queued' | 'pushed' | 'creatingIssue' | 'issueReady' | 'creatingPull' |
    'waiting' | 'ready' | 'merging' | 'merged' | 'done';

export type PublicationIssue = {number: number; closeAfterMerge: boolean} |
    {title: string; body: string; closeAfterMerge: boolean};

export interface PublicationTarget {
    id: string;
    remote: string;
    repositoryId: number;
}

export interface PublicationDraft {
    base: string;
    title: string;
    body: string;
    goal: 'pr' | 'merge';
    issue?: PublicationIssue;
}

export interface PublicationIntent extends PublicationTarget, PublicationDraft {
    head: string;
    baseOid: string;
    commitOid: string;
}

export interface PublicationJob {
    intent: PublicationIntent;
    status: PublicationStatus;
    issueNumber?: number;
    pullNumber?: number;
    mergeOid?: string;
    pause?: string;
    awaitingPush?: boolean;
}

export interface DesktopPublicationBridge {
    capabilities(): Promise<readonly string[]>;
    repository(remote: string): Promise<{repositoryId: number}>;
    enqueue(intent: PublicationIntent): Promise<PublicationJob | null>;
    get(target: PublicationTarget): Promise<PublicationJob | null>;
    advance(target: PublicationTarget & {retryRejectedMerge?: boolean}): Promise<PublicationJob>;
}

export interface PublicationRepository {
    remote: string;
    defaultBranch: string | null;
    branches: readonly {name: string; oid: string}[];
}

export interface PublicationCommit {
    id: string;
    message: string;
    commitOid: string;
}

export interface PublicationProgress {
    job: PublicationJob | null;
    running: boolean;
    error?: unknown;
}

export interface PreparedPublication extends PublicationRepository {
    capabilities: readonly string[];
    head: string;
    progress(): PublicationProgress;
    subscribe(listener: () => void): () => void;
    submit(draft: PublicationDraft, current: () => boolean): Promise<boolean>;
    resume(retryRejectedMerge?: boolean): void;
}

export interface ProjectPublicationPort {
    prepare(commit: PublicationCommit): Promise<PreparedPublication>;
}

const canonicalRemote = (value: string) => value.toLowerCase().replace(/(?:\.git)?$/u, '.git');
const wait = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));

/** Drive host checkpoints independently of the dialog; a reopened dialog reads the host's durable job. */
export function createProjectPublication({bridge, inspect, push, guard, delay = wait}: {
    bridge: DesktopPublicationBridge;
    inspect(): Promise<PublicationRepository>;
    push(options: {remote: string; oid: string; ref: string}): Promise<void>;
    guard(): void;
    delay?(milliseconds: number): Promise<void>;
}): ProjectPublicationPort {
    type Entry = {state: PublicationProgress; listeners: Set<() => void>};
    const entries = new Map<string, Entry>();
    return {
        async prepare(commit) {
            guard();
            const [capabilities, repository] = await Promise.all([bridge.capabilities(), inspect()]);
            const {repositoryId} = await bridge.repository(repository.remote);
            const target = {id: commit.id, remote: repository.remote, repositoryId};
            const head = 'tw-plus/pr-' + commit.id;
            const key = repositoryId + ':' + commit.id;
            const entry = entries.get(key) ?? {state: {job: null, running: false}, listeners: new Set<() => void>()};
            entries.set(key, entry);
            const update = (state: PublicationProgress) => {
                entry.state = state;
                for (const listener of entry.listeners) listener();
            };
            const check = (job: PublicationJob) => {
                guard();
                if (job.intent.id !== target.id || job.intent.repositoryId !== target.repositoryId ||
                    canonicalRemote(job.intent.remote) !== canonicalRemote(target.remote) ||
                    job.intent.head !== head || job.intent.commitOid !== commit.commitOid) {
                    throw new Error('PUBLICATION_CHANGED');
                }
                return job;
            };
            if (!entry.state.running) {
                const before = entry.state;
                const saved = await bridge.get(target);
                guard();
                if (entry.state === before) update({job: saved ? check(saved) : null, running: false});
            }

            async function drive(retryRejectedMerge: boolean) {
                let pollInterval = 30_000;
                let pushed = false;
                let retry = retryRejectedMerge;
                for (;;) {
                    guard();
                    let job = check(await bridge.advance({...target, retryRejectedMerge: retry}));
                    retry = false;
                    update({job, running: true});
                    if (job.awaitingPush) {
                        if (pushed) throw new Error('PUSH_UNCONFIRMED');
                        pushed = true;
                        try {
                            await push({remote: target.remote, oid: job.intent.commitOid, ref: 'refs/heads/' + job.intent.head});
                            continue;
                        } catch (error) {
                            guard();
                            // A lost push response may still leave the expected ref on GitHub.
                            job = check(await bridge.advance(target));
                            if (job.awaitingPush) throw error;
                            update({job, running: true});
                        }
                    }
                    if (job.status === 'done' || job.pause) return;
                    if (job.status === 'waiting' || job.status === 'merging') {
                        await delay(pollInterval);
                        pollInterval = Math.min(300_000, pollInterval * 2);
                    } else pollInterval = 30_000;
                }
            }

            function resume(retryRejectedMerge = false) {
                if (entry.state.running || !entry.state.job || entry.state.job.status === 'done') return;
                update({job: entry.state.job, running: true});
                void drive(retryRejectedMerge).then(
                    () => update({job: entry.state.job, running: false}),
                    error => update({job: entry.state.job, running: false, error})
                );
            }

            return {
                ...repository, capabilities, head,
                progress: () => entry.state,
                subscribe(listener) {
                    entry.listeners.add(listener);
                    return () => {entry.listeners.delete(listener);};
                },
                async submit(draft, current) {
                    guard();
                    if (!current()) return false;
                    const base = repository.branches.find(branch => branch.name === draft.base);
                    if (!base || base.name === head || base.oid === commit.commitOid) throw new Error('PUBLICATION_BASE');
                    const job = await bridge.enqueue({...draft, ...target, head, baseOid: base.oid, commitOid: commit.commitOid});
                    if (!job) return false;
                    const approved = check(job);
                    if (!entry.state.running) {
                        update({job: approved, running: false});
                        resume();
                    }
                    return true;
                },
                resume
            };
        }
    };
}
