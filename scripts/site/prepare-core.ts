import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {root, corePackage, readPins, validatePins, verifyInstalledCore} from './source.ts';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readJSON = async filename => JSON.parse(await fs.readFile(filename, 'utf8'));
const exists = async filename => fs.lstat(filename).then(() => true, error => {
    if (error.code === 'ENOENT') return false;
    throw error;
});

async function packageHash(directory) {
    const digest = createHash('sha256');
    async function visit(relative) {
        const entries = await fs.readdir(path.join(directory, relative), {withFileTypes: true});
        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            if (entry.name === 'node_modules') continue;
            const name = path.join(relative, entry.name);
            if (entry.isDirectory()) await visit(name);
            else {
                assert.ok(entry.isFile(), `Unsupported core package entry: ${name}`);
                digest.update(name + '\0');
                digest.update(await fs.readFile(path.join(directory, name)));
                digest.update('\0');
            }
        }
    }
    await visit('');
    return digest.digest('hex');
}

/** Copy only the fixed root package; retain the GUI's installed dependency graph. */
export async function prepareCore(gui, pins, {sourceRoot = root, copyPackage = fs.cp} = {}) {
    validatePins(pins);
    assert.ok(gui && path.isAbsolute(gui), 'E2E_GUI_ROOT must be an absolute GUI checkout');
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: gui, encoding: 'utf8'}).trim();
    assert.equal(revision, pins.guiRevision, 'GUI checkout differs from the source pin');
    const filenames = ['package.json', 'package-lock.json'];
    const before = await Promise.all(filenames.map(name => fs.readFile(path.join(gui, name))));
    const verifyDeclarations = async () => {
        for (const [index, name] of filenames.entries()) {
            assert.ok(before[index].equals(await fs.readFile(path.join(gui, name))),
                `Core preparation changed the GUI ${name}`);
        }
    };
    assert.ok(path.isAbsolute(sourceRoot), 'The root package checkout must be absolute');
    const rootManifest = await readJSON(path.join(sourceRoot, 'package.json'));
    const declarations = ['dependencies', 'devDependencies'].flatMap(key =>
        rootManifest[key]?.[corePackage] === undefined ? [] : [rootManifest[key][corePackage]]);
    assert.ok(declarations.length && declarations.every(value => value === pins.coreVersion),
        'The root must declare the exact pinned core version');
    const core = await verifyInstalledCore(sourceRoot, pins);
    const sourceRequire = createRequire(path.join(sourceRoot, 'package.json'));
    const source = path.resolve(path.dirname(sourceRequire.resolve(`${corePackage}/build-info`)), '..');
    const target = path.join(gui, 'node_modules', corePackage);
    assert.notEqual(await fs.realpath(source), await fs.realpath(target), 'Core source and GUI target must differ');
    assert.ok((await fs.lstat(target)).isDirectory(), 'The GUI core must be an installed package directory');
    const sourceManifest = await readJSON(path.join(source, 'package.json'));
    const targetManifest = await readJSON(path.join(target, 'package.json'));
    assert.equal(sourceManifest.name, corePackage);
    assert.equal(targetManifest.name, corePackage);
    assert.equal(sourceManifest.version, pins.coreVersion);
    for (const key of ['dependencies', 'optionalDependencies', 'peerDependencies', 'peerDependenciesMeta']) {
        assert.deepEqual(sourceManifest[key] || {}, targetManifest[key] || {},
            `Core ${key} differ; the fixed GUI dependency graph cannot be reused`);
    }
    const sourceSha256 = await packageHash(source);
    const staging = await fs.mkdtemp(`${target}.prepare-`);
    const backup = `${staging}.previous`;
    let swapped = false, installed = false, movedDependencies = false;
    try {
        await copyPackage(source, staging, {recursive: true,
            filter: filename => path.basename(filename) !== 'node_modules'});
        assert.equal(await packageHash(staging), sourceSha256, 'Copied core differs from the fixed root package');
        await verifyDeclarations();
        await fs.rename(target, backup);
        swapped = true;
        if (await exists(path.join(backup, 'node_modules'))) {
            await fs.rename(path.join(backup, 'node_modules'), path.join(staging, 'node_modules'));
            movedDependencies = true;
        }
        await fs.rename(staging, target);
        installed = true;
        await verifyInstalledCore(gui, pins);
        assert.equal(await packageHash(target), sourceSha256, 'Prepared core differs from the fixed root package');
        await verifyDeclarations();
    } catch (error) {
        if (installed) await fs.rename(target, staging);
        if (movedDependencies) await fs.rename(path.join(staging, 'node_modules'), path.join(backup, 'node_modules'));
        if (swapped) await fs.rename(backup, target);
        throw error;
    } finally {
        await fs.rm(staging, {recursive: true, force: true});
    }
    await fs.rm(backup, {recursive: true, force: true});
    return {guiRevision: revision, ...core, method: 'copy-fixed-root-core',
        source, target, sourceSha256, targetSha256: sourceSha256, previousVersion: targetManifest.version,
        retainedNestedDependencies: movedDependencies,
        guiDependencyDeclarationsUnchanged: true,
        guiDependencyHashes: Object.fromEntries(filenames.map((name, index) => [name, hash(before[index])]))};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    console.log(JSON.stringify(await prepareCore(process.env.E2E_GUI_ROOT, await readPins())));
}
