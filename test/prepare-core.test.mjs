import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {prepareCore} from '../scripts/site/prepare-core.mjs';
import {corePackage, verifyInstalledCore} from '../scripts/site/source.mjs';

async function fixture() {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'twpe-core-copy-'));
    const gui = path.join(directory, 'gui'), sourceRoot = path.join(directory, 'editor');
    await fs.mkdir(gui);
    await fs.mkdir(sourceRoot);
    await fs.writeFile(path.join(gui, 'package.json'), JSON.stringify({private: true,
        dependencies: {[corePackage]: '^0.5.0'}}));
    await fs.writeFile(path.join(gui, 'package-lock.json'), JSON.stringify({lockfileVersion: 3, packages: {}}));
    await fs.writeFile(path.join(sourceRoot, 'package.json'), JSON.stringify({private: true,
        devDependencies: {[corePackage]: '0.6.0'}}));
    const git = args => execFileSync('git', args, {cwd: gui, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
    git(['init']);
    git(['add', 'package.json', 'package-lock.json']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture']);
    const pins = {guiRepository: 'kubohiroya/scratch-gui', guiRevision: git(['rev-parse', 'HEAD']),
        coreRepository: 'kubohiroya/turbowarp-extension-data-editor', coreRevision: 'a'.repeat(40),
        coreVersion: '0.6.0', securityPackage: '@kubohiroya/turbowarp-extension-security-dialog', securityVersion: '0.3.3'};
    const source = path.join(sourceRoot, 'node_modules', corePackage), target = path.join(gui, 'node_modules', corePackage);
    const manifest = version => ({name: corePackage, version, exports: {'./build-info': './dist/build-info.json'},
        dependencies: {ajv: '^8.20.0'}, peerDependencies: {react: '^16.14.0 || ^17 || ^18'},
        peerDependenciesMeta: {react: {optional: true}}});
    for (const [name, version, revision] of [[source, '0.6.0', pins.coreRevision], [target, '0.5.0', 'b'.repeat(40)]]) {
        await fs.mkdir(path.join(name, 'dist'), {recursive: true});
        await fs.writeFile(path.join(name, 'package.json'), JSON.stringify(manifest(version)));
        await fs.writeFile(path.join(name, 'dist/build-info.json'), JSON.stringify({version, revision}));
        await fs.writeFile(path.join(name, 'dist/index.js'), `export const version = '${version}';`);
    }
    await fs.mkdir(path.join(source, 'node_modules'), {recursive: true});
    await fs.writeFile(path.join(source, 'node_modules/root-only'), 'must not copy');
    await fs.mkdir(path.join(target, 'node_modules'), {recursive: true});
    await fs.writeFile(path.join(target, 'node_modules/retained'), 'existing nested GUI dependency');
    await fs.writeFile(path.join(gui, 'node_modules/unrelated'), 'other GUI dependency');
    return {gui, sourceRoot, pins, source, target,
        cleanup: () => fs.rm(directory, {recursive: true, force: true})};
}

test('copies only the exact root core while retaining GUI declarations and existing dependencies', async () => {
    const host = await fixture();
    try {
        await assert.rejects(verifyInstalledCore(host.gui, host.pins), /core version/);
        const before = await fs.readFile(path.join(host.gui, 'package.json'));
        const nested = path.join(host.target, 'node_modules/retained'), inode = (await fs.stat(nested)).ino;
        const report = await prepareCore(host.gui, host.pins, {sourceRoot: host.sourceRoot});
        assert.equal(report.method, 'copy-fixed-root-core');
        assert.equal(report.coreVersion, '0.6.0');
        assert.equal(report.coreRevision, host.pins.coreRevision);
        assert.equal(report.source, await fs.realpath(host.source));
        assert.equal(report.target, host.target);
        assert.match(report.sourceSha256, /^[a-f0-9]{64}$/);
        assert.equal(report.sourceSha256, report.targetSha256);
        assert.equal(report.previousVersion, '0.5.0');
        assert.equal(report.guiDependencyDeclarationsUnchanged, true);
        assert.equal(report.retainedNestedDependencies, true);
        assert.equal((await fs.stat(nested)).ino, inode);
        assert.equal(await fs.readFile(path.join(host.gui, 'node_modules/unrelated'), 'utf8'), 'other GUI dependency');
        await assert.rejects(fs.stat(path.join(host.target, 'node_modules/root-only')), {code: 'ENOENT'});
        assert.deepEqual(await fs.readFile(path.join(host.gui, 'package.json')), before);
        assert.equal(Object.keys(report.guiDependencyHashes).length, 2);
        await prepareCore(host.gui, host.pins, {sourceRoot: host.sourceRoot});
        assert.equal((await fs.stat(nested)).ino, inode);
    } finally { await host.cleanup(); }
});

test('rejects a different GUI, nonexact root declaration and substituted source before changing the target', async () => {
    const host = await fixture();
    try {
        const options = {sourceRoot: host.sourceRoot};
        await assert.rejects(prepareCore(host.gui, {...host.pins, guiRevision: 'd'.repeat(40)}, options), /GUI checkout/);
        await fs.writeFile(path.join(host.sourceRoot, 'package.json'), JSON.stringify({devDependencies: {[corePackage]: '^0.6.0'}}));
        await assert.rejects(prepareCore(host.gui, host.pins, options), /declare the exact pinned/);
        await fs.writeFile(path.join(host.sourceRoot, 'package.json'), JSON.stringify({devDependencies: {[corePackage]: '0.6.0'}}));
        await fs.writeFile(path.join(host.source, 'dist/build-info.json'), JSON.stringify({version: '0.6.0', revision: 'c'.repeat(40)}));
        await assert.rejects(prepareCore(host.gui, host.pins, options), /source pin/);
        assert.match(await fs.readFile(path.join(host.target, 'dist/index.js'), 'utf8'), /0.5.0/);
    } finally { await host.cleanup(); }
});

test('refuses dependency or peer metadata changes that would require re-resolving the fixed GUI graph', async () => {
    const host = await fixture();
    try {
        const filename = path.join(host.source, 'package.json');
        const original = JSON.parse(await fs.readFile(filename, 'utf8'));
        for (const key of ['dependencies', 'optionalDependencies', 'peerDependencies', 'peerDependenciesMeta']) {
            await fs.writeFile(filename, JSON.stringify({...original, [key]: {different: '1'}}));
            await assert.rejects(prepareCore(host.gui, host.pins, {sourceRoot: host.sourceRoot}), new RegExp(`Core ${key} differ`));
            assert.match(await fs.readFile(path.join(host.target, 'dist/index.js'), 'utf8'), /0.5.0/);
        }
    } finally { await host.cleanup(); }
});

test('a failed or corrupt copy leaves the old core and its nested dependencies intact', async () => {
    const host = await fixture();
    try {
        const failure = new Error('copy failed');
        await assert.rejects(prepareCore(host.gui, host.pins, {sourceRoot: host.sourceRoot,
            copyPackage: () => { throw failure; }}), error => error === failure);
        await assert.rejects(prepareCore(host.gui, host.pins, {sourceRoot: host.sourceRoot,
            copyPackage: async (source, staging, options) => {
                await fs.cp(source, staging, options);
                await fs.writeFile(path.join(staging, 'dist/index.js'), 'corrupted');
            }}), /Copied core differs/);
        assert.match(await fs.readFile(path.join(host.target, 'dist/index.js'), 'utf8'), /0.5.0/);
        assert.equal(await fs.readFile(path.join(host.target, 'node_modules/retained'), 'utf8'), 'existing nested GUI dependency');
        assert.deepEqual((await fs.readdir(path.dirname(host.target))).sort(), ['turbowarp-extension-data-editor']);
    } finally { await host.cleanup(); }
});
