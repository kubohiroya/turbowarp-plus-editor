const path: typeof import('node:path') = require('node:path');
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
const {createRequire} = require('node:module');
if (!process.env.E2E_GUI_ROOT || !path.isAbsolute(process.env.E2E_GUI_ROOT)) throw new Error('An absolute GUI checkout is required');
// The host owns its application configuration; the site selects only its browser build.
const gui = process.env.E2E_GUI_ROOT;
const config = require(path.join(gui, 'webpack.config.js'))[0];
const hostRequire = createRequire(path.join(gui, 'package.json'));
// Resolved from this file, not the working directory: the site build runs with the GUI checkout as
// its cwd, so `path.resolve` here would have reached the GUI's install instead of this one.
const rootRequire = createRequire(path.join(__dirname, '..', '..', 'package.json'));
// Standalone webpack builds also carry the revision of the Editor checkout that produced them.
const editorRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: path.join(__dirname, '..', '..'), encoding: 'utf8'
}).trim();
const revisionField = process.env.TW_PLUS_DESKTOP_SOURCE ? 'editorRevision' : 'siteRevision';
config.plugins.push({
    apply(compiler) {
        compiler.hooks.emit.tap('EditorRevision', compilation => {
            const json = JSON.stringify({[revisionField]: editorRevision}) + '\n';
            compilation.assets['build-info.json'] = {source: () => json, size: () => Buffer.byteLength(json)};
        });
    }
});
const localCatalogFile = process.env.TW_PLUS_LOCAL_CATALOG_INPUT;
let localCatalog = null;
if (localCatalogFile) {
    if (!path.isAbsolute(localCatalogFile) || process.env.TW_PLUS_CATALOG_PREVIEW !== '1') {
        throw new Error('Local catalog input is supported only by the explicit preview build');
    }
    localCatalog = JSON.parse(fs.readFileSync(localCatalogFile, 'utf8'));
}
// Compile the example sources while preserving their historical browser URLs.
config.plugins.push(new (hostRequire('copy-webpack-plugin'))({patterns: [{
    from: '*.ts',
    context: path.join(__dirname, '..', '..', 'examples', 'extensions'),
    to: 'static/extensions/[name].js',
    toType: 'template',
    transform: (source, file) => rootRequire('esbuild').transformSync(source.toString(),
        {loader: 'ts', target: 'es2017', sourcefile: file}).code
}]}));
const bffOrigin = process.env.TW_PLUS_GIT_BFF_ORIGIN;
const proxyOrigin = process.env.TW_PLUS_GIT_PROXY_ORIGIN;
const cloudflareGit = bffOrigin || proxyOrigin ? {bffOrigin, proxyOrigin} : null;
if (cloudflareGit && ![bffOrigin, proxyOrigin].every(value => {
    const url = value && URL.parse(value);
    return url && url.protocol === 'https:' && url.origin === value;
})) throw new Error('Cloudflare Git requires both exact HTTPS origins');
config.plugins.push(new (hostRequire('webpack').DefinePlugin)({
    __TW_PLUS_EDITOR_VERSION__: JSON.stringify(rootRequire('./package.json').version),
    __TW_PLUS_LOCAL_CATALOG__: JSON.stringify(localCatalog),
    __TW_PLUS_GIT_CLOUDFLARE__: JSON.stringify(cloudflareGit)
}));
// The host owns every additional module; the fork only consults this optional build-time value.
const bridge = path.join(__dirname, '..', '..', 'site', 'gui-integration', 'index.ts');
const hookSource = fs.readFileSync(path.join(gui, 'src', 'addons', 'hooks.js'), 'utf8');
if (!hookSource.includes('getHostIntegration') || !hookSource.includes('__TW_GUI_HOST__')) {
    throw new Error('The pinned GUI does not expose the optional host bridge');
}
const injections = {
    __TW_GUI_HOST__: bridge,
    __TW_PLUS_FILE_UPLOADER__: path.join(gui, 'src', 'lib', 'file-uploader.js'),
    __TW_GUI_ADDON_MESSAGES__: path.join(gui, 'src', 'addons', 'addons-l10n', 'en.json'),
    __TW_PLUS_PROJECT_FOLDER_SET_FILE_HANDLE__: [path.join(gui, 'src', 'reducers', 'tw.js'), 'setFileHandle'],
    __TW_PLUS_PROJECT_FOLDER_SET_UNCHANGED__: [path.join(gui, 'src', 'reducers', 'project-changed.js'), 'setProjectUnchanged'],
    __TW_PLUS_PROJECT_FOLDER_SET_TITLE__: [path.join(gui, 'src', 'reducers', 'project-title.js'), 'setProjectTitle'],
    __TW_PLUS_GIT_DESERIALIZE_BLOCKS__: ['scratch-vm/src/serialization/sb3.js', 'deserializeBlocks'],
    __TW_PLUS_GIT_VM_BLOCKS__: 'scratch-vm/src/engine/blocks.js'
};
config.plugins.push(new (hostRequire('webpack').ProvidePlugin)(injections));
config.module.rules.push({
    include: fs.realpathSync(path.join(gui, 'src/addons/addons/hide-flyout/userscript.js')),
    enforce: 'pre',
    use: path.join(__dirname, 'connect-hide-flyout.cts')
});
config.module.rules.push({
    include: fs.realpathSync(path.join(gui, 'src/containers/sb3-downloader.jsx')),
    enforce: 'pre',
    use: path.join(__dirname, 'connect-project-save.cts')
});
config.module.rules.push({
    include: fs.realpathSync(path.join(gui, 'src/components/menu-bar/menu-bar.jsx')),
    enforce: 'pre',
    use: path.join(__dirname, 'connect-menu-bar-controls.cts')
});
config.module.rules.push({
    include: fs.realpathSync(path.join(gui, 'src/addons/addons/debugger/userscript.js')),
    enforce: 'pre',
    use: path.join(__dirname, 'connect-debugger-menu-button.cts')
});
config.module.rules.push({
    include: fs.realpathSync(path.join(gui, 'src/lib/sb-file-uploader-hoc.jsx')),
    enforce: 'pre',
    use: path.join(__dirname, 'connect-project-file-picker.cts')
});
config.module.rules.push({
    include: fs.realpathSync(path.join(gui, 'src/lib/tw-packager-integration-hoc.jsx')),
    enforce: 'pre',
    use: path.join(__dirname, 'connect-project-export.cts')
});
if (!process.env.TW_PLUS_DESKTOP_SOURCE) {
    // Give only the GUI project URL fetcher the browser host's URL resolution.
    config.module.rules.push({
        include: fs.realpathSync(path.join(gui, 'src/lib/project-fetcher-hoc.jsx')),
        enforce: 'pre',
        use: path.join(__dirname, 'connect-project-fetch.cts')
    });
}
// Resolve shared packages to the host's copies, once.
//
// A module this repository supplies is resolved from here, so `react` would come from this
// repository's node_modules: React 18 against the host's 16 at the time of writing. Two copies in
// one bundle break what they are for — hooks throw and context does not cross between them — and
// the host's tree is the one that mounts. Fail loudly if the copy is missing rather than silently
// bundling a second one.
//
// The other three are shared for the same reason: both sides pass React elements, props and
// archives across the socket, and the pin in site/source.json is what makes it one version. A
// second copy would be the same code with its own module state. Neither the Loader nor the review
// dialog is in this list any more — the GUI depends on neither, so this repository's copies are the
// only ones.
for (const name of ['react', 'react-dom', 'prop-types', 'lodash.bindall', '@turbowarp/jszip', 'scratch-vm', 'react-intl', 'react-redux']) {
    const copy = path.join(gui, 'node_modules', name);
    if (!fs.existsSync(copy)) throw new Error(`The pinned GUI has no ${name} to resolve against`);
    config.resolve.alias[name] = copy;
}
// Transpile the modules this repository supplies to the GUI.
//
// The host's babel rule covers its own `src` only, so these were parsed as plain JS by webpack 4,
// whose parser predates optional chaining. One such module built anyway and the next did not,
// which is the worst way to find this out: the syntax a file happens to use decided whether the
// build worked. Give them the same treatment the host gives its own sources instead.
//
// JSX is included because this repository supplies React views too — the library tab the host
// renders. The host's react-intl plugin is not: these views carry their own text, since what they
// say is this distribution's rather than part of the editor's translations. CSS and images need no
// rule of their own: the host's rules for those match by extension alone, so a stylesheet imported
// from here becomes a CSS module exactly as one of its own does.
const transferSource = path.dirname(rootRequire.resolve('@kubohiroya/turbowarp-script-transfer'));
config.resolve.alias['@kubohiroya/turbowarp-script-transfer$'] = path.join(transferSource, 'index.js');
const editorEntries = Object.fromEntries(['layout', 'surfaces', 'transfer', 'backpack', 'views'].map(feature => {
    const name = `@kubohiroya/turbowarp-${['layout', 'views'].includes(feature) ? 'plus-' : ''}editor-${feature}`;
    const entry = rootRequire.resolve(name);
    config.resolve.alias[`${name}$`] = entry;
    return [feature, path.dirname(entry)];
}));
config.resolve.alias['@kubohiroya/turbowarp-plus-editor-views/sprite-code-windows$'] =
    rootRequire.resolve('@kubohiroya/turbowarp-plus-editor-views/sprite-code-windows');
config.resolve.alias['@kubohiroya/turbowarp-plus-editor-views/target-combobox$'] =
    rootRequire.resolve('@kubohiroya/turbowarp-plus-editor-views/target-combobox');
const layoutGlobalStyleEntries = ['sprite-layout-menu.css', 'sprite-asset-pane.css', 'sprite-editor-toolbar.css',
    'sprite-properties.css', 'windows.css'];
for (const entry of [...layoutGlobalStyleEntries, 'standard-layout', 'editor.css', 'targets.css', 'extension-file-menu',
    'sprite-editor-toolbar',
    'sprite-properties', 'sprite-tabs', 'stage-surface', 'dockview-styles', 'windows']) {
    const specifier = `@kubohiroya/turbowarp-plus-editor-layout/${entry}`;
    config.resolve.alias[`${specifier}$`] = rootRequire.resolve(specifier);
}
config.module.rules.push({
    include: fs.realpathSync(rootRequire.resolve('@kubohiroya/turbowarp-plus-editor-layout/sprite-tabs')),
    enforce: 'pre',
    use: path.join(__dirname, 'connect-sprite-tabs.cts')
});
for (const specifier of ['@kubohiroya/turbowarp-plus-editor-project-folder', '@kubohiroya/turbowarp-plus-editor-auth',
    '@kubohiroya/turbowarp-plus-editor-git', '@kubohiroya/turbowarp-plus-editor-git/style.css']) {
    config.resolve.alias[`${specifier}$`] = rootRequire.resolve(specifier);
}
const editorUiEntry = rootRequire.resolve('@kubohiroya/turbowarp-plus-editor-ui');
config.resolve.alias['@kubohiroya/turbowarp-plus-editor-ui$'] = editorUiEntry;
for (const entry of ['busy-cursor', 'detached-block-palette', 'edit-menu', 'palette-category-reorder', 'palette-category-search',
    'palette-dropdown-resize', 'project-load-progress', 'project-load-progress-view',
    'project-search', 'project-search-connections', 'project-info-menu', 'project-file-dialogs', 'project-file-menu',
    'stage-controls', 'stage-controls-view']) {
    const specifier = `@kubohiroya/turbowarp-plus-editor-ui/${entry}`;
    config.resolve.alias[`${specifier}$`] = rootRequire.resolve(specifier);
}
config.resolve.extensions = [...(config.resolve.extensions || ['.wasm', '.mjs', '.js', '.json']), '.ts', '.tsx'];
const siteSource = path.join(__dirname, '..', '..', 'site');
// Both the web and Desktop renderers request the upstream Backpack container.
config.resolve.alias['../../containers/backpack.jsx$'] =
    path.join(siteSource, 'gui-integration', 'containers', 'tw-disabled-backpack.ts');
// Share the original fullscreen artwork with the stage display menu.
config.resolve.alias['@tw-plus/gui-stage-fullscreen-icon$'] =
    path.join(gui, 'src', 'components', 'stage-header', 'icon--fullscreen.svg');
config.resolve.alias['@tw-plus/gui-block-category-artwork$'] =
    path.join(gui, 'src', 'addons', 'addons', 'block-palette-icons', '_runtime_entry.js');
// Override the addon default in Plus without changing the pinned GUI sources.
const hideDeleteButtonManifest = '../addons/hide-delete-button/_manifest_entry.js';
config.resolve.alias[`${hideDeleteButtonManifest}$`] = path.join(siteSource, 'hide-delete-button-manifest.ts');
config.resolve.alias['@tw-plus/upstream-hide-delete-button-manifest$'] =
    path.join(gui, 'src', 'addons', 'generated', hideDeleteButtonManifest);
const backpackSurface = path.join(siteSource, 'editor-backpack');
config.resolve.alias['@tw-plus/backpack-window-host$'] = path.join(backpackSurface, 'window-host.ts');
const layoutRequire = createRequire(rootRequire.resolve('@kubohiroya/turbowarp-plus-editor-layout'));
const dockviewEntry = layoutRequire.resolve('dockview');
const dockviewRequire = createRequire(dockviewEntry);
config.resolve.alias['dockview$'] = dockviewEntry;
config.resolve.alias['dockview-core$'] = dockviewRequire.resolve('dockview-core');
const dockviewStyles = layoutRequire.resolve('dockview/dist/styles/dockview.css');
config.resolve.alias['dockview/dist/styles/dockview.css$'] = dockviewStyles;
config.plugins.push(new (hostRequire('copy-webpack-plugin'))({patterns: [
    {from: path.join(path.dirname(layoutRequire.resolve('dockview/package.json')), 'LICENCE.md'),
        to: 'notices/dockview/LICENCE.md'},
    {from: path.join(path.dirname(dockviewRequire.resolve('dockview-core/package.json')), 'LICENCE.md'),
        to: 'notices/dockview-core/LICENCE.md'}
]}));
const globalStyles = layoutGlobalStyleEntries.map(entry => config.resolve.alias[`@kubohiroya/turbowarp-plus-editor-layout/${entry}$`]);
globalStyles.push(config.resolve.alias['@kubohiroya/turbowarp-plus-editor-git/style.css$']);
const cssModules = config.module.rules.find(rule => rule.test?.test('styles.css'));
const previewReloadStyles = path.join(siteSource, 'styles', 'preview-reload.css');
cssModules.exclude = [cssModules.exclude, dockviewStyles, ...globalStyles, previewReloadStyles].filter(Boolean);
config.module.rules.push({test: /\.css$/, include: [dockviewStyles, ...globalStyles],
    use: ['style-loader', {loader: 'css-loader', options: {modules: false}}]});
// Bundle the pinned stylesheet for all renderers, including Desktop and offline projects.
config.module.rules.push({
    include: previewReloadStyles,
    use: ['style-loader', {loader: 'css-loader', options: {modules: false}},
        path.join(__dirname, 'load-preview-reload-css.cts')]
});
config.entry['backpack-popout'] = path.join(backpackSurface, 'child.ts');
config.plugins.push(new (hostRequire('html-webpack-plugin'))({
    chunks: ['backpack-popout'], filename: 'backpack-popout.html',
    template: path.join(backpackSurface, 'backpack-popout.html')
}));
config.entry['stage-popout'] = config.entry['backpack-popout'];
config.plugins.push(new (hostRequire('html-webpack-plugin'))({
    chunks: ['stage-popout'], filename: 'stage-popout.html',
    title: 'Stage',
    template: path.join(siteSource, 'editor-layout', 'stage-popout.html')
}));
config.plugins.push(new (hostRequire('html-webpack-plugin'))({
    chunks: [], filename: 'dockview-popout.html', title: 'TurboWarp Plus Editor'
}));
config.module.rules.push({test: /\.tsx?$/, include: [
    siteSource,
    path.resolve(__dirname, '../desktop'), ...Object.values(editorEntries), path.dirname(editorUiEntry)
], loader: path.join(__dirname, 'transpile-local-typescript.cts')});
config.module.rules.push({
    include: path.join(gui, 'src/components/loader/loader.jsx'),
    enforce: 'pre',
    use: path.join(__dirname, 'connect-project-load-progress.cts')
});
const vmRequire = createRequire(hostRequire.resolve('scratch-vm/package.json'));
config.module.rules.push({
    include: vmRequire.resolve('scratch-parser'),
    enforce: 'pre',
    use: path.join(__dirname, 'connect-shared-project-archive.cts')
});
// Webpack 4 needs an alias for the protocol export used by the pinned document-data package.
const documentDataRequire = createRequire(rootRequire.resolve('@kubohiroya/turbowarp-document-data/package.json'));
const documentSourcePackage = documentDataRequire.resolve('@kubohiroya/turbowarp-document-source/package.json');
const documentSourceRoot = path.dirname(documentSourcePackage);
config.resolve.alias['@kubohiroya/turbowarp-document-source/protocol$'] = path.resolve(
    documentSourceRoot, documentDataRequire(documentSourcePackage).exports['./protocol'].import
);
config.module.rules.push({test: /\.jsx?$/, include: [
    siteSource, path.dirname(rootRequire.resolve('@kubohiroya/turbowarp-sb3-save-format/package.json')),
    documentSourceRoot, transferSource, editorEntries.layout, editorEntries.backpack, editorEntries.views
],
    loader: hostRequire.resolve('babel-loader'),
    options: {babelrc: false, configFile: false,
        presets: [[hostRequire.resolve('@babel/preset-env'), {targets: {ie: '11'}, modules: false}],
            hostRequire.resolve('@babel/preset-react')]}});
// Also transpile a local VM source checkout used by integration previews.
const vmSource = fs.realpathSync(path.join(path.dirname(hostRequire.resolve('scratch-vm/package.json')), 'src'));
const paintSource = path.join(path.dirname(hostRequire.resolve('scratch-paint/package.json')), 'src');
config.module.rules.push({
    include: [
        path.join(gui, 'src/containers/sound-editor.jsx'),
        path.join(gui, 'src/containers/record-modal.jsx'),
        path.join(gui, 'src/lib/audio/audio-util.js'),
        path.join(gui, 'src/containers/paint-editor-wrapper.jsx'),
        path.join(paintSource, 'containers/paint-editor.jsx'),
        path.join(paintSource, 'helper/bitmap.js'),
        path.join(vmSource, 'virtual-machine.js')
    ].map(filename => fs.realpathSync(filename)),
    enforce: 'pre',
    use: path.join(__dirname, 'connect-asset-edits.cts')
});
if (!vmSource.includes(`${path.sep}node_modules${path.sep}`)) {
    config.module.rules.push({test: /\.jsx?$/, include: [vmSource], loader: hostRequire.resolve('babel-loader'),
        options: {babelrc: false, configFile: false,
            presets: [[hostRequire.resolve('@babel/preset-env'), {targets: {ie: '11'}, modules: false}]]}});
}
// Connect the document editor this repository supplies to the host's babel rule and its own
// package exports. The pinned GUI applied this helper while it still depended on the package; it
// no longer does, so the side that imports the package is the side that configures it. The helper
// resolves against the copy that provides it, which is this repository's install.
const {withDocumentEditorWebpack4} = rootRequire('@kubohiroya/turbowarp-document-editor/webpack4');
// The Loader's own helper, for the same reason: this repository imports the package, so it is the
// side that transpiles it for webpack 4's parser. `hostRoot` is still the GUI, because that is
// where babel-loader and preset-env are installed.
const {withExtensionLoaderWebpack4} = rootRequire('@kubohiroya/turbowarp-extension-loader/webpack4');
// Override only the add-mode intro in the pinned security review bundle.
const securityReview = rootRequire.resolve('@kubohiroya/turbowarp-extension-security-dialog/react');
config.module.rules.push({
    include: [securityReview, path.join(path.dirname(securityReview), 'react.mjs')],
    use: path.join(__dirname, 'extension-add-copy-loader.cts')
});
// The block editor helper aliases its subpaths to precompiled entries in this repository's install.
const {withBlockEditorWebpack4} = rootRequire('@kubohiroya/turbowarp-extension-data-editor/webpack4');
module.exports = withBlockEditorWebpack4(
    withExtensionLoaderWebpack4(withDocumentEditorWebpack4(config), {hostRoot: gui}), {hostRoot: gui});
