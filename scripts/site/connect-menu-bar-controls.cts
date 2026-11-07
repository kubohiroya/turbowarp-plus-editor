module.exports = (source: string) => {
    const end = '{!reorganizeMenuBar && aboutButton}';
    if (source.indexOf(end) === -1 || source.indexOf(end) !== source.lastIndexOf(end)) {
        throw new Error('The pinned GUI menu bar connection has changed');
    }
    return source.replace(end, `${end}
                {host?.renderStageControls?.({vm: this.props.vm, menuLocale: this.props.intl.locale})}`);
};
