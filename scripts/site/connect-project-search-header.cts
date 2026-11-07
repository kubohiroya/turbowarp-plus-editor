module.exports = (source: string) => {
    const toolbar = 'onToolbarSlots: hasToolbar ? setToolbarSlots : undefined,';
    const header = 'return { ...menu, init() { } };';
    if (!source.includes(toolbar) || !source.includes(header)) {
        throw new Error('The pinned Editor Layout header connection has changed');
    }
    // Connect the host's search to the same Dockview header actions as the layout menu.
    return source.replace(toolbar, `${toolbar}
            mountHeaderSearch: props.mountHeaderSearch &&
                (context => latest.current.mountHeaderSearch(context)),`)
        .replace(header, `return options.mountHeaderSearch?.({
            menu, group, hasSpriteTab: () => views.has(group.activePanel?.id)
        }) ?? { ...menu, init() { } };`);
};
