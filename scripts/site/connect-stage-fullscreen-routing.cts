module.exports = function connectStageFullscreenRouting(source: string) {
    const route = 'if (isFullScreen) {\n            newPathname = this.fullscreenPath;';
    if (source.split(route).length !== 2) throw new Error('The pinned GUI fullscreen route changed');
    // Keep the editor URL while its stage is fullscreen. Direct fullscreen links still work.
    return source.replace(route,
        'if (isFullScreen && location.pathname !== this.editorPath) {\n            newPathname = this.fullscreenPath;');
};
