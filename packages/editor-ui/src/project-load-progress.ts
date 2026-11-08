export type ProjectLoadPhase = 'opening' | 'payloads' | 'archive' | 'project' |
    'assets' | 'extensions' | 'approval' | 'finishing';

interface Step {
    phase: ProjectLoadPhase;
    time: number;
    elapsed: number;
}
interface Progress {
    current: Step;
    previous: Step[];
    assets?: {finished: number; total: number};
}
type Report = (phase: ProjectLoadPhase, assets?: Progress['assets']) => void;
interface Load {
    report: Report;
    progress: Progress;
}
interface Store {
    active?: Load;
    invoking?: Load;
    listeners: Set<() => void>;
}
const stores = new WeakMap<object, Store>();

function storeFor(vm: object) {
    let store = stores.get(vm);
    if (!store) {
        store = {listeners: new Set()};
        stores.set(vm, store);
    }
    return store;
}

function notify(store: Store) {
    for (const listener of store.listeners) {
        try { listener(); } catch { /* Presentation must not change the load result. */ }
    }
}

export function beginProjectLoad(vm: object, input: unknown) {
    // ZIP bytes are the input shared by the editor's local and URL SB3 entry points.
    const bytes = input instanceof ArrayBuffer ? new Uint8Array(input, 0, Math.min(input.byteLength, 2)) : input;
    if (!(bytes instanceof Uint8Array) || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return;

    const store = storeFor(vm);
    const startedAt = Date.now();
    const start = performance.now();
    let finished = false;
    const load: Load = {
        progress: {current: {phase: 'opening', time: startedAt, elapsed: 0}, previous: []},
        report(phase, assets) {
            if (finished) return;
            const {current, previous, assets: priorAssets} = load.progress;
            if (current.phase !== phase) {
                const elapsed = performance.now() - start;
                load.progress = {current: {phase, elapsed, time: startedAt + elapsed}, previous: [...previous, current], assets};
            } else if (assets && (assets.finished !== priorAssets?.finished || assets.total !== priorAssets?.total)) {
                load.progress = {...load.progress, assets};
            } else if (store.active === load) {
                return;
            }
            store.active = load;
            notify(store);
        }
    };
    if (!store.active) load.report('opening');
    return {
        invoke<T>(run: () => T) {
            const previous = store.invoking;
            store.invoking = load;
            try { return run(); } finally { store.invoking = previous; }
        },
        finish() {
            finished = true;
            if (store.active !== load) return;
            store.active = undefined;
            notify(store);
        }
    };
}

// Capture the calling load before the VM bridge enters its asynchronous queue.
export const captureProjectLoad = (vm: object) => stores.get(vm)?.invoking?.report;
export const projectLoadSnapshot = (vm: object) => stores.get(vm)?.active?.progress;
export function subscribeProjectLoadProgress(vm: object, listener: () => void) {
    const {listeners} = storeFor(vm);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export function reportProjectAssets(vm: object, finished: number, total: number) {
    const load = stores.get(vm)?.active;
    const phase = load?.progress.current.phase;
    if (total > 0 && (phase === 'opening' || phase === 'project' || phase === 'assets')) {
        load.report('assets', {finished, total});
    }
}

export function reportProjectFinishing(vm: object) {
    stores.get(vm)?.active?.report('finishing');
}

export async function duringProjectLoadApproval<T>(vm: object, ask: () => T): Promise<Awaited<T>> {
    const store = stores.get(vm);
    const load = store?.active;
    if (!load) return await ask();
    const {current, assets} = load.progress;
    if (current.phase === 'approval') return await ask();
    load.report('approval');
    try {
        return await ask();
    } finally {
        if (store.active === load && load.progress.current.phase === 'approval') {
            load.report(current.phase, assets);
        }
    }
}
