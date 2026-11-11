module.exports = (source: string) => {
    const end = '{!reorganizeMenuBar && aboutButton}';
    const edit = '</DeletionRestorer>\n                                )}';
    const restore = '{this.restoreOptionMessage(deletedItem)}';
    const host = 'const host = getHostIntegration();';
    const title = '</MenuBarItemTooltip>\n            </div>\n        );\n        const menuBar';
    const titleGroup = 'className={classNames(styles.menuBarItem, styles.growable)}';
    const titleField = 'className={classNames(styles.titleFieldGrowable)}';
    const saveStatus = '<TWSaveStatus';
    const redux = '        projectId: state.scratchGui.projectState.projectId,';
    if ([end, edit, restore, host, title, titleGroup, titleField, saveStatus, redux].some(slot =>
        source.indexOf(slot) === -1 || source.indexOf(slot) !== source.lastIndexOf(slot))) {
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
    return (source.slice(0, from) + workflow + source.slice(to))
        .replace(titleGroup, 'className={classNames(styles.menuBarItem, (reorganizeMenuBar && ProjectInfoMenu.titleGroupClassName) || styles.growable)}')
        .replace(titleField, 'className={(reorganizeMenuBar && ProjectInfoMenu.titleFieldClassName) || styles.titleFieldGrowable}')
        .replace(host, `${host}
        const useTitleSaveMenu = host?.renderProjectSaveMenu && this.props.canEditTitle && this.props.canManageFiles &&
            !(this.props.canSave || this.props.canCreateCopy || this.props.canRemix);`)
        .replace(title, `</MenuBarItemTooltip>
                {useTitleSaveMenu && this.props.projectChanged && (
                    <SB3Downloader showSaveFilePicker={this.props.showSaveFilePicker}>
                        {(_className, _download, {projectFileStorage}) => host.renderProjectSaveMenu({
                            vm: this.props.vm, locale: this.props.locale, storage: projectFileStorage
                        })}
                    </SB3Downloader>
                )}
            </div>
        );
        const menuBar`)
        .replace(saveStatus, `${saveStatus} hideShortcut={Boolean(useTitleSaveMenu)}`)
        .replace(redux, `${redux}\n        projectChanged: state.scratchGui.projectChanged,`)
        .replace('    canEditTitle: PropTypes.bool,', '    canEditTitle: PropTypes.bool,\n    projectChanged: PropTypes.bool,')
        .replace(end, `${end}
                {host?.renderStageControls?.({vm: this.props.vm, menuLocale: this.props.intl.locale})}`)
        .replace(restore, '{host?.renderEditMenuRestore?.(this.restoreOptionMessage(deletedItem)) ?? this.restoreOptionMessage(deletedItem)}')
        .replace(edit, `${edit}
                                {!this.props.isPlayerOnly && host?.renderEditMenu?.({
                                    vm: this.props.vm,
                                    locale: this.props.intl.locale,
                                    MenuItem,
                                    MenuSection,
                                    onRequestClose: this.props.onRequestCloseEdit
                                })}`);
};
