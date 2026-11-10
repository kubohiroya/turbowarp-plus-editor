/**
 * The stage controls an extension registered, which this distribution owns.
 *
 * The distribution's view subscribes to the service and is placed in the GUI's optional slot.
 * Extensions describe controls; the view owns their markup, styling and DOM lifetime.
 *
 * One service per VM, because two callers need the same one. The controls bar reads the snapshot
 * and `Scratch.gui.stageControls` hands the API to extensions: if those were different services, a
 * control registered through the API would never appear in the bar.
 */

interface StageControlOptions {
    id: string;
    label: string;
    text?: string;
    icon?: string;
    onClick(): void;
}
interface StageControl extends Required<StageControlOptions> {
    visible: boolean;
    expanded: boolean;
    element: HTMLButtonElement | null;
    ref(element: HTMLButtonElement | null): void;
}

interface RecordButton {
    element: HTMLElement;
    idleText: string;
}

const services = new WeakMap<object, ReturnType<typeof createStageControlsService>>();

export const createStageControlsService = () => {
    const entries = new Map<string, StageControl>();
    const listeners = new Set<() => void>();
    const notify = () => listeners.forEach(listener => listener());
    const api = Object.freeze({
        addButton ({id, label, text = '', icon = '↻', onClick}: StageControlOptions) {
            if (typeof id !== 'string' || !id || typeof label !== 'string' || !label ||
                typeof onClick !== 'function' || typeof text !== 'string' ||
                typeof icon !== 'string') throw new TypeError('Invalid stage control');
            const entry: StageControl = {
                id, label, text, icon, onClick, visible: false, expanded: false, element: null,
                ref(element) {entry.element = element;}
            };
            entries.set(id, entry);
            notify();
            return Object.freeze({
                update (state: Partial<Pick<StageControl, 'label' | 'text' | 'visible' | 'expanded'>>) {
                    if (entries.get(id) !== entry) return;
                    for (const key of ['label', 'text'] as const) {
                        if (typeof state[key] === 'string') entry[key] = state[key];
                    }
                    for (const key of ['visible', 'expanded'] as const) {
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
    // What a control shows while it is expanded. The element belongs to whoever registered the
    // control; this only carries it to the host, which mounts it and nothing more.
    let panel: HTMLElement | null = null;
    // The editor add-ons belong to the VM across project loads.
    let debuggerButton: HTMLElement | null = null;
    let recordButton: RecordButton | null = null;
    return {
        api,
        setDebuggerButton (element: HTMLElement | null) {
            if (debuggerButton === element) return;
            debuggerButton = element;
            notify();
        },
        debuggerButton: () => debuggerButton,
        /**
         * The stage recorder add-on's control. The add-on keeps the element and writes its state
         * into the element's text; the view shows it as an icon and forwards clicks to it.
         * @param element The add-on's element, or null to remove the control.
         * @param idleText What the element reads while nothing is being recorded.
         */
        setRecordButton (element: HTMLElement | null, idleText = '') {
            if (recordButton?.element === element && (!element || recordButton.idleText === idleText)) return;
            recordButton = element ? {element, idleText} : null;
            notify();
        },
        recordButton: () => recordButton,
        placePanel (element: HTMLElement | null) {
            if (panel === element) return;
            panel = element || null;
            notify();
        },
        panel: () => panel,
        snapshot: () => Array.from(entries.values()).map(entry => ({...entry})),
        subscribe (listener: () => void) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        clear () {
            entries.clear();
            panel = null;
            notify();
        }
    };
};

const getStageControls = (vm: {on(event: string, listener: () => void): void}) => {
    if (!services.has(vm)) {
        const service = createStageControlsService();
        vm.on('PROJECT_LOADED', service.clear);
        services.set(vm, service);
    }
    return services.get(vm);
};

export default getStageControls;
