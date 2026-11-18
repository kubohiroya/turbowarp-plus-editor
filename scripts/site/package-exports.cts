const fs: typeof import('node:fs') = require('node:fs');
const path: typeof import('node:path') = require('node:path');

/** Resolve public browser entries for webpack 4, which predates package exports. */
function packageExportAliases(resolve: NodeJS.Require, names: readonly string[]) {
    const aliases: Record<string, string> = {};
    for (const name of names) {
        let manifest: string;
        try { manifest = resolve.resolve(`${name}/package.json`); }
        catch { manifest = path.resolve(path.dirname(resolve.resolve(name)), '../package.json'); }
        const directory = path.dirname(manifest);
        const {exports} = JSON.parse(fs.readFileSync(manifest, 'utf8'));
        for (const [subpath, value] of Object.entries(exports) as [string, string | Record<string, string>][]) {
            const target = typeof value === 'string' ? value : value.import || value.default || value.require;
            if (!target) continue;
            aliases[`${name}${subpath === '.' ? '' : subpath.slice(1)}$`] = path.resolve(directory, target);
        }
    }
    return aliases;
}

function installPackageExports(config: {resolve: {alias: Record<string, string>}}, resolve: NodeJS.Require, names: readonly string[]) {
    for (const name of names) delete config.resolve.alias[name];
    Object.assign(config.resolve.alias, packageExportAliases(resolve, names));
}
module.exports = {packageExportAliases, installPackageExports};
