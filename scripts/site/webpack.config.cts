const path = require('node:path');
const fs = require('node:fs');
const {createRequire} = require('node:module');
if (!process.env.E2E_GUI_ROOT || !path.isAbsolute(process.env.E2E_GUI_ROOT)) throw new Error('An absolute GUI checkout is required');
// The host owns its application configuration; the site selects only its browser build.
const gui = process.env.E2E_GUI_ROOT;
const config = require(path.join(gui, 'webpack.config.js'))[0];
const hostRequire = createRequire(path.join(gui, 'package.json'));
const localCatalogFile = process.env.TW_PLUS_LOCAL_CATALOG_INPUT;
let localCatalog = null;
if (localCatalogFile) {
    if (!path.isAbsolute(localCatalogFile) || process.env.TW_PLUS_CATALOG_PREVIEW !== '1') {
        throw new Error('Local catalog input is supported only by the explicit preview build');
    }
    localCatalog = JSON.parse(fs.readFileSync(localCatalogFile, 'utf8'));
}
config.plugins.push(new (hostRequire('webpack').DefinePlugin)({
    __TW_PLUS_LOCAL_CATALOG__: JSON.stringify(localCatalog)
}));
// Also transpile a local VM source checkout used by integration previews.
const vmSource = fs.realpathSync(path.join(path.dirname(hostRequire.resolve('scratch-vm/package.json')), 'src'));
if (!vmSource.includes(`${path.sep}node_modules${path.sep}`)) {
    config.module.rules.push({test: /\.jsx?$/, include: [vmSource], loader: hostRequire.resolve('babel-loader'),
        options: {babelrc: false, configFile: false,
            presets: [[hostRequire.resolve('@babel/preset-env'), {targets: {ie: '11'}, modules: false}]]}});
}
module.exports = config;
