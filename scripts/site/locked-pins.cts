/**
 * The site's pins, read from where each one is actually decided.
 *
 * `site/source.json` holds only the inputs npm cannot describe: the GUI, VM and packager git
 * revisions and the Kamishibai preview CSS. Every family package the site installs from npm is
 * pinned by `package.json` and `package-lock.json` already, so its version and tarball integrity
 * are read from the lockfile here instead of being copied into `site/source.json`, where every
 * dependency update had to be repeated by hand and a missed copy failed the build.
 *
 * The publishing commit of an npm package is not repeated either: the version and integrity
 * identify the tarball, and the family publishes each version from its `v<version>` tag with npm
 * provenance. The core and the review dialog ship their own build-info, so their revisions are
 * read from the installed bytes when an install is present.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const registry = 'https://registry.npmjs.org/';
const npmPackages: Record<string, {name: string; repository: string}> = {
    core: {name: '@kubohiroya/turbowarp-extension-data-editor', repository: 'kubohiroya/turbowarp-extension-data-editor'},
    security: {name: '@kubohiroya/turbowarp-extension-security-dialog', repository: 'kubohiroya/turbowarp-extension-security-dialog'},
    loader: {name: '@kubohiroya/turbowarp-extension-loader', repository: 'kubohiroya/turbowarp-extension-loader'},
    documentEditor: {name: '@kubohiroya/turbowarp-document-editor', repository: 'kubohiroya/turbowarp-document-editor'},
    scriptTransfer: {name: '@kubohiroya/turbowarp-script-transfer', repository: 'kubohiroya/turbowarp-script-transfer'},
};

function readJSON(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** The lockfile entry of one family package, which must be a published npm tarball. */
function lockedPackage(lock, name) {
    const entry = lock.packages[`node_modules/${name}`];
    if (!entry) throw new Error(`${name} is not in package-lock.json`);
    const tarball = `${registry}${name}/-/${name.split('/')[1]}-${entry.version}.tgz`;
    if (entry.resolved !== tarball) {
        throw new Error(`${name} must resolve to its published npm tarball, not ${entry.resolved}`);
    }
    if (!/^sha512-[A-Za-z0-9+/]{86}==$/.test(entry.integrity || '')) {
        throw new Error(`${name} has no sha512 integrity in package-lock.json`);
    }
    return entry;
}

/** The revision a package's own build-info records, when it is installed and ships one. */
function installedRevision(directory, name) {
    const file = path.join(directory, 'node_modules', name, 'dist/build-info.json');
    if (!fs.existsSync(file)) return undefined;
    return readJSON(file).revision;
}

function readLockedPins(directory = root) {
    const lock = readJSON(path.join(directory, 'package-lock.json'));
    const pins: Record<string, string> = {};
    for (const [key, {name, repository}] of Object.entries(npmPackages)) {
        const entry = lockedPackage(lock, name);
        pins[`${key}Repository`] = repository;
        pins[`${key}Version`] = entry.version;
        pins[`${key}Integrity`] = entry.integrity;
        pins[`${key}Source`] = 'npm';
    }
    pins.securityPackage = npmPackages.security.name;
    const coreRevision = installedRevision(directory, npmPackages.core.name);
    if (coreRevision !== undefined) pins.coreRevision = coreRevision;
    return pins;
}

/** `site/source.json` merged with the npm pins of the lockfile in `directory`. */
function readPinsSync(directory = root) {
    return {...readJSON(path.join(root, 'site/source.json')), ...readLockedPins(directory)};
}

module.exports = {root, npmPackages, readLockedPins, readPinsSync};
