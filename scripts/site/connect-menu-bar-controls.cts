module.exports = (source: string) => {
    const end = '{!reorganizeMenuBar && aboutButton}';
    if (source.indexOf(end) === -1 || source.indexOf(end) !== source.lastIndexOf(end)) {
        throw new Error('The pinned GUI menu bar connection has changed');
    }
    const start = '                                    <FileMenuItem\n                                        isRtl={this.props.isRtl}\n                                        command="new"';
    const finish = '                                </MenuBarMenu>';
    const from = source.indexOf(start);
    const to = source.indexOf(finish, from);
    if (from === -1 || to === -1) throw new Error('The pinned GUI File menu has changed');
    const original = source.slice(from, to);
    const workflow = `                                    {host?.renderProjectFileWorkflow && !(this.props.canSave || this.props.canCreateCopy || this.props.canRemix) ?
                                        <SB3Downloader showSaveFilePicker={this.props.showSaveFilePicker}>
                                            {(_className, _download, {projectFileStorage}) => host.renderProjectFileWorkflow({
                                                vm: this.props.vm, locale: this.props.locale, MenuItem: FileMenuItem, MenuSection,
                                                close: this.props.onRequestCloseFile, storage: projectFileStorage,
                                                create: this.handleClickNew, newWindow: this.props.onClickNewWindow && this.handleClickNewWindow,
                                                open: this.props.onStartSelectingFileUpload, restore: this.handleClickRestorePoints,
                                                exportProject: this.props.onClickPackager && this.handleClickPackager,
                                                addExtension: this.props.onAddExtension
                                            })}
                                        </SB3Downloader> : <React.Fragment>
${original}                                    </React.Fragment>}
`;
    return (source.slice(0, from) + workflow + source.slice(to)).replace(end, `${end}
                {host?.renderStageControls?.({vm: this.props.vm, menuLocale: this.props.intl.locale})}`);
};
