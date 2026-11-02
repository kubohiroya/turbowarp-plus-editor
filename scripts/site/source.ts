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
export function validatePins(pins) {
    assert.equal(pins.guiRepository, 'kubohiroya/scratch-gui');
    assert.equal(pins.coreRepository, 'kubohiroya/turbowarp-extension-data-editor');
    assert.ok(sha(pins.guiRevision) && sha(pins.coreRevision), 'Full GUI/core revisions are required');
    assert.ok(exactVersion(pins.coreVersion), 'An exact core version is required');
    assert.equal(pins.securityPackage, '@kubohiroya/turbowarp-extension-security-dialog');
    assert.match(pins.securityVersion, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    if (['documentEditorRepository', 'documentEditorRevision', 'documentEditorVersion'].some(key => pins[key] !== undefined)) {
        assert.equal(pins.documentEditorRepository, 'kubohiroya/turbowarp-document-editor');
        assert.ok(sha(pins.documentEditorRevision), 'A full document editor revision is required');
        assert.ok(exactVersion(pins.documentEditorVersion), 'An exact document editor version is required');
        assert.ok(pins.documentEditorSource === undefined || ['git', 'npm'].includes(pins.documentEditorSource),
            'Document editor source must be git or npm');
        if (pins.documentEditorSource === 'npm') {
            assert.match(pins.documentEditorIntegrity, /^sha512-[A-Za-z0-9+/]{86}==$/,
                'The published document editor integrity is required');
        }
    }
    if (pins.securityRevision !== undefined) assert.ok(sha(pins.securityRevision), 'A full security revision is required');
    if (['loaderRepository', 'loaderRevision', 'vmRepository', 'vmRevision', 'vmBaseRevision',
        'packagerRepository', 'packagerRevision'].some(key => pins[key] !== undefined)) {
        assert.equal(pins.loaderRepository, 'kubohiroya/turbowarp-extension-loader');
        assert.equal(pins.vmRepository, 'kubohiroya/scratch-vm');
        assert.equal(pins.packagerRepository, 'TurboWarp/packager');
        for (const key of ['loaderRevision', 'vmRevision', 'vmBaseRevision', 'packagerRevision']) {
            assert.ok(sha(pins[key]), `Full ${key} is required`);
        }
        // An npm loader keeps loaderRevision as the commit it was published from.
        assert.ok(pins.loaderSource === undefined || ['git', 'npm'].includes(pins.loaderSource),
            'Loader source must be git or npm');
        if (pins.loaderSource === 'npm') {
            assert.ok(exactVersion(pins.loaderVersion), 'An exact npm loader version is required');
            assert.match(pins.loaderIntegrity, /^sha512-[A-Za-z0-9+/]{86}==$/,
                'The published loader integrity is required');
        }
    }
    return pins;
}
export async function readPins() {
    return validatePins(JSON.parse(await fs.readFile(path.join(root, 'site/source.json'), 'utf8')));
}
export async function verifyInstalledCore(directory, pins) {
    const require = createRequire(path.join(directory, 'package.json'));
    // Read fresh bytes: a previous build may have left an older package in place.
    const info = JSON.parse(await fs.readFile(require.resolve(`${corePackage}/build-info`), 'utf8'));
    assert.equal(info.version, pins.coreVersion, 'Installed core version differs from the source pin');
    assert.equal(info.revision, pins.coreRevision, 'Installed core differs from the source pin');
    return {coreRevision: info.revision, coreVersion: info.version};
}
/**
 * Check one install's document editor against the pins: the manifest, the lockfile and the bytes
 * that were installed. Only this repository has that dependency now.
 */
export async function verifyDocumentEditorDependency(directory, pins) {
    const name = '@kubohiroya/turbowarp-document-editor';
    const manifest = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
    const lock = JSON.parse(await fs.readFile(path.join(directory, 'package-lock.json'), 'utf8'));
    const entry = lock.packages[`node_modules/${name}`];
    if (pins.documentEditorSource === 'npm') {
        assert.equal(manifest.dependencies[name], pins.documentEditorVersion,
            'Host must pin the exact npm document editor version');
        assert.equal(lock.packages[''].dependencies[name], pins.documentEditorVersion,
            'Root lock differs from the npm document editor pin');
        assert.equal(entry.version, pins.documentEditorVersion, 'Locked document editor version differs from the pin');
        assert.equal(entry.resolved,
            `https://registry.npmjs.org/${name}/-/turbowarp-document-editor-${pins.documentEditorVersion}.tgz`,
            'Document editor must resolve to the published npm tarball');
        assert.equal(entry.integrity, pins.documentEditorIntegrity,
            'Document editor tarball integrity differs from the source pin');
    } else {
        assert.equal(manifest.dependencies[name],
            `git+https://github.com/${pins.documentEditorRepository}.git#${pins.documentEditorRevision}`,
            'GUI must pin the shared document editor');
        assert.equal(entry.resolved,
            `git+ssh://git@github.com/${pins.documentEditorRepository}.git#${pins.documentEditorRevision}`,
            'GUI lock differs from the shared document editor pin');
    }
    const require = createRequire(path.join(directory, 'package.json'));
    const ui = JSON.parse(await fs.readFile(require.resolve(`${name}/package.json`), 'utf8'));
    assert.equal(ui.version, pins.documentEditorVersion, 'Installed document editor differs from the pin');
}
/**
 * Check one install's Loader against the pins: the manifest, the lockfile and the installed bytes.
 *
 * The GUI does not depend on the Loader any more — the side that imports it is this repository — so
 * this is pointed at whichever install owns it, the way the document editor's check is.
 */
export async function verifySecurityDependency(directory, pins) {
    const manifest = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
    const dependencies = {...manifest.dependencies, ...manifest.devDependencies};
    const expected = pins.securityRevision ?
        `github:kubohiroya/turbowarp-extension-security-dialog#${pins.securityRevision}` : pins.securityVersion;
    assert.equal(dependencies[pins.securityPackage], expected, 'Host must pin the exact security package');
    if (pins.securityRevision) {
        const lock = JSON.parse(await fs.readFile(path.join(directory, 'package-lock.json'), 'utf8'));
        assert.equal(lock.packages[`node_modules/${pins.securityPackage}`].resolved,
            `git+ssh://git@github.com/kubohiroya/turbowarp-extension-security-dialog.git#${pins.securityRevision}`,
            'Installed security source differs from the source pin');
    }
    // The package does not export its own package.json either, so read the one beside its entry.
    const require = createRequire(path.join(directory, 'package.json'));
    const installed = JSON.parse(await fs.readFile(
        path.resolve(path.dirname(require.resolve(pins.securityPackage)), '../package.json'), 'utf8'));
    assert.equal(installed.version, pins.securityVersion, 'Installed security package differs from the source pin');
    return {version: installed.version};
}

export async function verifyLoaderDependency(directory, pins) {
    const name = '@kubohiroya/turbowarp-extension-loader';
    const manifest = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
    const lock = JSON.parse(await fs.readFile(path.join(directory, 'package-lock.json'), 'utf8'));
    const entry = lock.packages[`node_modules/${name}`];
    const dependencies = {...manifest.dependencies, ...manifest.devDependencies};
    const rootLock = {...lock.packages[''].dependencies, ...lock.packages[''].devDependencies};
    if (pins.loaderSource === 'npm') {
        assert.equal(dependencies[name], pins.loaderVersion, 'Host must pin the exact npm loader version');
        assert.equal(rootLock[name], pins.loaderVersion, 'Root lock differs from the npm loader pin');
        assert.equal(entry.version, pins.loaderVersion, 'Locked loader version differs from the pin');
        assert.equal(entry.resolved,
            `https://registry.npmjs.org/${name}/-/turbowarp-extension-loader-${pins.loaderVersion}.tgz`,
            'Loader must resolve to the published npm tarball');
        assert.equal(entry.integrity, pins.loaderIntegrity, 'Loader tarball integrity differs from the source pin');
        // The loader does not export its package.json, so read the one beside its built entry.
        const require = createRequire(path.join(directory, 'package.json'));
        const installed = JSON.parse(await fs.readFile(
            path.resolve(path.dirname(require.resolve(name)), '../package.json'), 'utf8'));
        assert.equal(installed.version, pins.loaderVersion, 'Installed loader differs from the pin');
    } else {
        assert.equal(dependencies[name],
            `git+https://github.com/${pins.loaderRepository}.git#${pins.loaderRevision}`,
            'Host must pin the shared Loader');
        assert.equal(entry.resolved,
            `git+ssh://git@github.com/${pins.loaderRepository}.git#${pins.loaderRevision}`,
            `Lockfile differs for ${name}`);
    }
}
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
