const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const {createRequire} = Module;
const root = require('../../../pinned-gui.ts').default('These tests need the pinned GUI');
const hostRoot = path.resolve(__dirname, '../../../..');
const guiRequire = createRequire(path.join(root, 'package.json'));
const babel = guiRequire('@babel/core');
const previousJS = require.extensions['.js'];
const previousTS = require.extensions['.ts'] || previousJS;
const {transformSync} = require('esbuild');
function compile(module, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const input = /\.tsx?$/.test(filename) ? transformSync(source,
        {loader: filename.endsWith('.tsx') ? 'tsx' : 'ts'}).code : source;
    const result = babel.transformSync(input, {
        filename, babelrc: false, configFile: false,
        presets: [[guiRequire.resolve('@babel/preset-env'), {targets: {node: 'current'}}],
            guiRequire.resolve('@babel/preset-react')]
    });
    module._compile(result.code, filename);
}
require.extensions['.jsx'] = compile;
require.extensions['.tsx'] = compile;
require.extensions['.ts'] = (module, filename) =>
    filename.startsWith(`${hostRoot}/site/`) ? compile(module, filename) : previousTS(module, filename);
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
    const filename = parent?.filename || '';
    // Do not redirect the GUI's own resolver when its checkout lives inside this repository.
    if (filename.startsWith(`${hostRoot}/site/`) || filename.startsWith(`${hostRoot}/test/`)) {
        if (request.startsWith('../../../src/')) {
            const relative = request.slice('../../../src/'.length);
            const moved = path.join(hostRoot, 'site/gui-integration', relative);
            const withoutExtension = moved.replace(/\.jsx?$/, '');
            request = [moved, `${withoutExtension}.ts`, `${withoutExtension}.tsx`].find(file => fs.existsSync(file))
                || path.join(root, 'src', relative);
        } else if (/^(?:react|react-dom|react-intl|react-redux|prop-types|scratch-vm|@babel\/core)(?:\/|$)/.test(request)) {
            return guiRequire.resolve(request);
        }
    }
    return resolve.call(this, request, parent, ...rest);
};
module.exports = {root, guiRequire};
