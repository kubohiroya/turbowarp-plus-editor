const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');

const {E2E_GUI_ROOT, TW_PLUS_DESKTOP_SOURCE} = process.env;
if (!TW_PLUS_DESKTOP_SOURCE || !path.isAbsolute(TW_PLUS_DESKTOP_SOURCE)) {
    throw new Error('Set TW_PLUS_DESKTOP_SOURCE to the pinned official Desktop checkout');
}
const desktop = path.join(TW_PLUS_DESKTOP_SOURCE, 'src-renderer-webpack');
const editor = path.join(desktop, 'editor/gui');
const config = require('../site/webpack.config.cts');
const guiRequire = createRequire(path.join(E2E_GUI_ROOT, 'package.json'));
const HtmlWebpackPlugin = guiRequire('html-webpack-plugin');
const template = fs.readFileSync(path.join(editor, 'gui.html'), 'utf8');
const oldEntry = '<script src="index.js" onerror="webpackScriptError(event)"></script>';
if (!template.includes(oldEntry)) throw new Error('Desktop editor template has changed');

config.entry = {editor: path.join(editor, 'index.jsx'), 'backpack-popout': config.entry['backpack-popout'],
    'stage-popout': config.entry['stage-popout']};
config.resolve.modules = [path.join(E2E_GUI_ROOT, 'node_modules'), 'node_modules'];
config.resolve.alias['scratch-gui$'] = path.join(E2E_GUI_ROOT, 'src/index.js');
config.resolve.alias['scratch-gui'] = E2E_GUI_ROOT;
config.resolve.alias['@tw-plus/backpack-window-host$'] = path.join(__dirname, 'open-backpack-window.js');
config.module.rules.push({
    test: /\.jsx?$/,
    include: [desktop, __dirname],
    loader: guiRequire.resolve('babel-loader'),
    options: {
        babelrc: false,
        configFile: false,
        presets: [[guiRequire.resolve('@babel/preset-env'), {modules: false}], guiRequire.resolve('@babel/preset-react')]
    }
});
config.plugins = config.plugins.filter(plugin =>
    !(plugin instanceof HtmlWebpackPlugin) || ['backpack-popout.html', 'stage-popout.html'].includes(plugin.options.filename)
);
for (const [id, title] of [['sprite-properties', 'Sprite properties'], ['sprite-list', 'Sprite list']]) {
    config.plugins.push(new HtmlWebpackPlugin({
        chunks: ['stage-popout'],
        filename: `${id}-popout.html`,
        template: path.join(__dirname, '../../site/editor-layout/stage-popout.html'),
        title
    }));
}
config.plugins.push(new HtmlWebpackPlugin({
    chunks: ['editor'],
    filename: 'gui.html',
    templateContent: template.replace(oldEntry, '')
}));
module.exports = config;
