const {transformSync}: typeof import('esbuild') = require('esbuild');

module.exports = function (this: {resourcePath: string}, source: string) {
    return transformSync(source, {loader: this.resourcePath.endsWith('.tsx') ? 'tsx' : 'ts', format: 'esm', target: 'es2017',
        sourcefile: this.resourcePath}).code;
};
