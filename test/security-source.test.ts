import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {verifyHost} from '../scripts/site/source.ts';

test('host verification checks exact npm/Git security and document editor sources', async () => {
    const gui = await fs.mkdtemp(path.join(os.tmpdir(), 'twplus-security-source-'));
    const securityPackage = '@kubohiroya/turbowarp-extension-security-dialog';
    const securityRoot = path.join(gui, 'node_modules', securityPackage);
    const coreRoot = path.join(gui, 'node_modules/@kubohiroya/turbowarp-extension-data-editor');
    const writeJSON = (filename, value) => fs.writeFile(filename, JSON.stringify(value));
    try {
        execFileSync('git', ['init', '--quiet', gui]);
        execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test',
            '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', 'fixture'], {cwd: gui});
        const pins: Record<string, string> = {guiRepository: 'kubohiroya/scratch-gui',
            guiRevision: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: gui, encoding: 'utf8'}).trim(),
            coreRepository: 'kubohiroya/turbowarp-extension-data-editor', coreRevision: 'b'.repeat(40),
            coreVersion: '0.6.0', securityPackage, securityVersion: '0.4.0'};
        await fs.mkdir(path.join(securityRoot, 'dist'), {recursive: true});
        await fs.mkdir(coreRoot, {recursive: true});
        await writeJSON(path.join(coreRoot, 'package.json'), {name: '@kubohiroya/turbowarp-extension-data-editor',
            exports: {'./build-info': './build-info.json'}});
        await writeJSON(path.join(coreRoot, 'build-info.json'), {version: pins.coreVersion, revision: pins.coreRevision});
        await writeJSON(path.join(securityRoot, 'package.json'), {name: securityPackage, version: '0.4.0', main: './dist/index.cjs'});
        await fs.writeFile(path.join(securityRoot, 'dist/index.cjs'), '');
        const manifest = {dependencies: {[securityPackage]: pins.securityVersion}};
        const writeManifest = () => writeJSON(path.join(gui, 'package.json'), manifest);
        await writeManifest();
        assert.equal((await verifyHost(gui, pins)).securityVersion, '0.4.0');
        pins.securityRevision = 'd'.repeat(40);
        manifest.dependencies[securityPackage] = `github:kubohiroya/turbowarp-extension-security-dialog#${pins.securityRevision}`;
        const lock: {packages: Record<string, {resolved?: string; version?: string; integrity?: string;
            dependencies?: Record<string, string>}>} = {packages: {[`node_modules/${securityPackage}`]: {
            resolved: `git+ssh://git@github.com/kubohiroya/turbowarp-extension-security-dialog.git#${pins.securityRevision}`}}};
        const writeLock = () => writeJSON(path.join(gui, 'package-lock.json'), lock);
        await writeManifest();
        await writeLock();
        assert.equal((await verifyHost(gui, pins)).securityVersion, '0.4.0');
        manifest.dependencies[securityPackage] = pins.securityVersion;
        await writeManifest();
        await assert.rejects(verifyHost(gui, pins), /exact security package/);
        manifest.dependencies[securityPackage] = `github:kubohiroya/turbowarp-extension-security-dialog#${pins.securityRevision}`;
        await writeManifest();
        lock.packages[`node_modules/${securityPackage}`].resolved =
            `git+ssh://git@github.com/other/security.git#${pins.securityRevision}`;
        await writeLock();
        await assert.rejects(verifyHost(gui, pins), /security source/);
        lock.packages[`node_modules/${securityPackage}`].resolved =
            `git+ssh://git@github.com/kubohiroya/turbowarp-extension-security-dialog.git#${pins.securityRevision}`;
        const name = '@kubohiroya/turbowarp-document-editor';
        pins.documentEditorRepository = 'kubohiroya/turbowarp-document-editor';
        pins.documentEditorRevision = 'e'.repeat(40);
        pins.documentEditorVersion = '0.1.0-rc.0';
        manifest.dependencies[name] = `git+https://github.com/${pins.documentEditorRepository}.git#${pins.documentEditorRevision}`;
        lock.packages[`node_modules/${name}`] = {
            resolved: `git+ssh://git@github.com/${pins.documentEditorRepository}.git#${pins.documentEditorRevision}`};
        const uiRoot = path.join(gui, 'node_modules', name);
        await fs.mkdir(uiRoot, {recursive: true});
        await writeJSON(path.join(uiRoot, 'package.json'), {name, version: pins.documentEditorVersion,
            exports: {'./package.json': './package.json'}});
        await writeManifest(); await writeLock();
        await verifyHost(gui, pins);
        lock.packages[`node_modules/${name}`].resolved = 'git+ssh://git@github.com/other/editor.git#' + pins.documentEditorRevision;
        await writeLock();
        await assert.rejects(verifyHost(gui, pins), /shared document editor pin/);
        await assert.rejects(verifyHost(gui, {...pins, documentEditorRevision: 'main'}), /full document editor revision/);
        pins.documentEditorSource = 'npm';
        pins.documentEditorVersion = '0.1.0-rc.1';
        pins.documentEditorIntegrity = 'sha512-' + Buffer.alloc(64, 1).toString('base64');
        manifest.dependencies[name] = pins.documentEditorVersion;
        const npmEntry = {version: pins.documentEditorVersion,
            resolved: `https://registry.npmjs.org/${name}/-/turbowarp-document-editor-${pins.documentEditorVersion}.tgz`,
            integrity: pins.documentEditorIntegrity};
        lock.packages[''] = {dependencies: {...manifest.dependencies}};
        lock.packages[`node_modules/${name}`] = {...npmEntry};
        await writeJSON(path.join(uiRoot, 'package.json'), {name, version: pins.documentEditorVersion,
            exports: {'./package.json': './package.json'}});
        await writeManifest(); await writeLock();
        await verifyHost(gui, pins);
        manifest.dependencies[name] = '^' + pins.documentEditorVersion;
        await writeManifest();
        await assert.rejects(verifyHost(gui, pins), /exact npm document editor version/);
        manifest.dependencies[name] = pins.documentEditorVersion;
        await writeManifest();
        lock.packages[''].dependencies[name] = '0.1.0-rc.0';
        await writeLock();
        await assert.rejects(verifyHost(gui, pins), /Root lock/);
        lock.packages[''].dependencies[name] = pins.documentEditorVersion;
        for (const [property, value, message] of [
            ['version', '0.1.0-rc.0', /Locked document editor version/],
            ['resolved', npmEntry.resolved.replace('registry.npmjs.org', 'example.test'), /published npm tarball/],
            ['integrity', 'sha512-' + Buffer.alloc(64, 2).toString('base64'), /tarball integrity/]
        ] as const) {
            lock.packages[`node_modules/${name}`] = {...npmEntry, [property]: value};
            await writeLock();
            await assert.rejects(verifyHost(gui, pins), message);
        }
        lock.packages[`node_modules/${name}`] = {...npmEntry};
        await writeLock();
        await writeJSON(path.join(uiRoot, 'package.json'), {name, version: '0.1.0-rc.0',
            exports: {'./package.json': './package.json'}});
        await assert.rejects(verifyHost(gui, pins), /Installed document editor/);
        await assert.rejects(verifyHost(gui, {...pins, documentEditorSource: 'local'}), /source must be git or npm/);
        await assert.rejects(verifyHost(gui, {...pins, documentEditorIntegrity: 'unknown'}), /published document editor integrity/);
    } finally {
        await fs.rm(gui, {recursive: true, force: true});
    }
});

test('host verification checks an exact npm or Git extension loader source', async () => {
    const gui = await fs.mkdtemp(path.join(os.tmpdir(), 'twplus-loader-source-'));
    const loader = '@kubohiroya/turbowarp-extension-loader';
    const securityPackage = '@kubohiroya/turbowarp-extension-security-dialog';
    const loaderRoot = path.join(gui, 'node_modules', loader);
    const securityRoot = path.join(gui, 'node_modules', securityPackage);
    const coreRoot = path.join(gui, 'node_modules/@kubohiroya/turbowarp-extension-data-editor');
    const writeJSON = (filename, value) => fs.writeFile(filename, JSON.stringify(value));
    try {
        execFileSync('git', ['init', '--quiet', gui]);
        execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test',
            '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', 'fixture'], {cwd: gui});
        const pins: Record<string, string | undefined> = {guiRepository: 'kubohiroya/scratch-gui',
            guiRevision: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: gui, encoding: 'utf8'}).trim(),
            coreRepository: 'kubohiroya/turbowarp-extension-data-editor', coreRevision: 'b'.repeat(40),
            coreVersion: '0.6.0', securityPackage, securityVersion: '0.4.0',
            loaderRepository: 'kubohiroya/turbowarp-extension-loader', loaderRevision: 'c'.repeat(40),
            vmRepository: 'kubohiroya/scratch-vm', vmRevision: 'd'.repeat(40), vmBaseRevision: 'e'.repeat(40),
            packagerRepository: 'TurboWarp/packager', packagerRevision: 'f'.repeat(40),
            loaderSource: 'npm', loaderVersion: '0.2.0', loaderIntegrity: 'sha512-' + Buffer.alloc(64, 1).toString('base64')};
        await fs.mkdir(path.join(securityRoot, 'dist'), {recursive: true});
        await fs.mkdir(coreRoot, {recursive: true});
        await fs.mkdir(path.join(loaderRoot, 'dist'), {recursive: true});
        await writeJSON(path.join(coreRoot, 'package.json'), {name: '@kubohiroya/turbowarp-extension-data-editor',
            exports: {'./build-info': './build-info.json'}});
        await writeJSON(path.join(coreRoot, 'build-info.json'), {version: pins.coreVersion, revision: pins.coreRevision});
        await writeJSON(path.join(securityRoot, 'package.json'), {name: securityPackage, version: '0.4.0', main: './dist/index.cjs'});
        await fs.writeFile(path.join(securityRoot, 'dist/index.cjs'), '');
        // Like the published package, the loader exports its built entry but not its package.json.
        const writeLoader = version => writeJSON(path.join(loaderRoot, 'package.json'),
            {name: loader, version, exports: {'.': {default: './dist/index.js'}}});
        await writeLoader('0.2.0');
        await fs.writeFile(path.join(loaderRoot, 'dist/index.js'), '');
        const vmURL = `git+https://github.com/${pins.vmRepository}.git#${pins.vmRevision}`;
        const manifest = {dependencies: {[securityPackage]: pins.securityVersion, [loader]: '0.2.0', 'scratch-vm': vmURL}};
        const npmEntry = {version: '0.2.0',
            resolved: `https://registry.npmjs.org/${loader}/-/turbowarp-extension-loader-0.2.0.tgz`,
            integrity: pins.loaderIntegrity};
        const lock: {packages: Record<string, {resolved?: string; version?: string; integrity?: string;
            dependencies?: Record<string, string>}>} = {packages: {
            '': {dependencies: {[loader]: '0.2.0'}},
            [`node_modules/${loader}`]: {...npmEntry},
            'node_modules/scratch-vm': {resolved: `git+ssh://git@github.com/${pins.vmRepository}.git#${pins.vmRevision}`}}};
        const writeManifest = () => writeJSON(path.join(gui, 'package.json'), manifest);
        const writeLock = () => writeJSON(path.join(gui, 'package-lock.json'), lock);
        await writeManifest(); await writeLock();
        await verifyHost(gui, pins);

        manifest.dependencies[loader] = '^0.2.0';
        await writeManifest();
        await assert.rejects(verifyHost(gui, pins), /exact npm loader version/);
        manifest.dependencies[loader] = '0.2.0';
        await writeManifest();
        lock.packages[''].dependencies[loader] = '0.1.0';
        await writeLock();
        await assert.rejects(verifyHost(gui, pins), /Root lock differs from the npm loader pin/);
        lock.packages[''].dependencies[loader] = '0.2.0';
        for (const [property, value, message] of [
            ['version', '0.1.0', /Locked loader version/],
            ['resolved', npmEntry.resolved.replace('registry.npmjs.org', 'example.test'), /published npm tarball/],
            ['integrity', 'sha512-' + Buffer.alloc(64, 2).toString('base64'), /tarball integrity/]
        ] as const) {
            lock.packages[`node_modules/${loader}`] = {...npmEntry, [property]: value};
            await writeLock();
            await assert.rejects(verifyHost(gui, pins), message);
        }
        lock.packages[`node_modules/${loader}`] = {...npmEntry};
        await writeLock();
        await writeLoader('0.1.0');
        await assert.rejects(verifyHost(gui, pins), /Installed loader differs/);
        await writeLoader('0.2.0');
        await assert.rejects(verifyHost(gui, {...pins, loaderSource: 'local'}), /source must be git or npm/);
        await assert.rejects(verifyHost(gui, {...pins, loaderIntegrity: 'unknown'}), /published loader integrity/);

        // A Git loader keeps the full-revision pin, and the npm form no longer satisfies it.
        const gitPins = {...pins, loaderSource: undefined, loaderVersion: undefined, loaderIntegrity: undefined};
        await assert.rejects(verifyHost(gui, gitPins));
        manifest.dependencies[loader] = `git+https://github.com/${pins.loaderRepository}.git#${pins.loaderRevision}`;
        lock.packages[`node_modules/${loader}`] = {resolved: `git+ssh://git@github.com/${pins.loaderRepository}.git#${pins.loaderRevision}`};
        await writeManifest(); await writeLock();
        await verifyHost(gui, gitPins);
    } finally {
        await fs.rm(gui, {recursive: true, force: true});
    }
});
