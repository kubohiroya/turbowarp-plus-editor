/**
 * The Editor's answer to `@kubohiroya/turbowarp-app-shell`'s runtime controls dock.
 *
 * A packaged player has no toolbar, so app-shell builds a floating dock of its own. The Editor
 * supplies a controls area in its menu bar. app-shell shares a dock through a symbol on the
 * document so an independently bundled copy can use the Editor's controls.
 *
 * Nothing here knows about any particular extension. `@kubohiroya/turbowarp-camera-source` reaches
 * this through app-shell, as would anything else that registers a control.
 */

/** app-shell's sharing point. The version is part of the key, so a v2 would not collide. */
const DOCK_REGISTRY = Symbol.for('@kubohiroya/turbowarp-app-shell/runtime-controls-dock/v1');

/**
 * Wrap a stage controls service in the dock shape app-shell consumers expect.
 * @param {object} service The stage controls service for one VM.
 * @returns {object} The dock.
 */
export const createControlsDock = service => ({
    stageControls: service.api,
    placePanel: element => service.placePanel(element),
    subscribe: listener => service.subscribe(listener),
    // The Editor's bar is fixed in place, so the parts of a floating dock's state that describe
    // where it sits are reported as settled rather than left undefined.
    getSnapshot: () => ({
        edge: 'top',
        autoHide: false,
        expanded: service.snapshot().some(control => control.expanded),
        count: service.snapshot().filter(control => control.visible).length
    }),
    dispose: () => service.clear()
});

/**
 * Install the dock for this document, unless one is already there.
 *
 * Leaving an existing dock alone matters: app-shell creates one on first use, and replacing it
 * would strand the controls already registered with it. Returning a disposer that only removes
 * what it installed keeps that true in both directions.
 * @param {Document} document The document the dock is shared on.
 * @param {object} service The stage controls service to answer with.
 * @returns {{dispose(): void}} Removes this dock, if it was the one installed.
 */
export const installControlsDock = (document, service) => {
    if (document[DOCK_REGISTRY]) return {dispose () {}};
    const dock = createControlsDock(service);
    document[DOCK_REGISTRY] = dock;
    return {
        dispose () {
            if (document[DOCK_REGISTRY] === dock) delete document[DOCK_REGISTRY];
        }
    };
};
