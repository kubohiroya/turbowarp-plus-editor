const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');

// Build the extension host this repository supplies into the bundle a built single HTML carries.
//
// The entry is this repository's, not the GUI's: the wiring is supplied through the GUI's
// integration socket, and a distributed HTML has no socket to ask. `site/extension-host/runtime.js`
// is the same wiring with the VM modules of this build filled in.
const gui = process.env.E2E_GUI_ROOT;
if (!gui || !path.isAbsolute(gui)) throw new Error('E2E_GUI_ROOT must be an absolute GUI checkout');
const hostRequire = createRequire(path.join(gui, 'package.json'));
const rootRequire = createRequire(path.resolve('package.json'));
const vmSource = fs.realpathSync(path.join(path.dirname(hostRequire.resolve('scratch-vm/package.json')), 'src'));
const webpack = hostRequire('webpack');
// This repository's copy: the GUI no longer depends on the Loader at all. The helper's babel rule
// covers exactly that copy, so the alias below pins resolution to it — the host's module path is
// searched first, and a stale copy there would be bundled untranspiled.
const {withExtensionLoaderWebpack4} = rootRequire('@kubohiroya/turbowarp-extension-loader/webpack4');
// The package does not export its own package.json, so its root is read from its built entry.
const loaderRoot = path.resolve(path.dirname(rootRequire.resolve('@kubohiroya/turbowarp-extension-loader')), '..');
const output = path.resolve(process.env.TW_PLUS_RUNTIME_OUTPUT || '.host/issue-4-artifacts/extension-runtime.js');
const config = withExtensionLoaderWebpack4({
    mode: 'production',
    context: gui,
    entry: path.resolve('site/extension-host/runtime.js'),
    output: {path: path.dirname(output), filename: path.basename(output),
        library: 'TurboWarpPlusExtensionHost', libraryTarget: 'window'},
    optimization: {minimize: false},
    // The host's modules come first, so the packages both sides share are the host's single copy.
    resolve: {modules: [path.join(gui, 'node_modules'), path.resolve('node_modules'), 'node_modules'],
        alias: {'@kubohiroya/turbowarp-extension-loader': loaderRoot}},
    module: {rules: [{test: /\.js$/, include: [path.join(gui, 'src'), vmSource, path.resolve('site')],
        loader: hostRequire.resolve('babel-loader'), options: {babelrc: false, configFile: false,
            presets: [[hostRequire.resolve('@babel/preset-env'), {targets: {ie: '11'}, modules: false}]]}}]}
}, {hostRoot: gui});
webpack(config, (error, stats) => {
    if (error || stats.hasErrors()) {
        console.error(error || stats.toString({all: false, errors: true}));
        process.exitCode = 1;
        return;
    }
    if (!fs.existsSync(output)) throw new Error('Runtime bundle was not emitted');
    console.log(output);
});
