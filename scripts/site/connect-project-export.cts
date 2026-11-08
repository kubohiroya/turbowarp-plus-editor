module.exports = (source: string) => {
    const marker = "            this.props.vm.saveProjectSb3('arraybuffer')";
    if (!source.includes(marker)) throw new Error('The pinned GUI Packager serialization has changed');
    return source.replace(marker, `            (getHostIntegration()?.serializeProjectForExport?.(this.props.vm) ??
                this.props.vm.saveProjectSb3('arraybuffer'))`);
};
