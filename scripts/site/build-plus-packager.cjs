const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const gui = process.env.E2E_GUI_ROOT;
const packager = process.env.TW_PLUS_PACKAGER_ROOT;
if (!gui || !path.isAbsolute(gui) || !packager || !path.isAbsolute(packager)) {
    throw new Error('Absolute E2E_GUI_ROOT and TW_PLUS_PACKAGER_ROOT checkouts are required');
}
const expected = 'c115bdf525c5f49f0fb689a21b335ccb70fc22d2';
if (execFileSync('git', ['rev-parse', 'HEAD'], {cwd: packager, encoding: 'utf8'}).trim() !== expected) {
    throw new Error('Packager source differs from the reviewed fixed revision');
}
if (execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', 'src', 'webpack.config.js'], {cwd: packager, encoding: 'utf8'}).trim()) {
    throw new Error('Packager source checkout must be clean');
}
const hostRequire = createRequire(path.join(gui, 'package.json'));
const vmSource = fs.realpathSync(path.join(path.dirname(hostRequire.resolve('scratch-vm/package.json')), 'src'));
const rootRequire = createRequire(path.resolve('package.json'));
const webpack = hostRequire('webpack');
const {withExtensionLoaderWebpack4} = hostRequire('@kubohiroya/turbowarp-extension-loader/webpack4');
const published = path.dirname(rootRequire.resolve('@turbowarp/packager/package.json'));
if (rootRequire('@turbowarp/packager/package.json').version !== '3.14.0') throw new Error('Packager 3.14.0 is required');
const scaffoldRoot = path.resolve(process.env.TW_PLUS_SCAFFOLDING_ROOT || '.host/issue-4-artifacts/scaffolding');
const scaffoldInfo = JSON.parse(fs.readFileSync(path.join(scaffoldRoot, 'build-info.json'), 'utf8'));
const manager = fs.readFileSync(hostRequire.resolve('scratch-vm/src/extension-support/extension-manager.js'));
if (scaffoldInfo.packagerRevision !== expected || scaffoldInfo.vmManagerSha256 !== createHash('sha256').update(manager).digest('hex')) {
    throw new Error('Patched scaffolding source does not match the host VM');
}
const scaffold = fs.readFileSync(path.join(scaffoldRoot, 'scaffolding-full.js'), 'utf8');
const buildId = /\/\/ ([a-f0-9]+) =\^\.\.\^=$/.exec(scaffold)?.[1];
if (!buildId) throw new Error('Published scaffolding has no build ID');
const output = path.join(gui, 'build');
const runtime = fs.readFileSync(path.resolve(process.env.TW_PLUS_RUNTIME_OUTPUT || '.host/issue-4-artifacts/extension-runtime.js'), 'utf8');
const assets = {};
for (const [name, file] of Object.entries({scaffolding: 'scaffolding-full.js', 'scaffolding-min': 'scaffolding-min.js', addons: 'addons.js'})) {
    assets[name] = fs.readFileSync(path.join(scaffoldRoot, file), 'utf8');
    if (createHash('sha256').update(assets[name]).digest('hex') !== scaffoldInfo.sourceHashes[file]) {
        throw new Error(`Patched scaffolding digest mismatch: ${file}`);
    }
}
const config = withExtensionLoaderWebpack4({
    mode: 'production', context: gui,
    entry: path.join(gui, 'src/playground/plus-packager.js'),
    output: {path: output, filename: 'plus-packager.js'},
    optimization: {minimize: false},
    resolve: {modules: [path.join(gui, 'node_modules'), path.resolve('node_modules'), 'node_modules'],
        alias: {'@turbowarp/packager-web$': path.join(packager, 'src/packager/web/export.js')}},
    module: {rules: [
        {test: /\.js$/, include: [path.join(gui, 'src'), path.join(packager, 'src'), vmSource],
            loader: hostRequire.resolve('babel-loader'), options: {babelrc: false, configFile: false,
                presets: [[hostRequire.resolve('@babel/preset-env'), {targets: {ie: '11'}, modules: false}]]}},
        {test: /\.png$/, loader: hostRequire.resolve('url-loader'), options: {limit: 1000000}}
    ]},
    plugins: [new webpack.DefinePlugin({'process.env.SCAFFOLDING_BUILD_ID': JSON.stringify(buildId),
        '__TW_PLUS_PACKAGER_ASSETS__': JSON.stringify(assets), '__TW_PLUS_EXTENSION_RUNTIME__': JSON.stringify(runtime)}),
        new webpack.optimize.LimitChunkCountPlugin({maxChunks: 1})],
    node: {fs: 'empty'}
}, {hostRoot: gui});
webpack(config, (error, stats) => {
    if (error || stats.hasErrors()) {
        console.error(error || stats.toString({all: false, errors: true}));
        process.exitCode = 1;
        return;
    }
    fs.copyFileSync(path.resolve('site/plus-packager.html'), path.join(output, 'plus-packager.html'));
    console.log(path.join(output, 'plus-packager.html'));
});
