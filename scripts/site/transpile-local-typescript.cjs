const {transformSync} = require('esbuild');

module.exports = function (source) {
    return transformSync(source, {loader: 'ts', format: 'esm', target: 'es2017',
        sourcefile: this.resourcePath}).code;
};
