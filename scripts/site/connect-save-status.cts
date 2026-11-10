module.exports = (source: string) => {
    const dirty = ') : projectChanged && (';
    const props = '    projectChanged,\n';
    const types = '    projectChanged: PropTypes.bool,';
    if ([dirty, props, types].some(slot => source.indexOf(slot) < 0 || source.indexOf(slot) !== source.lastIndexOf(slot))) {
        throw new Error('The pinned GUI save status connection has changed');
    }
    return source.replace(props, `${props}    hideShortcut,\n`)
        .replace(dirty, ') : projectChanged && !hideShortcut && (')
        .replace(types, `${types}\n    hideShortcut: PropTypes.bool,`);
};
