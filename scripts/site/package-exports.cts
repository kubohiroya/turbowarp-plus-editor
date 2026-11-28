const fs: typeof import('node:fs') = require('node:fs');
const path: typeof import('node:path') = require('node:path');

/**
 * The installed directory of a package. A package that exports neither `./package.json` nor an entry
 * CommonJS can resolve (only `import`) is found the way Node would look for it, by its folder.
 */
function packageDirectory(resolve: NodeJS.Require, name: string) {
    try { return path.dirname(resolve.resolve(`${name}/package.json`)); }
    catch { /* not exported */ }
    try { return path.resolve(path.dirname(resolve.resolve(name)), '..'); }
    catch { /* no CommonJS entry */ }
    for (const modules of resolve.resolve.paths(name) ?? []) {
        if (fs.existsSync(path.join(modules, name, 'package.json'))) return path.join(modules, name);
    }
    throw new Error(`Cannot find the package ${name}`);
}

/** Resolve public browser entries for webpack 4, which predates package exports. */
function packageExportAliases(resolve: NodeJS.Require, names: readonly string[]) {
    const aliases: Record<string, string> = {};
    for (const name of names) {
        const directory = packageDirectory(resolve, name);
        const manifest = path.join(directory, 'package.json');
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
module.exports = {packageDirectory, packageExportAliases, installPackageExports};
