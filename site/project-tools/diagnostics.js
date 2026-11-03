const text = value => value === undefined || value === null ? undefined : String(value).slice(0, 16384);

/** Bounded, in-memory load attempts. A failed attempt remains available after the editor returns to a new project. */
export const createProjectDiagnostics = ({now = () => new Date().toISOString()} = {}) => {
    const sessions = [];
    const listeners = new Set();
    let serial = 0;
    const notify = () => {
        for (const listener of listeners) { try { listener(); } catch (error) { /* Diagnostics must not affect execution. */ } }
    };
    const begin = (title = '') => {
        sessions.unshift({id: ++serial, title: text(title), startedAt: now(), phase: 'loading', events: [], extensions: []});
        sessions.splice(5); notify();
    };
    const current = () => { if (!sessions.length) begin(); return sessions[0]; };
    const api = {
        begin,
        record (event) {
            const session = current();
            const safe = {time: now()};
            for (const field of ['type', 'id', 'sha256', 'code', 'message', 'execution', 'attempt', 'attempts']) {
                const value = text(event[field]); if (value !== undefined) safe[field] = value;
            }
            if (Array.isArray(event.ids)) safe.ids = event.ids.map(text).slice(0, 200);
            if (event.source) safe.source = text(event.source.url || event.source.path);
            if (typeof event.cached === 'boolean') safe.cached = event.cached;
            session.events.push(safe); session.events.splice(0, Math.max(0, session.events.length - 50));
            notify();
        },
        describe (manifest) {
            current().extensions = (manifest?.extensions || []).slice(0, 200).map(spec => ({
                id: text(spec.id), source: text(spec.source?.url || spec.source?.path), execution: text(spec.execution),
                sha256: text(spec.sha256)}));
            notify();
        },
        finish (state, title = '') {
            const session = current(); session.phase = state.phase; session.title = text(title);
            if (state.phase === 'failed' && !session.events.some(event => event.type === 'project-error')) {
                api.record({type: 'project-error', code: state.code || 'LOAD_FAILED', message: state.message});
            }
            notify();
        },
        snapshot: () => JSON.parse(JSON.stringify(sessions)),
        subscribe (listener) { listeners.add(listener); return () => listeners.delete(listener); },
        dispose () { listeners.clear(); sessions.length = 0; }
    };
    return api;
};

export const diagnosticText = session => session ? JSON.stringify(session, null, 2) : '';
