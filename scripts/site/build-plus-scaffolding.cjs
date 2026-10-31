const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {createRequire} = require('node:module');
const {execFileSync} = require('node:child_process');
const gui = process.env.E2E_GUI_ROOT;
const packager = process.env.TW_PLUS_PACKAGER_ROOT;
if (!gui || !path.isAbsolute(gui) || !packager || !path.isAbsolute(packager)) {
    throw new Error('Absolute E2E_GUI_ROOT and TW_PLUS_PACKAGER_ROOT checkouts are required');
}
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: packager, encoding: 'utf8'}).trim();
if (revision !== 'c115bdf525c5f49f0fb689a21b335ccb70fc22d2') throw new Error('Unexpected Packager source revision');
if (execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', 'src', 'webpack.config.js'], {cwd: packager, encoding: 'utf8'}).trim()) {
    throw new Error('Packager source checkout must be clean');
}
const hostRequire = createRequire(path.join(gui, 'package.json'));
const webpack = hostRequire('webpack');
const vmRoot = path.dirname(hostRequire.resolve('scratch-vm/package.json'));
const vmSource = fs.realpathSync(path.join(vmRoot, 'src'));
const manager = fs.readFileSync(path.join(vmRoot, 'src/extension-support/extension-manager.js'), 'utf8');
if (!manager.includes('getExtensionServicePort ()')) throw new Error('VM extension service port patch is required');
const output = path.resolve(process.env.TW_PLUS_SCAFFOLDING_ROOT || '.host/issue-4-artifacts/scaffolding');
// The upstream inline worker loader resolves its real worker-loader at execution time.
process.env.NODE_PATH = [path.join(gui, 'node_modules'), path.resolve('node_modules'), process.env.NODE_PATH || ''].filter(Boolean).join(path.delimiter);
require('node:module').Module._initPaths();
const buildId = createHash('sha256').update(revision).update(manager).digest('hex');
class BuildIdPlugin {
    apply(compiler) {
        compiler.hooks.emit.tap('PlusScaffoldingBuildId', compilation => {
            for (const [name, asset] of Object.entries(compilation.assets)) {
                if (!name.endsWith('.js')) continue;
                const content = `${asset.source().toString()}\n// ${buildId} =^..^=`;
                compilation.assets[name] = {source: () => content, size: () => Buffer.byteLength(content)};
            }
        });
    }
}
const config = {
    mode: 'production', devtool: false, context: packager,
    entry: {'scaffolding-full': path.join(packager, 'src/scaffolding/export.js'), addons: path.join(packager, 'src/addons/index.js')},
    output: {path: output, filename: '[name].js'},
    optimization: {minimize: false},
    resolve: {modules: [path.join(gui, 'node_modules'), path.resolve('node_modules'), 'node_modules'], alias: {
        'scratch-vm$': path.join(vmRoot, 'src/index.js'),
        'check.svg$': path.join(packager, 'src/scaffolding/check.svg'),
        'text-encoding$': path.join(packager, 'src/scaffolding/text-encoding'),
        'htmlparser2$': path.join(packager, 'src/scaffolding/htmlparser2'),
        'scratch-translate-extension-languages$': path.join(packager, 'src/scaffolding/scratch-translate-extension-languages/languages.json'),
        'scratch-parser$': path.join(packager, 'src/scaffolding/scratch-parser')
    }},
    resolveLoader: {modules: [path.join(packager, 'src/build/inline-worker-loader'), path.join(gui, 'node_modules'), 'node_modules']},
    module: {rules: [
        {test: /\.jsx?$/, include: [path.join(packager, 'src'), vmSource, /node_modules[\\/]scratch-[^\\/]+[\\/]src/],
            loader: hostRequire.resolve('babel-loader'), options: {babelrc: false, configFile: false,
                presets: [[hostRequire.resolve('@babel/preset-env'), {targets: {ie: '11'}, modules: false}]]}},
        {test: /\.(svg|png|mp3)$/i, loader: hostRequire.resolve('url-loader'), options: {limit: true, esModule: false}},
        {test: /\.css$/i, use: [hostRequire.resolve('style-loader'), {loader: hostRequire.resolve('css-loader'),
            options: {modules: true, localIdentName: 'sc-[local]', camelCase: true}}]}
    ]},
    node: {fs: 'empty'},
    plugins: [new BuildIdPlugin()]
};
webpack(config, (error, stats) => {
    if (error || stats.hasErrors()) {
        console.error(error || stats.toString({all: false, errors: true}));
        process.exitCode = 1;
        return;
    }
    fs.copyFileSync(path.join(output, 'scaffolding-full.js'), path.join(output, 'scaffolding-min.js'));
    const sourceHashes = {};
    for (const name of ['scaffolding-full.js', 'scaffolding-min.js', 'addons.js']) {
        sourceHashes[name] = createHash('sha256').update(fs.readFileSync(path.join(output, name))).digest('hex');
    }
    fs.writeFileSync(path.join(output, 'build-info.json'), `${JSON.stringify({packagerRevision: revision,
        vmVersion: hostRequire('scratch-vm/package.json').version, vmManagerSha256: createHash('sha256').update(manager).digest('hex'),
        buildId, sourceHashes}, null, 2)}\n`);
    console.log(output);
});
