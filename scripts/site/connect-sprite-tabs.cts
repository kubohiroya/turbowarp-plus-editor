const path = require('node:path');

module.exports = (source: string) => {
    const toolbar = 'onToolbarSlots: hasToolbar ? setToolbarSlots : undefined,';
    const refresh = '    function refreshSurfaces() {\n        if (!multiView)\n            return;';
    const active = `const selection = dockview.onDidActivePanelChange(({ panel }) => {
        documentWorkspace?.notifySave();
        if (syncing)
            return;
        syncing = true;
        try {
            show(panel);
        }
        finally {
            syncing = false;
        }
        scheduleSave();
    });`;
    const tab = 'createTabComponent: () => new SpriteTab(document),';
    const targets = 'const originalTargets = () => vm.runtime.targets.filter(target => target.isOriginal);';
    const mountDocument = 'item.session = item.request.mount(element, () => api.close(), documentWorkspace?.notifySave);';
    const dispose = '            flushLayout();';
    const activateOnClick = `body.addEventListener('click', event => {
                    if (active?.id === id)`;
    if ([toolbar, active, refresh, tab, targets, mountDocument, dispose, activateOnClick].some(slot =>
        source.indexOf(slot) < 0 || source.indexOf(slot) !== source.lastIndexOf(slot))) {
        throw new Error('The pinned Editor Layout sprite tab connections have changed');
    }
    const unsaved = path.resolve(__dirname, '../../packages/editor-views/dockview-unsaved.ts');
    return `import {mountDockviewUnsaved} from ${JSON.stringify(unsaved)};\n` + source
        .replace(targets, `${targets}\n    const unsaved = multiView && mountDockviewUnsaved(vm, root, locale);`)
        .replace(tab, `createTabComponent: ({id}) => {
            const tab = new SpriteTab(document);
            const stop = unsaved && unsaved.tab(tab.element, () => ({
                target: views.get(id)?.target, document: documents.get(id)?.request.reference
            }));
            if (stop) tab.addDisposables({dispose: stop});
            return tab;
        },`)
        .replace(mountDocument, `const stop = unsaved && unsaved.document(element, item.request.reference);
                        try {
                            const session = item.request.mount(element, () => api.close(), documentWorkspace?.notifySave);
                            item.session = {...session, get save() { return session.save; },
                                get fileEdit() { return session.fileEdit; }, dispose() {
                                if (stop) stop();
                                session.dispose();
                            }};
                        } catch (error) {
                            if (stop) stop();
                            throw error;
                        }`)
        .replace(dispose, `${dispose}\n            if (unsaved) unsaved.dispose();`)
        .replace(activateOnClick, activateOnClick.replace('active?.id === id',
            'active?.id === id || viewAdapter?.ownsClick?.(event.target)'))
        .replace(toolbar, `${toolbar}
            runTargetSwitch: props.runTargetSwitch,`)
        .replace(refresh, `${refresh}
        // Layout changes can arrive before the editing target has switched.
        const selected = views.get(dockview.activePanel?.id);
        if (options.runTargetSwitch && selected && selected !== active) return;`)
        .replace(active, `const selection = dockview.onDidActivePanelChange(({ panel }) => {
        documentWorkspace?.notifySave();
        if (syncing) return;
        const activate = () => {
            if (!root.isConnected || dockview.activePanel !== panel) return;
            syncing = true;
            try {
                show(panel);
            } finally {
                syncing = false;
            }
            scheduleSave();
        };
        const target = views.get(panel?.id)?.target;
        if (target && options.runTargetSwitch) options.runTargetSwitch(target.id, activate, document);
        else activate();
    });`);
};
