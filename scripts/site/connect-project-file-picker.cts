module.exports = (source: string) => {
    const types = "types: [";
    const end = '                            ]\n';
    const from = source.indexOf(types);
    const to = source.indexOf(end, from);
    if (from === -1 || to === -1) throw new Error('The pinned GUI project file picker has changed');
    const old = source.slice(from, to + end.length);
    // The first native picker filter is the default. The input fallback must accept all three.
    const picker = source.replace(old, old.replace(types, 'types: getHostIntegration()?.projectFileTypes ?? ['));
    const earlyHandle = `                    const handle = thisFileInput.handle;
                    if (handle) {
                        if (this.fileToUpload.name.endsWith('.sb3')) {
                            this.props.onSetFileHandle(handle);
                        } else {
                            this.props.onSetFileHandle(null);
                        }
                    }`;
    const title = '                        if (filename) {';
    if (!picker.includes(earlyHandle) || !picker.includes(title)) {
        throw new Error('The pinned GUI project file handle connection has changed');
    }
    return picker.replace(earlyHandle, '                    this.projectFileHandle = thisFileInput.handle || null;')
        .replace('            this.fileToUpload = null;', '            this.fileToUpload = null;\n            this.projectFileHandle = null;')
        .replace('                let loadingSuccess = false;', '                const handle = this.projectFileHandle;\n                let loadingSuccess = false;')
        .replace(title, `                        this.props.onSetFileHandle(/\\.sb3$/i.test(filename || '') ? handle : null);
${title}`);
};
