import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {
    readPins, root, validatePins, verifyDocumentEditorDependency, verifyHost, verifyInstalledCore,
    verifyLoaderDependency, verifyScriptTransferDependency, verifySecurityDependency
} from '../scripts/site/source.ts';

const packages = {
    core: '@kubohiroya/turbowarp-extension-data-editor',
    security: '@kubohiroya/turbowarp-extension-security-dialog',
    loader: '@kubohiroya/turbowarp-extension-loader',
    documentEditor: '@kubohiroya/turbowarp-document-editor',
    scriptTransfer: '@kubohiroya/turbowarp-script-transfer',
};
const integrity = (fill: number) => 'sha512-' + Buffer.alloc(64, fill).toString('base64');
const tarball = (name: string, version: string) => `https://registry.npmjs.org/${name}/-/${name.split('/')[1]}-${version}.tgz`;
const writeJSON = (filename: string, value: unknown) => fs.writeFile(filename, JSON.stringify(value));

/** An install that declares, locks and installed every family package at version 1.2.3. */
async function fixture() {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'twplus-npm-pins-'));
    const manifest: {dependencies: Record<string, string>} = {dependencies: {}};
    const lock: {packages: Record<string, Record<string, string>>} = {packages: {'': {}}};
    let fill = 1;
    for (const name of Object.values(packages)) {
        manifest.dependencies[name] = '1.2.3';
        lock.packages[`node_modules/${name}`] = {version: '1.2.3', resolved: tarball(name, '1.2.3'), integrity: integrity(fill++)};
        const installed = path.join(directory, 'node_modules', name);
        await fs.mkdir(path.join(installed, 'dist'), {recursive: true});
        await writeJSON(path.join(installed, 'package.json'), {name, version: '1.2.3',
            exports: name === packages.core ? {'./build-info': './dist/build-info.json'} : {'.': './dist/index.js'}});
    }
    await writeJSON(path.join(directory, 'node_modules', packages.core, 'dist/build-info.json'),
        {version: '1.2.3', revision: 'b'.repeat(40)});
    const save = async () => {
        await writeJSON(path.join(directory, 'package.json'), manifest);
        await writeJSON(path.join(directory, 'package-lock.json'), lock);
    };
    await save();
    return {directory, manifest, lock, save};
}

test('npm family pins come from the lockfile, not from site/source.json', async () => {
    const source = JSON.parse(await fs.readFile(path.join(root, 'site/source.json'), 'utf8'));
    for (const key of Object.keys(packages)) {
        for (const field of ['Version', 'Integrity', 'Revision', 'Source']) {
            assert.equal(source[`${key}${field}`], undefined, `site/source.json repeats ${key}${field}`);
        }
    }
    const {directory} = await fixture();
    try {
        const pins = await readPins(directory);
        for (const key of Object.keys(packages)) {
            assert.equal(pins[`${key}Version`], '1.2.3');
            assert.equal(pins[`${key}Source`], 'npm');
        }
        assert.equal(pins.loaderIntegrity, integrity(3));
        // The core records its own revision; it is read from the installed bytes.
        assert.equal(pins.coreRevision, 'b'.repeat(40));
        assert.equal(pins.guiRevision, source.guiRevision);
        assert.deepEqual(await verifyInstalledCore(directory, pins), {coreRevision: 'b'.repeat(40), coreVersion: '1.2.3'});
        for (const verify of [verifySecurityDependency, verifyLoaderDependency, verifyDocumentEditorDependency,
            verifyScriptTransferDependency]) await verify(directory, pins);
    } finally {
        await fs.rm(directory, {recursive: true, force: true});
    }
});

test('a lock entry that is not a published npm tarball is rejected', async () => {
    const {directory, lock, save} = await fixture();
    try {
        const entry = lock.packages[`node_modules/${packages.loader}`];
        entry.resolved = 'git+ssh://git@github.com/kubohiroya/turbowarp-extension-loader.git#' + 'c'.repeat(40);
        await save();
        await assert.rejects(readPins(directory), /must resolve to its published npm tarball/);
        entry.resolved = tarball(packages.loader, '1.2.3');
        delete entry.integrity;
        await save();
        await assert.rejects(readPins(directory), /no sha512 integrity/);
    } finally {
        await fs.rm(directory, {recursive: true, force: true});
    }
});

test('a manifest or an install that drifted from the lock is rejected', async () => {
    const {directory, manifest, save} = await fixture();
    try {
        const pins = await readPins(directory);
        manifest.dependencies[packages.loader] = '^1.2.3';
        await save();
        await assert.rejects(verifyLoaderDependency(directory, pins), /exact npm version/);
        manifest.dependencies[packages.loader] = '1.2.3';
        await save();
        await writeJSON(path.join(directory, 'node_modules', packages.scriptTransfer, 'package.json'),
            {name: packages.scriptTransfer, version: '1.2.2'});
        await assert.rejects(verifyScriptTransferDependency(directory, pins), /Installed .* differs/);
        await writeJSON(path.join(directory, 'node_modules', packages.core, 'dist/build-info.json'),
            {version: '1.2.2', revision: 'b'.repeat(40)});
        await assert.rejects(verifyInstalledCore(directory, pins), /core version differs/);
        await assert.rejects(verifySecurityDependency(directory, {...pins, securityIntegrity: integrity(9)}),
            /integrity differs/);
    } finally {
        await fs.rm(directory, {recursive: true, force: true});
    }
});

test('the merged pins still require full git revisions and exact npm versions', async () => {
    const pins = await readPins();
    assert.deepEqual(validatePins({...pins}), pins);
    for (const patch of [{guiRevision: 'main'}, {vmRevision: 'develop'}, {packagerRevision: 'latest'},
        {coreRevision: 'abc123'}, {coreVersion: '^0.6.0'}, {loaderIntegrity: 'unknown'}, {loaderSource: 'git'},
        {guiRepository: 'other/host'}, {coreRepository: 'other/core'}, {securityPackage: 'other-package'}]) {
        assert.throws(() => validatePins({...pins, ...patch}), JSON.stringify(patch));
    }
});

test('the GUI checkout is checked against its revision and its VM', async () => {
    const gui = await fs.mkdtemp(path.join(os.tmpdir(), 'twplus-gui-pin-'));
    try {
        execFileSync('git', ['init', '--quiet', gui]);
        execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test',
            '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', 'fixture'], {cwd: gui});
        const pins = {...await readPins(), guiRevision: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: gui, encoding: 'utf8'}).trim()};
        const vm = `${pins.vmRepository}.git#${pins.vmRevision}`;
        await writeJSON(path.join(gui, 'package.json'), {dependencies: {'scratch-vm': `git+https://github.com/${vm}`}});
        await writeJSON(path.join(gui, 'package-lock.json'),
            {packages: {'node_modules/scratch-vm': {resolved: `git+ssh://git@github.com/${vm}`}}});
        assert.deepEqual(await verifyHost(gui, pins), {revision: pins.guiRevision});
        await assert.rejects(verifyHost(gui, {...pins, guiRevision: 'a'.repeat(40)}), /GUI checkout differs/);
        await writeJSON(path.join(gui, 'package-lock.json'),
            {packages: {'node_modules/scratch-vm': {resolved: 'git+ssh://git@github.com/other/vm.git#' + pins.vmRevision}}});
        await assert.rejects(verifyHost(gui, pins), /Lockfile differs for scratch-vm/);
    } finally {
        await fs.rm(gui, {recursive: true, force: true});
    }
});
