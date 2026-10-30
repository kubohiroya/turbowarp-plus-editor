const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');

// Build the same host wiring used by the Editor for Packager's custom JS hook.
const gui = process.env.E2E_GUI_ROOT;
if (!gui || !path.isAbsolute(gui)) throw new Error('E2E_GUI_ROOT must be an absolute GUI checkout');
const hostRequire = createRequire(path.join(gui, 'package.json'));
const webpack = hostRequire('webpack');
const {withExtensionLoaderWebpack4} = hostRequire('@kubohiroya/turbowarp-extension-loader/webpack4');
const output = path.resolve(process.env.TW_PLUS_RUNTIME_OUTPUT || '.host/issue-4-artifacts/extension-runtime.js');
const config = withExtensionLoaderWebpack4({
    mode: 'production',
    context: gui,
    entry: path.join(gui, 'src/lib/tw-plus-extension-host.js'),
    output: {path: path.dirname(output), filename: path.basename(output),
        library: 'TurboWarpPlusExtensionHost', libraryTarget: 'window'},
    optimization: {minimize: false},
    resolve: {modules: [path.join(gui, 'node_modules'), 'node_modules']},
    module: {rules: [{test: /\.js$/, include: [path.join(gui, 'src')],
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
