/**
 * The stage controls an extension registered, which this distribution owns.
 *
 * The GUI fork asks for this through its integration socket and draws whatever the snapshot holds:
 * extensions describe controls, React owns their placement and DOM lifetime. The service came from
 * the fork's `src/lib/tw-stage-controls.js`; the behaviour is unchanged.
 *
 * One service per VM, because two callers need the same one. The controls bar reads the snapshot
 * and `Scratch.gui.stageControls` hands the API to extensions: if those were different services, a
 * control registered through the API would never appear in the bar.
 */

const services = new WeakMap();

export const createStageControlsService = () => {
    const entries = new Map();
    const listeners = new Set();
    const notify = () => listeners.forEach(listener => listener());
    const api = Object.freeze({
        addButton ({id, label, text = '', icon = '↻', onClick}) {
            if (typeof id !== 'string' || !id || typeof label !== 'string' || !label ||
                typeof onClick !== 'function' || typeof text !== 'string' ||
                typeof icon !== 'string') throw new TypeError('Invalid stage control');
            const entry = {id, label, text, icon, onClick, visible: false, expanded: false, element: null};
            entry.ref = element => {
                entry.element = element;
            };
            entries.set(id, entry);
            notify();
            return Object.freeze({
                update (state) {
                    if (entries.get(id) !== entry) return;
                    for (const key of ['label', 'text']) {
                        if (typeof state[key] === 'string') entry[key] = state[key];
                    }
                    for (const key of ['visible', 'expanded']) {
                        if (typeof state[key] === 'boolean') entry[key] = state[key];
                    }
                    notify();
                },
                focus () {
                    if (entries.get(id) === entry && entry.visible && entry.element) entry.element.focus();
                },
                dispose () {
                    if (entries.get(id) !== entry) return;
                    entries.delete(id);
                    notify();
                }
            });
        }
    });
    return {
        api,
        snapshot: () => Array.from(entries.values()).map(entry => ({...entry})),
        subscribe (listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        clear () {
            entries.clear();
            notify();
        }
    };
};

const getStageControls = vm => {
    if (!services.has(vm)) {
        const service = createStageControlsService();
        vm.on('PROJECT_LOADED', service.clear);
        services.set(vm, service);
    }
    return services.get(vm);
};

export default getStageControls;
