const path = require('node:path');
const {createRequire} = require('node:module');
const config = require('../../scripts/site/webpack.config.cts');
const guiRequire = createRequire(path.join(process.env.E2E_GUI_ROOT, 'package.json'));
const HtmlWebpackPlugin = guiRequire('html-webpack-plugin');
const popup = path.resolve(__dirname, '../../site/editor-views');

config.entry = {editor: config.entry.editor, 'code-popout': path.join(popup, 'code-popout.tsx')};
config.resolve.modules = [path.join(process.env.E2E_GUI_ROOT, 'node_modules'), 'node_modules'];
config.plugins = config.plugins.filter(plugin =>
    !(plugin instanceof HtmlWebpackPlugin) || plugin.options.filename === 'editor.html');
config.plugins.push(new HtmlWebpackPlugin({
    chunks: ['code-popout'], filename: 'code-popout.html', template: path.join(popup, 'code-popout.html')
}));
module.exports = config;
