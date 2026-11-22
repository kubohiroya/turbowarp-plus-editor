import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const sha = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
export const exactVersion = value => typeof value === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value);
export const corePackage = '@kubohiroya/turbowarp-extension-data-editor';
const require = createRequire(import.meta.url);
const {readPinsSync, npmPackages} = require('./locked-pins.cts') as {
    readPinsSync: (directory?: string) => Record<string, any>;
    npmPackages: Record<string, {name: string; repository: string}>;
};
const integrity = value => typeof value === 'string' && /^sha512-[A-Za-z0-9+/]{86}==$/.test(value);
/**
 * Check the merged pins: the git inputs of `site/source.json` and the npm pins read from the lockfile.
 * The npm packages carry no revision of their own; the core's comes from its installed build-info.
 */
export function validatePins(pins) {
    assert.equal(pins.guiRepository, 'kubohiroya/scratch-gui');
    assert.ok(sha(pins.guiRevision), 'A full GUI revision is required');
    assert.equal(pins.vmRepository, 'kubohiroya/scratch-vm');
    assert.equal(pins.packagerRepository, 'TurboWarp/packager');
    for (const key of ['vmRevision', 'vmBaseRevision', 'packagerRevision']) assert.ok(sha(pins[key]), `Full ${key} is required`);
    for (const [key, {name, repository}] of Object.entries(npmPackages)) {
        assert.equal(pins[`${key}Repository`], repository, `${name} comes from another repository`);
        assert.ok(exactVersion(pins[`${key}Version`]), `An exact ${name} version is required`);
        assert.ok(integrity(pins[`${key}Integrity`]), `The published ${name} integrity is required`);
        assert.equal(pins[`${key}Source`], 'npm', `${name} must be installed from npm`);
    }
    assert.equal(pins.securityPackage, npmPackages.security.name);
    if (pins.coreRevision !== undefined) assert.ok(sha(pins.coreRevision), 'A full core revision is required');
    return pins;
}
export async function readPins(directory = root) {
    return validatePins(readPinsSync(directory));
}
/** The installed copy of one family package. Several export no package.json, so read it by path. */
async function installedManifest(directory, name) {
    return JSON.parse(await fs.readFile(path.join(directory, 'node_modules', name, 'package.json'), 'utf8'));
}
/**
 * Check that `directory` declares, locks and installed the npm version the pins name. The version and
 * integrity are the lockfile's own, so this is what catches a manifest or an install that drifted.
 */
async function verifyNpmDependency(directory, pins, key) {
    const {name} = npmPackages[key];
    const version = pins[`${key}Version`];
    const manifest = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
    const declared = {...manifest.dependencies, ...manifest.devDependencies};
    assert.equal(declared[name], version, `Host must pin the exact npm version of ${name}`);
    const lock = JSON.parse(await fs.readFile(path.join(directory, 'package-lock.json'), 'utf8'));
    const entry = lock.packages[`node_modules/${name}`];
    assert.equal(entry?.version, version, `Locked ${name} version differs from the pin`);
    assert.equal(entry.integrity, pins[`${key}Integrity`], `${name} tarball integrity differs from the pin`);
    assert.equal((await installedManifest(directory, name)).version, version, `Installed ${name} differs from the pin`);
    return {version};
}
export async function verifyInstalledCore(directory, pins) {
    await verifyNpmDependency(directory, pins, 'core');
    const resolve = createRequire(path.join(directory, 'package.json')).resolve;
    // Read the bytes instead of importing them, so a second check in one process is not cached.
    const info = JSON.parse(await fs.readFile(resolve(`${corePackage}/build-info`), 'utf8'));
    assert.equal(info.version, pins.coreVersion, 'Installed core version differs from the lock');
    assert.ok(sha(info.revision), 'The installed core must record its full revision');
    return {coreRevision: info.revision, coreVersion: info.version};
}
export const verifyDocumentEditorDependency = (directory, pins) => verifyNpmDependency(directory, pins, 'documentEditor');
export const verifySecurityDependency = (directory, pins) => verifyNpmDependency(directory, pins, 'security');
export const verifyLoaderDependency = (directory, pins) => verifyNpmDependency(directory, pins, 'loader');
export const verifyScriptTransferDependency = (directory, pins) => verifyNpmDependency(directory, pins, 'scriptTransfer');

export async function verifyHost(gui, pins) {
    validatePins(pins);
    assert.ok(gui && path.isAbsolute(gui), 'E2E_GUI_ROOT must be an absolute GUI checkout');
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: gui, encoding: 'utf8'}).trim();
    assert.equal(revision, pins.guiRevision, 'GUI checkout differs from the source pin');
    // The core is not the GUI's dependency any more either: `build.ts` verifies the copy this
    // repository installs, which is the one its modules import.
    const manifest = JSON.parse(await fs.readFile(path.join(gui, 'package.json'), 'utf8'));
    if (pins.loaderRepository) {
        // The VM is still the GUI's own dependency. The Loader is not: `build.ts` checks it against
        // this repository's install, which is the side that imports it.
        const lock = JSON.parse(await fs.readFile(path.join(gui, 'package-lock.json'), 'utf8'));
        const name = 'scratch-vm';
        assert.equal(manifest.dependencies[name],
            `git+https://github.com/${pins.vmRepository}.git#${pins.vmRevision}`);
        assert.equal(lock.packages[`node_modules/${name}`].resolved,
            `git+ssh://git@github.com/${pins.vmRepository}.git#${pins.vmRevision}`, `Lockfile differs for ${name}`);
    }
    // None of the family packages is the GUI's dependency any more: the side that imports them is
    // this repository, so `build.ts` verifies each against this repository's own manifest, lock and
    // installed bytes. What is left here is the GUI's own: its revision and its VM.
    return {revision};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const pins = await readPins();
    if (process.env.GITHUB_OUTPUT) {
        for (const [key, value] of Object.entries(pins)) await fs.appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
    }
    console.log(JSON.stringify(pins));
}
