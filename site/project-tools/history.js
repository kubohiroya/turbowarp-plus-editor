const KEY = 'tw-plus-project-author-history-v1';
const clean = values => Array.isArray(values) ? [...new Set(values.filter(value =>
    typeof value === 'string' && value.trim()).map(value => value.trim()))].slice(0, 5) : [];

/** A browser-local history; storage denial must not prevent applying project properties. */
export const createAuthorHistory = storage => {
    let value = {names: [], contacts: []};
    try {
        const saved = JSON.parse(storage?.getItem(KEY) || '{}');
        value = {names: clean(saved.names), contacts: clean(saved.contacts)};
    } catch (error) { /* Storage can be unavailable or contain obsolete data. */ }
    return {
        snapshot: () => ({names: [...value.names], contacts: [...value.contacts]}),
        remember (name, contact) {
            value = {names: clean([name, ...value.names]), contacts: clean([contact, ...value.contacts])};
            try { storage?.setItem(KEY, JSON.stringify(value)); } catch (error) { /* Keep an in-memory history. */ }
        }
    };
};
