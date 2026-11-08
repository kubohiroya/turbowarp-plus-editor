module.exports = (source: string) => {
    const toolbar = 'onToolbarSlots: hasToolbar ? setToolbarSlots : undefined,';
    const refresh = '    function refreshSurfaces() {\n        if (!multiView)\n            return;';
    const active = `const selection = dockview.onDidActivePanelChange(({ panel }) => {
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
    if (!source.includes(toolbar) || !source.includes(active) || !source.includes(refresh)) {
        throw new Error('The pinned Editor Layout sprite tab connections have changed');
    }
    return source.replace(toolbar, `${toolbar}
            runTargetSwitch: props.runTargetSwitch,`)
        .replace(refresh, `${refresh}
        // Layout changes can arrive before the editing target has switched.
        const selected = views.get(dockview.activePanel?.id);
        if (options.runTargetSwitch && selected && selected !== active) return;`)
        .replace(active, `const selection = dockview.onDidActivePanelChange(({ panel }) => {
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
