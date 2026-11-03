const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const {createRequire} = Module;
const root = process.env.E2E_GUI_ROOT;
if (!root || !path.isAbsolute(root)) throw new Error('Set E2E_GUI_ROOT to the GUI checkout');
const hostRoot = path.resolve(__dirname, '../../../..');
const guiRequire = createRequire(path.join(root, 'package.json'));
const babel = guiRequire('@babel/core');
const previousJS = require.extensions['.js'];
function compile(module, filename) {
    const result = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
        filename, babelrc: false, configFile: false,
        presets: [[guiRequire.resolve('@babel/preset-env'), {targets: {node: 'current'}}],
            guiRequire.resolve('@babel/preset-react')]
    });
    module._compile(result.code, filename);
}
require.extensions['.jsx'] = compile;
require.extensions['.js'] = (module, filename) =>
    filename.startsWith(`${root}/src/`) || filename.startsWith(`${hostRoot}/site/`)
        ? compile(module, filename) : previousJS(module, filename);
require.extensions['.css'] = module => {
    module.exports = new Proxy({}, {get: (object, key) => key === '__esModule' ? false : String(key)});
};
for (const extension of ['.svg', '.png', '.jpg', '.wav', '.gif']) {
    require.extensions[extension] = (module, filename) => {module.exports = filename;};
}
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
    if (parent?.filename.startsWith(hostRoot)) {
        if (request.startsWith('../../../src/')) {
            const relative = request.slice('../../../src/'.length);
            const moved = path.join(hostRoot, 'site/gui-integration', relative);
            request = [moved, `${moved}.js`, `${moved}.jsx`].some(file => fs.existsSync(file))
                ? moved : path.join(root, 'src', relative);
        } else if (/^(?:react|react-dom|react-intl|react-redux|prop-types|scratch-vm|@babel\/core)(?:\/|$)/.test(request)) {
            return guiRequire.resolve(request);
        }
    }
    return resolve.call(this, request, parent, ...rest);
};
module.exports = {root, guiRequire};
