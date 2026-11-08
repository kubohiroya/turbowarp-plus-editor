const active = new WeakMap<Document, {users: number; style: HTMLStyleElement}>();
const inputWaits = new WeakMap<Document, number>();

function holdCursor(document: Document) {
    let state = active.get(document);
    if (!state) {
        const style = document.createElement('style');
        style.dataset.twPlusWaitCursor = '';
        style.textContent = ':root, :root body, :root body * { cursor: wait !important; }';
        if (inputWaits.has(document)) style.media = 'not all';
        document.head.append(style);
        state = {users: 0, style};
        active.set(document, state);
    }
    state.users++;
    return () => {
        if (--state.users) return;
        state.style.remove();
        active.delete(document);
    };
}

function afterPaint(document: Document) {
    const view = document.defaultView;
    if (!view?.requestAnimationFrame || document.hidden) return Promise.resolve();
    // The first callback still runs before the cursor change can be painted.
    return new Promise<void>(resolve => {
        let frame = view.requestAnimationFrame(() => {
            frame = view.requestAnimationFrame(finish);
        });
        const timeout = view.setTimeout(finish, 100);
        function finish() {
            view.cancelAnimationFrame(frame);
            view.clearTimeout(timeout);
            resolve();
        }
    });
}

/** Give the browser a frame before starting work that may block its main thread. */
export async function withWaitCursor<T>(documents: Iterable<Document>, run: () => T): Promise<Awaited<T>> {
    const visible = [...new Set(documents)].filter(document => document?.head && document.defaultView && !document.defaultView.closed);
    const release = visible.map(holdCursor);
    try {
        await Promise.all(visible.map(afterPaint));
        return await run();
    } finally {
        release.forEach(done => done());
    }
}

/** Temporarily restore the normal cursor while an operation needs an answer. */
export async function withoutWaitCursor<T>(document: Document | undefined, ask: () => T): Promise<Awaited<T>> {
    if (!document) return await ask();
    inputWaits.set(document, (inputWaits.get(document) ?? 0) + 1);
    const waiting = active.get(document);
    if (waiting) waiting.style.media = 'not all';
    try {
        return await ask();
    } finally {
        const remaining = inputWaits.get(document) - 1;
        if (remaining) inputWaits.set(document, remaining);
        else {
            inputWaits.delete(document);
            const resumed = active.get(document);
            if (resumed) {
                resumed.style.media = '';
                await afterPaint(document);
            }
        }
    }
}

interface Target {
    id: string;
    blocks?: {_blocks?: Record<string, unknown>};
}
interface TargetSwitchVM {
    editingTarget?: Target;
    runtime: {getTargetById(id: string): Target | undefined; getTargetForStage(): Target | undefined};
}

// VM target changes rebuild the Blockly workspace synchronously. Large workspaces
// need a paint before that rebuild. Smaller switches stay in the input event.
const largeWorkspace = (target: Target | undefined) => Object.keys(target?.blocks?._blocks ?? {}).length >= 200;

export function createTargetSwitchFeedback(vm: TargetSwitchVM, document: Document) {
    let request = 0;
    let running: Target | undefined;
    return {
        cancel() { request++; },
        select(id: string | undefined, run: () => void, source = document) {
            const token = ++request;
            const previous = vm.editingTarget;
            const target = id === undefined ? vm.runtime.getTargetForStage() : vm.runtime.getTargetById(id);
            if (!target || target === previous || target === running || !largeWorkspace(target)) {
                run();
                return;
            }
            void withWaitCursor([source, document], async () => {
                if (request !== token || vm.editingTarget !== previous || vm.runtime.getTargetById(target.id) !== target) return;
                running = target;
                try { run(); } finally { running = undefined; }
                await afterPaint(document);
            }).catch(error => globalThis.reportError(error));
        }
    };
}
