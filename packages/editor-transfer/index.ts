export const transferMime = 'application/x-turbowarp-editor-transfer';

export interface DropTarget {
    session: string;
    id: string;
}

export interface TransferReference {
    version: 1;
    session: string;
    id: string;
    kind: string;
    effect: 'copy';
}

export type TransferResult = 'applied' | 'rejected' | 'cancelled' | 'failed';

type Reader<T> = (signal: AbortSignal) => T | Promise<T>;
type Apply<T> = (target: Readonly<DropTarget>, payload: T) => boolean;

function isReference(value: unknown): value is TransferReference {
    if (!value || typeof value !== 'object') return false;
    const ref = value as Partial<TransferReference>;
    return ref.version === 1 && ref.effect === 'copy' &&
        [ref.session, ref.id, ref.kind].every(field => typeof field === 'string' && field.length > 0 && field.length <= 128);
}

export function readReference(raw: string): TransferReference | null {
    if (!raw || raw.length > 1024) return null;
    try {
        const value: unknown = JSON.parse(raw);
        return isReference(value) ? value : null;
    } catch {
        return null;
    }
}

export function createTransferSession<T>(session: string, options: {
    lifetimeMs?: number;
    now?: () => number;
} = {}) {
    const {lifetimeMs = 60_000, now = Date.now} = options;
    const available = new Map<string, {kind: string; expires: number; read: Reader<T>}>();
    const reading = new Map<string, AbortController>();
    let closed = false;

    function offer(kind: string, read: Reader<T>): TransferReference {
        if (closed) throw new Error('Transfer session closed');
        const time = now();
        for (const [id, entry] of available) {
            if (entry.expires <= time) available.delete(id);
        }
        const id = crypto.randomUUID();
        const reference: TransferReference = {version: 1, session, id, kind, effect: 'copy'};
        if (!isReference(reference)) throw new Error('Invalid transfer kind or session');
        available.set(id, {kind, expires: time + lifetimeMs, read});
        return reference;
    }

    // dragend may run after drop starts; discard only a reference that has not been claimed.
    function discard(id: string) {
        available.delete(id);
    }

    function cancel(id: string) {
        discard(id);
        reading.get(id)?.abort();
    }

    async function receive(raw: string, destination: DropTarget, apply: Apply<T>): Promise<TransferResult> {
        const ref = readReference(raw);
        if (closed || !ref || ref.session !== session || destination.session !== session || !destination.id) {
            return 'rejected';
        }
        const entry = available.get(ref.id);
        if (!entry || ref.kind !== entry.kind) return 'rejected';
        available.delete(ref.id);
        if (entry.expires <= now()) return 'rejected';

        // Claim before the first await, and pin the drop target independently of UI selection.
        const target = Object.freeze({session, id: destination.id});
        const controller = new AbortController();
        reading.set(ref.id, controller);
        const aborted = Symbol('transfer aborted');
        let interrupt!: () => void;
        const cancellation = new Promise<typeof aborted>(resolve => {
            interrupt = () => resolve(aborted);
            controller.signal.addEventListener('abort', interrupt, {once: true});
        });
        try {
            const payload = await Promise.race([entry.read(controller.signal), cancellation]);
            if (payload === aborted || controller.signal.aborted) return 'cancelled';
            if (entry.expires <= now()) return 'rejected';
            return apply(target, payload) ? 'applied' : 'rejected';
        } catch {
            return controller.signal.aborted ? 'cancelled' : 'failed';
        } finally {
            controller.signal.removeEventListener('abort', interrupt);
            reading.delete(ref.id);
        }
    }

    function close() {
        closed = true;
        available.clear();
        for (const controller of reading.values()) controller.abort();
    }

    return {offer, receive, discard, cancel, close};
}
