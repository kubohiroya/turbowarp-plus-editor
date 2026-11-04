export interface SurfaceConnection<T> {
    ready: Promise<T>;
    disconnected: AbortSignal;
    close(): void;
}

export interface SurfaceHost<Request, Target> {
    // Call synchronously from the initiating user gesture.
    open(request: Request): SurfaceConnection<Target> | null;
}

export type SurfaceState<T> =
    | {kind: 'docked'; reason?: 'returned' | 'blocked' | 'failed' | 'disconnected'}
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
        try {
            onState({kind: 'docked', reason});
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
