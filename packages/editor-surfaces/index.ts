export interface SurfaceConnection<T> {
    ready: Promise<T>;
    disconnected: AbortSignal;
    close(): void;
}

export interface SurfaceHost<Request, Target> {
    // Call synchronously from the initiating user gesture.
    open(request: Request): SurfaceConnection<Target> | null;
}

// Hosts abort `disconnected` with one of these reasons so callers can tell a window the user
// closed from one that disappeared because the editor itself was closing or reloading.
export type DisconnectCause = 'child-closed' | 'parent-closed' | 'navigated' | 'peer-disconnected';
const disconnectCauses: readonly string[] = ['child-closed', 'parent-closed', 'navigated', 'peer-disconnected'];
export const disconnectCause = (signal: AbortSignal): DisconnectCause | undefined =>
    disconnectCauses.includes(signal.reason) ? signal.reason as DisconnectCause : undefined;

export type SurfaceState<T> =
    | {kind: 'docked'; reason?: 'returned' | 'blocked' | 'failed' | 'disconnected'; cause?: DisconnectCause}
    | {kind: 'opening'}
    | {kind: 'external'; target: T};

export function createSurface<Request, Target>(
    host: SurfaceHost<Request, Target>,
    onState: (state: SurfaceState<Target>) => void
) {
    let current: {connection: SurfaceConnection<Target>; disconnect: () => void} | undefined;

    function dock(reason: Extract<SurfaceState<Target>, {kind: 'docked'}>['reason'] = 'returned') {
        const active = current;
        if (!active) return;
        current = undefined;
        active.connection.disconnected.removeEventListener('abort', active.disconnect);
        const cause = reason === 'disconnected' ? disconnectCause(active.connection.disconnected) : undefined;
        try {
            onState(cause ? {kind: 'docked', reason, cause} : {kind: 'docked', reason});
        } finally {
            active.connection.close();
        }
    }

    function undock(request: Request) {
        if (current) return;
        let connection;
        try {
            connection = host.open(request);
        } catch {
            onState({kind: 'docked', reason: 'failed'});
            return;
        }
        if (!connection) {
            onState({kind: 'docked', reason: 'blocked'});
            return;
        }
        const disconnect = () => dock('disconnected');
        const active = {connection, disconnect};
        current = active;
        connection.disconnected.addEventListener('abort', disconnect, {once: true});
        connection.ready.then(target => {
            if (current !== active) return;
            try {
                onState({kind: 'external', target});
            } catch {
                dock('failed');
            }
        }, () => {
            if (current === active) dock('failed');
        });
        if (connection.disconnected.aborted) {
            disconnect();
        } else {
            onState({kind: 'opening'});
        }
    }

    return {undock, dock};
}

export type PendingEditSource = () => unknown;

// Views that hold edits or transfers outside the main document register a collector here.
// Saving, returning to the normal layout and quitting call `flush` first. A failed collector
// stays registered, so the caller can report the failure and retry without losing the edit.
export function createPendingEdits() {
    const sources = new Set<PendingEditSource>();
    return {
        register(source: PendingEditSource) {
            sources.add(source);
            return () => {sources.delete(source);};
        },
        get size() {return sources.size;},
        async flush({timeoutMs = 5000}: {timeoutMs?: number} = {}) {
            const results = await Promise.allSettled([...sources].map(source => new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Pending edits were not collected in time')), timeoutMs);
                Promise.resolve().then(source).then(resolve, reject).finally(() => clearTimeout(timer));
            })));
            const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
            if (errors.length) throw new AggregateError(errors, 'Pending edits in other windows could not be collected');
        }
    };
}

export const pendingSurfaceEdits = createPendingEdits();
export const flushPendingSurfaceEdits = (options?: {timeoutMs?: number}) => pendingSurfaceEdits.flush(options);

export interface RecoveryStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

const recoveryVersion = 1;
const validId = (id: unknown): id is string => typeof id === 'string' && /^[\w:.-]{1,64}$/.test(id);

// Remembers which panels were open in an external window when the editor closed. Browsers only
// open windows from a user gesture, so after a restart the panels stay docked and these ids mark
// the windows the user can reopen one at a time.
export function createSurfaceRecovery(storage: RecoveryStorage | null | undefined, {
    key = 'tw-plus:external-surfaces', graceMs = 1000,
    schedule = (run: () => void, ms: number) => setTimeout(run, ms) as unknown,
    cancel = (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>)
} = {}) {
    let stored: string[] = [];
    try {
        const value = JSON.parse(storage?.getItem(key) ?? 'null');
        if (value?.version === recoveryVersion && Array.isArray(value.ids)) stored = value.ids.filter(validId).slice(0, 32);
    } catch {
        // A damaged record only loses the reopen hints.
    }
    const open = new Set(stored);
    const lost = new Set(stored);
    const removals = new Map<string, unknown>();
    const listeners = new Set<() => void>();
    let closing = false;
    let version = 0;

    const changed = () => {
        version++;
        try {
            storage?.setItem(key, JSON.stringify({version: recoveryVersion, ids: [...open]}));
        } catch {
            // Storage can be full or disabled. The current session still works.
        }
        for (const listener of [...listeners]) listener();
    };
    const keep = (id: string) => {
        const removal = removals.get(id);
        if (removal === undefined) return;
        removals.delete(id);
        cancel(removal);
    };
    const forget = (id: string) => {
        keep(id);
        lost.delete(id);
        open.delete(id);
        changed();
    };

    return {
        lost: () => [...lost],
        isLost: (id: string) => lost.has(id),
        version: () => version,
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => {listeners.delete(listener);};
        },
        opened(id: string) {
            if (!validId(id)) return;
            keep(id);
            lost.delete(id);
            open.add(id);
            changed();
        },
        closed(id: string, cause?: DisconnectCause) {
            if (!validId(id) || !open.has(id)) return;
            // The editor is closing: keep the window so the user can reopen it after restart.
            if (cause === 'parent-closed' || closing) {
                closing = true;
                for (const pending of [...removals.keys()]) keep(pending);
                return;
            }
            if (cause !== 'child-closed') {
                forget(id);
                return;
            }
            // Quitting can close the child windows just before the editor. Forget a closed child
            // only when the editor survives the grace period.
            keep(id);
            removals.set(id, schedule(() => {
                removals.delete(id);
                if (!closing) forget(id);
            }, graceMs));
        },
        dismiss: forget
    };
}

export type SurfaceRecovery = ReturnType<typeof createSurfaceRecovery>;

// Connects a surface's state to the recovery record. Only external windows are recorded:
// the layout package already restores in-app windows.
export function recordSurface<T>(recovery: SurfaceRecovery | null | undefined, id: string, state: SurfaceState<T>,
    external: (target: T) => boolean) {
    if (!recovery) return;
    if (state.kind === 'external' && external(state.target)) recovery.opened(id);
    else if (state.kind === 'docked') recovery.closed(id, state.cause);
}
