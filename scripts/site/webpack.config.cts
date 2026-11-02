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
// Fill the fork's Plus integration socket from this repository. The fork's own module is empty,
// so a pin without the socket would leave this silently inert: fail instead of building a bundle
// that looks wired and is not.
const socket = path.join(gui, 'src', 'lib', 'tw-plus-integration.js');
if (!fs.existsSync(socket)) throw new Error('The pinned GUI has no Plus integration socket to fill');
config.plugins.push(new (hostRequire('webpack').NormalModuleReplacementPlugin)(
    /[\\/]src[\\/]lib[\\/]tw-plus-integration\.js$/,
    path.join(__dirname, '..', '..', 'site', 'plus-integration.js')
));
// Resolve React to the host's copy, once.
//
// A module this repository supplies is resolved from here, so `react` would come from this
// repository's node_modules: React 18 against the host's 16 at the time of writing. Two copies in
// one bundle break what they are for — hooks throw and context does not cross between them — and
// the host's tree is the one that mounts. Fail loudly if the copy is missing rather than silently
// bundling a second one.
for (const name of ['react', 'react-dom']) {
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
const siteSource = path.join(__dirname, '..', '..', 'site');
config.module.rules.push({test: /\.js$/, include: [siteSource], loader: hostRequire.resolve('babel-loader'),
    options: {babelrc: false, configFile: false,
        presets: [[hostRequire.resolve('@babel/preset-env'), {targets: {ie: '11'}, modules: false}]]}});
// Also transpile a local VM source checkout used by integration previews.
const vmSource = fs.realpathSync(path.join(path.dirname(hostRequire.resolve('scratch-vm/package.json')), 'src'));
if (!vmSource.includes(`${path.sep}node_modules${path.sep}`)) {
    config.module.rules.push({test: /\.jsx?$/, include: [vmSource], loader: hostRequire.resolve('babel-loader'),
        options: {babelrc: false, configFile: false,
            presets: [[hostRequire.resolve('@babel/preset-env'), {targets: {ie: '11'}, modules: false}]]}});
}
module.exports = config;
