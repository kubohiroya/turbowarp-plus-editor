import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {verifyHost} from '../scripts/site/source.mjs';

test('host verification accepts exact npm or Git security sources and rejects mismatched declarations', async () => {
    const gui = await fs.mkdtemp(path.join(os.tmpdir(), 'twplus-security-source-'));
    const securityPackage = '@kubohiroya/turbowarp-extension-security-dialog';
    const securityRoot = path.join(gui, 'node_modules', securityPackage);
    const coreRoot = path.join(gui, 'node_modules/@kubohiroya/turbowarp-extension-data-editor');
    const writeJSON = (filename, value) => fs.writeFile(filename, JSON.stringify(value));
    try {
        execFileSync('git', ['init', '--quiet', gui]);
        execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test',
            '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', 'fixture'], {cwd: gui});
        const pins = {guiRepository: 'kubohiroya/scratch-gui',
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
        const lock = {packages: {[`node_modules/${securityPackage}`]: {
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
    } finally {
        await fs.rm(gui, {recursive: true, force: true});
    }
});
