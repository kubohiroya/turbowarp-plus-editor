import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const sha = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
export function validatePins(pins) {
    assert.equal(pins.guiRepository, 'kubohiroya/scratch-gui');
    assert.equal(pins.coreRepository, 'kubohiroya/turbowarp-extension-data-editor');
    assert.ok(sha(pins.guiRevision) && sha(pins.coreRevision), 'Full GUI/core revisions are required');
    assert.equal(pins.securityPackage, '@kubohiroya/turbowarp-extension-security-dialog');
    assert.match(pins.securityVersion, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
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
export async function verifyHost(gui, pins) {
    assert.ok(gui && path.isAbsolute(gui), 'E2E_GUI_ROOT must be an absolute GUI checkout');
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: gui, encoding: 'utf8'}).trim();
    assert.equal(revision, pins.guiRevision, 'GUI checkout differs from the source pin');
    const hostRequire = createRequire(path.join(gui, 'package.json'));
    const {revision: coreRevision} = hostRequire('@kubohiroya/turbowarp-extension-data-editor/build-info');
    assert.equal(coreRevision, pins.coreRevision, 'Installed core differs from the source pin');
    const manifest = JSON.parse(await fs.readFile(path.join(gui, 'package.json'), 'utf8'));
    assert.equal(manifest.dependencies[pins.securityPackage], pins.securityVersion, 'GUI must pin the exact security package');
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
    return {revision, coreRevision, securityVersion: securityManifest.version};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const pins = await readPins();
    if (process.env.GITHUB_OUTPUT) {
        for (const [key, value] of Object.entries(pins)) await fs.appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
    }
    console.log(JSON.stringify(pins));
}
