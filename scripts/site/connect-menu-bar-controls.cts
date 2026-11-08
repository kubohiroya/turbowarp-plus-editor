module.exports = (source: string) => {
    const end = '{!reorganizeMenuBar && aboutButton}';
    const edit = '</DeletionRestorer>\n                                )}';
    if ([end, edit].some(slot => source.indexOf(slot) === -1 || source.indexOf(slot) !== source.lastIndexOf(slot))) {
        throw new Error('The pinned GUI menu bar connection has changed');
    }
    return source
        .replace(end, `${end}
                {host?.renderStageControls?.({vm: this.props.vm, menuLocale: this.props.intl.locale})}`)
        .replace(edit, `${edit}
                                {!this.props.isPlayerOnly && host?.renderEditMenu?.({
                                    vm: this.props.vm,
                                    locale: this.props.intl.locale,
                                    MenuItem,
                                    MenuSection,
                                    onRequestClose: this.props.onRequestCloseEdit
                                })}`);
};
