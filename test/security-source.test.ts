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
