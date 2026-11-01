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
    }
    return pins;
}
export async function readPins() {
    return validatePins(JSON.parse(await fs.readFile(path.join(root, 'site/source.json'), 'utf8')));
}
export async function verifyInstalledCore(gui, pins) {
    const hostRequire = createRequire(path.join(gui, 'package.json'));
    // Read fresh bytes: preparation may have replaced the previously installed package.
    const info = JSON.parse(await fs.readFile(hostRequire.resolve(`${corePackage}/build-info`), 'utf8'));
    assert.equal(info.version, pins.coreVersion, 'Installed core version differs from the source pin');
    assert.equal(info.revision, pins.coreRevision, 'Installed core differs from the source pin');
    return {coreRevision: info.revision, coreVersion: info.version};
}
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
export async function verifyHost(gui, pins) {
    validatePins(pins);
    assert.ok(gui && path.isAbsolute(gui), 'E2E_GUI_ROOT must be an absolute GUI checkout');
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: gui, encoding: 'utf8'}).trim();
    assert.equal(revision, pins.guiRevision, 'GUI checkout differs from the source pin');
    const hostRequire = createRequire(path.join(gui, 'package.json'));
    const {coreRevision, coreVersion} = await verifyInstalledCore(gui, pins);
    const manifest = JSON.parse(await fs.readFile(path.join(gui, 'package.json'), 'utf8'));
    const securityDependency = pins.securityRevision ?
        `github:kubohiroya/turbowarp-extension-security-dialog#${pins.securityRevision}` : pins.securityVersion;
    assert.equal(manifest.dependencies[pins.securityPackage], securityDependency, 'GUI must pin the exact security package');
    if (pins.securityRevision) {
        const lock = JSON.parse(await fs.readFile(path.join(gui, 'package-lock.json'), 'utf8'));
        assert.equal(lock.packages[`node_modules/${pins.securityPackage}`].resolved,
            `git+ssh://git@github.com/kubohiroya/turbowarp-extension-security-dialog.git#${pins.securityRevision}`,
            'Installed security source differs from the source pin');
    }
    const securityEntry = hostRequire.resolve(pins.securityPackage);
    const securityManifest = JSON.parse(await fs.readFile(path.resolve(path.dirname(securityEntry), '../package.json'), 'utf8'));
    assert.equal(securityManifest.version, pins.securityVersion, 'Installed security package differs from the source pin');
    if (pins.loaderRepository) {
        const lock = JSON.parse(await fs.readFile(path.join(gui, 'package-lock.json'), 'utf8'));
        for (const [name, repository, revision] of [
            ['@kubohiroya/turbowarp-extension-loader', pins.loaderRepository, pins.loaderRevision],
            ['scratch-vm', pins.vmRepository, pins.vmRevision]
        ]) {
            assert.equal(manifest.dependencies[name], `git+https://github.com/${repository}.git#${revision}`);
            assert.equal(lock.packages[`node_modules/${name}`].resolved,
                `git+ssh://git@github.com/${repository}.git#${revision}`, `Lockfile differs for ${name}`);
        }
    }
    if (pins.documentEditorRepository) {
        await verifyDocumentEditorDependency(gui, pins);
    }
    return {revision, coreRevision, coreVersion, securityVersion: securityManifest.version};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const pins = await readPins();
    if (process.env.GITHUB_OUTPUT) {
        for (const [key, value] of Object.entries(pins)) await fs.appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
    }
    console.log(JSON.stringify(pins));
}
