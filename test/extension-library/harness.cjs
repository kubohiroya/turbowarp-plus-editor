/**
 * Run this repository's React views under `node --test`.
 *
 * The views are built by webpack in the real editor; here they are required directly, so this
 * compiles JSX, stubs stylesheets as the class-name map css-loader would produce, and answers
 * image imports with their path. Adapted from the fork's `test/unit/extension-security/helpers.cjs`,
 * which does the same for its own `src`.
 *
 * The shared packages resolve to the pinned GUI's copies, exactly as the site build's aliases send
 * them there: React in particular has to be the one copy the editor mounts.
 */

const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const root = require('../pinned-gui.cjs')('These tests need the pinned GUI');
const guiRequire = Module.createRequire(path.join(root, 'package.json'));
const babel = guiRequire('@babel/core');
const site = path.resolve('site');

/** The packages the site build resolves to the host's copies; tests follow the build. */
const shared = new Set(['react', 'react-dom', 'prop-types', 'lodash.bindall', '@turbowarp/jszip', 'scratch-vm', 'react-intl', 'react-redux']);
// Babel turns the host's import into require(). Resolve the ESM-only vocabulary entry as webpack does.
const saveFormat = '@kubohiroya/turbowarp-sb3-save-format';
const saveFormatManifest = require.resolve(`${saveFormat}/package.json`);
const saveFormatEntry = path.resolve(path.dirname(saveFormatManifest), require(saveFormatManifest).main);
const previousLoad = Module._load;
Module._load = function (request, ...rest) {
    if (request === saveFormat) return previousLoad.call(this, saveFormatEntry, ...rest);
    // Resolved to a path first: requiring through the host's own require would come back here and
    // ask for the same name again.
    const redirected = shared.has(request) || request.startsWith('react-dom/');
    return previousLoad.call(this, redirected ? guiRequire.resolve(request) : request, ...rest);
};

const compile = (module, filename) => {
    const {code} = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
        filename, babelrc: false, configFile: false,
        presets: [[guiRequire.resolve('@babel/preset-env'), {targets: {node: 'current'}}],
            guiRequire.resolve('@babel/preset-react')]
    });
    module._compile(code, filename);
};
const previousJS = require.extensions['.js'];
require.extensions['.jsx'] = compile;
require.extensions['.js'] = (module, filename) =>
    (filename.startsWith(`${site}${path.sep}`) ? compile(module, filename) : previousJS(module, filename));
// css-loader with modules on answers with a class-name map; the names are hashed in a real build,
// so a test can only check that one was asked for, not what it was.
require.extensions['.css'] = module => {
    module.exports = new Proxy({}, {get: (object, key) => (key === '__esModule' ? false : String(key))});
};
for (const extension of ['.svg', '.png', '.jpg', '.wav', '.gif']) {
    require.extensions[extension] = (module, filename) => {
        module.exports = filename;
    };
}

module.exports = {guiRequire, root, site};
