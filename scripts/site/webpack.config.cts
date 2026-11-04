const path = require('node:path');
const fs = require('node:fs');
const {createRequire} = require('node:module');
if (!process.env.E2E_GUI_ROOT || !path.isAbsolute(process.env.E2E_GUI_ROOT)) throw new Error('An absolute GUI checkout is required');
// The host owns its application configuration; the site selects only its browser build.
const gui = process.env.E2E_GUI_ROOT;
const config = require(path.join(gui, 'webpack.config.js'))[0];
const hostRequire = createRequire(path.join(gui, 'package.json'));
// Resolved from this file, not the working directory: the site build runs with the GUI checkout as
// its cwd, so `path.resolve` here would have reached the GUI's install instead of this one.
const rootRequire = createRequire(path.join(__dirname, '..', '..', 'package.json'));
const localCatalogFile = process.env.TW_PLUS_LOCAL_CATALOG_INPUT;
let localCatalog = null;
if (localCatalogFile) {
    if (!path.isAbsolute(localCatalogFile) || process.env.TW_PLUS_CATALOG_PREVIEW !== '1') {
        throw new Error('Local catalog input is supported only by the explicit preview build');
    }
    localCatalog = JSON.parse(fs.readFileSync(localCatalogFile, 'utf8'));
}
// Keep historical demo URLs while this host owns the sample sources.
config.plugins.push(new (hostRequire('copy-webpack-plugin'))({patterns: [{
    from: path.join(__dirname, '..', '..', 'examples', 'extensions'),
    to: 'static/extensions'
}]}));
config.plugins.push(new (hostRequire('webpack').DefinePlugin)({
    __TW_PLUS_LOCAL_CATALOG__: JSON.stringify(localCatalog)
}));
// The host owns every additional module; the fork only consults this optional build-time value.
const bridge = path.join(__dirname, '..', '..', 'site', 'gui-integration', 'index.js');
const hookSource = fs.readFileSync(path.join(gui, 'src', 'addons', 'hooks.js'), 'utf8');
if (!hookSource.includes('getHostIntegration') || !hookSource.includes('__TW_GUI_HOST__')) {
    throw new Error('The pinned GUI does not expose the optional host bridge');
}
const injections = {__TW_GUI_HOST__: bridge};
const {spritePropertiesPackage, spritePropertiesVersion} = rootRequire('./site/source.json');
if (spritePropertiesPackage) {
    const spriteProperties = path.join(__dirname, '..', '..', 'node_modules', spritePropertiesPackage);
    const manifest = JSON.parse(fs.readFileSync(path.join(spriteProperties, 'package.json'), 'utf8'));
    if (manifest.name !== spritePropertiesPackage || manifest.version !== spritePropertiesVersion) {
        throw new Error('Sprite properties package differs from the source pin');
    }
    const css = fs.realpathSync(path.join(spriteProperties, manifest.exports['./styles.css']));
    const entry = fs.realpathSync(path.join(spriteProperties, manifest.module));
    config.resolve.alias[`${spritePropertiesPackage}$`] = entry;
    config.resolve.alias[`${spritePropertiesPackage}/styles.css$`] = css;
    // The standalone package publishes global class names alongside its React entry.
    const cssModules = config.module.rules.find(rule => rule.test?.test('styles.css'));
    cssModules.exclude = css;
    config.module.rules.push({test: /\.css$/, include: css,
        use: ['style-loader', {loader: 'css-loader', options: {modules: false}}]});
    Object.assign(injections, {__TW_SPRITE_PROPERTIES_PANEL__: [
        path.join(path.dirname(bridge), 'lib', 'tw-sprite-properties-panel.js'), 'SpritePropertiesPanel'
    ]});
}
config.plugins.push(new (hostRequire('webpack').ProvidePlugin)(injections));
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
    const name = `@kubohiroya/turbowarp-editor-${feature}`;
    const entry = rootRequire.resolve(name);
    config.resolve.alias[`${name}$`] = entry;
    return [feature, path.dirname(entry)];
}));
config.resolve.alias['@kubohiroya/turbowarp-editor-layout/targets.css$'] =
    rootRequire.resolve('@kubohiroya/turbowarp-editor-layout/targets.css');
const siteSource = path.join(__dirname, '..', '..', 'site');
// Override the addon default in Plus without changing the pinned GUI sources.
const hideDeleteButtonManifest = '../addons/hide-delete-button/_manifest_entry.js';
config.resolve.alias[`${hideDeleteButtonManifest}$`] = path.join(siteSource, 'hide-delete-button-manifest.js');
config.resolve.alias['@tw-plus/upstream-hide-delete-button-manifest$'] =
    path.join(gui, 'src', 'addons', 'generated', hideDeleteButtonManifest);
const backpackSurface = path.join(siteSource, 'editor-backpack');
config.resolve.alias['@tw-plus/backpack-window-host$'] = path.join(backpackSurface, 'window-host.js');
const windowStyles = rootRequire.resolve('@kubohiroya/turbowarp-editor-windows/styles.css');
config.resolve.alias['@kubohiroya/turbowarp-editor-windows/styles.css$'] = windowStyles;
const cssModules = config.module.rules.find(rule => rule.test?.test('styles.css'));
cssModules.exclude = [cssModules.exclude, windowStyles].filter(Boolean);
config.module.rules.push({test: /\.css$/, include: windowStyles,
    use: ['style-loader', {loader: 'css-loader', options: {modules: false}}]});
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
config.module.rules.push({test: /\.ts$/, include: [
    backpackSurface, editorEntries.surfaces, editorEntries.transfer
], loader: path.join(__dirname, 'transpile-local-typescript.cjs')});
config.module.rules.push({test: /\.jsx?$/, include: [
    siteSource, transferSource, editorEntries.layout, editorEntries.backpack, editorEntries.views
],
    loader: hostRequire.resolve('babel-loader'),
    options: {babelrc: false, configFile: false,
        presets: [[hostRequire.resolve('@babel/preset-env'), {targets: {ie: '11'}, modules: false}],
            hostRequire.resolve('@babel/preset-react')]}});
// Also transpile a local VM source checkout used by integration previews.
const vmSource = fs.realpathSync(path.join(path.dirname(hostRequire.resolve('scratch-vm/package.json')), 'src'));
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
// And the block editor's, which aliases the package's subpaths to the precompiled entries beside
// the copy that provides the helper. That is why it matters that this is this repository's copy:
// the GUI no longer depends on the package, and these are the bytes its modules import.
const {withBlockEditorWebpack4} = rootRequire('@kubohiroya/turbowarp-extension-data-editor/webpack4');
module.exports = withBlockEditorWebpack4(
    withExtensionLoaderWebpack4(withDocumentEditorWebpack4(config), {hostRoot: gui}), {hostRoot: gui});
