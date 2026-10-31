import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {buildPreviewSample, verifyPreviewSample, installPreviewSampleFocus} from '../scripts/site/build-preview-sample.ts';
import {root} from '../scripts/site/source.ts';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture() {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'twpe-sample-artifact-'));
    const sourceDirectory = path.join(directory, 'source'), output = path.join(directory, 'output');
    const inputs = {'index.html': '<h1>Sample guide</h1>', 'preview.k4.yml': "kamishibai: '4.0'\n",
        LICENSE: 'CC0 sample assets', 'assets/actor.svg': '<svg/>', 'focus.js': '// Sample initial view'};
    for (const [name, bytes] of Object.entries<any>(inputs)) {
        await fs.mkdir(path.dirname(path.join(sourceDirectory, name)), {recursive: true});
        await fs.writeFile(path.join(sourceDirectory, name), bytes);
    }
    const bytes = Buffer.from('PK\x03\x04 generated sample archive');
    const metadata = {appVersion: '4.0.0-rc.77', filename: 'block-preview-rc77.sb3', sha256: hash(bytes),
        sourceSha256: hash(inputs['preview.k4.yml']), runtimeSha256: 'a'.repeat(64)};
    const createSample = async () => ({bytes, project: {}, metadata});
    const sample = await buildPreviewSample(output, {sourceDirectory, createSample});
    return {directory, sourceDirectory, output, inputs, bytes, metadata, sample, createSample,
        cleanup: () => fs.rm(directory, {recursive: true, force: true})};
}

test('the sample initial-view module is installed once on the Editor document', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'twpe-sample-focus-'));
    try {
        const filename = path.join(directory, 'editor.html');
        await fs.writeFile(filename, '<!doctype html><html><head><title>Editor</title></head><body></body></html>');
        await installPreviewSampleFocus(directory);
        await installPreviewSampleFocus(directory);
        const html = await fs.readFile(filename, 'utf8');
        assert.equal((html.match(/data-twpe-preview-sample-focus/gu) || []).length, 1);
        assert.match(html, /type="module" data-twpe-preview-sample-focus src="\/turbowarp-plus-editor\/samples\/block-preview\/focus\.js"/u);
        await assert.rejects(installPreviewSampleFocus(directory, '/other/'), /canonical/);
    } finally { await fs.rm(directory, {recursive: true, force: true}); }
});

test('builds a sample and inventories every authored input and generated download', async () => {
    const f = await fixture();
    try {
        assert.equal(f.sample.appVersion, '4.0.0-rc.77');
        assert.equal(f.sample.project, 'samples/block-preview/block-preview-rc77.sb3');
        assert.equal(Object.keys(f.sample.files).length, 7);
        assert.deepEqual(await fs.readFile(path.join(f.output, f.sample.project)), f.bytes);
        assert.deepEqual(await verifyPreviewSample(f.output, f.sample), f.metadata);
        for (const [name, bytes] of Object.entries<any>(f.inputs)) {
            assert.equal(await fs.readFile(path.join(f.output, 'samples/block-preview', name), 'utf8'), bytes);
        }
    } finally { await f.cleanup(); }
});

test('rejects missing, changed and unrecorded files, including the guide and license', async () => {
    const f = await fixture();
    try {
        for (const name of ['index.html', 'LICENSE', 'focus.js', 'assets/actor.svg', 'block-preview-rc77.sb3']) {
            const filename = path.join(f.output, 'samples/block-preview', name), original = await fs.readFile(filename);
            await fs.writeFile(filename, 'changed');
            await assert.rejects(verifyPreviewSample(f.output, f.sample), /files changed/);
            await fs.rm(filename);
            await assert.rejects(verifyPreviewSample(f.output, f.sample), /files changed/);
            await fs.writeFile(filename, original);
        }
        await fs.writeFile(path.join(f.output, 'samples/block-preview/unrecorded.txt'), 'extra');
        await assert.rejects(verifyPreviewSample(f.output, f.sample), /unrecorded/);
    } finally { await f.cleanup(); }
});

test('rejects escaping paths, altered project locations and symbolic links', async () => {
    const f = await fixture();
    try {
        for (const name of ['../outside', '/samples/block-preview/file', 'samples/block-preview/../outside',
            'samples/block-preview/assets\\outside', 'samples/block-preview/%2e%2e/file']) {
            await assert.rejects(verifyPreviewSample(f.output, {...f.sample, files: {...f.sample.files, [name]: 'a'.repeat(64)}}), /Invalid sample file path/);
        }
        await assert.rejects(verifyPreviewSample(f.output, {...f.sample, project: '../outside.sb3'}), /project path/);
        await assert.rejects(verifyPreviewSample(f.output, {...f.sample, metadata: '/metadata.json'}), /metadata path/);
        const file = path.join(f.output, 'samples/block-preview/assets/actor.svg');
        await fs.rm(file);
        await fs.symlink(path.join(f.sourceDirectory, 'assets/actor.svg'), file);
        await assert.rejects(verifyPreviewSample(f.output, f.sample), /symbolic links/);
    } finally { await f.cleanup(); }
});

test('cross-checks metadata against the pinned App, actual project bytes and source', async () => {
    const f = await fixture();
    try {
        await assert.rejects(verifyPreviewSample(f.output, {...f.sample, appVersion: '4.0.0-rc.75'}), /App version/);
        for (const change of [{appVersion: '4.0.0-rc.75'}, {filename: 'other.sb3'},
            {sha256: 'b'.repeat(64)}, {sourceSha256: 'c'.repeat(64)}, {runtimeSha256: 'unknown'}]) {
            const bytes = Buffer.from(JSON.stringify({...f.metadata, ...change}));
            await fs.writeFile(path.join(f.output, f.sample.metadata), bytes);
            const sample = {...f.sample, files: {...f.sample.files, [f.sample.metadata]: hash(bytes)}};
            await assert.rejects(verifyPreviewSample(f.output, sample), /metadata|runtime digest/);
        }
        await assert.rejects(buildPreviewSample(f.output, {sourceDirectory: f.sourceDirectory,
            createSample: async () => ({bytes: f.bytes, metadata: {...f.metadata, sha256: 'd'.repeat(64)}})}), /Generated sample project digest/);
    } finally { await f.cleanup(); }
});

test('the real Pages artifact gate verifies the sample without npm dependencies or its generator', async () => {
    const f = await fixture();
    try {
        const checkout = path.join(f.directory, 'native-gate');
        await fs.mkdir(path.join(checkout, 'scripts/site'), {recursive: true});
        for (const name of ['source.ts', 'extension-assets.ts', 'build-preview-sample.ts', 'check-artifact.ts']) {
            await fs.copyFile(path.join(root, 'scripts/site', name), path.join(checkout, 'scripts/site', name));
        }
        const manifest = {type: 'module', devDependencies: {
            '@kubohiroya/turbowarp-kamishibai-app': '4.0.0-rc.79',
            '@kubohiroya/turbowarp-kamishibai-preview-app': 'npm:@kubohiroya/turbowarp-kamishibai-app@4.0.0-rc.77'}};
        const writeManifest = () => fs.writeFile(path.join(checkout, 'package.json'), JSON.stringify(manifest));
        await writeManifest();
        const pins = {guiRepository: 'kubohiroya/scratch-gui', guiRevision: 'a'.repeat(40),
            coreRepository: 'kubohiroya/turbowarp-extension-data-editor', coreRevision: 'b'.repeat(40),
            coreVersion: '0.6.0', securityPackage: '@kubohiroya/turbowarp-extension-security-dialog', securityVersion: '0.3.3'};
        await fs.mkdir(path.join(checkout, 'site'));
        await fs.writeFile(path.join(checkout, 'site/source.json'), JSON.stringify(pins));
        for (const name of ['index.html', 'editor.html', 'player.html', 'LICENSE', 'NOTICE', 'assets/icon.svg', 'assets/edit-button.css']) {
            await fs.mkdir(path.dirname(path.join(f.output, name)), {recursive: true});
            await fs.writeFile(path.join(f.output, name), 'checked site asset');
        }
        const info = {siteRepository: 'https://github.com/kubohiroya/turbowarp-plus-editor', siteRevision: 'c'.repeat(40),
            repository: `https://github.com/${pins.guiRepository}`, revision: pins.guiRevision,
            coreRepository: `https://github.com/${pins.coreRepository}`, coreRevision: pins.coreRevision, coreVersion: pins.coreVersion,
            securityPackage: pins.securityPackage, securityVersion: pins.securityVersion, previewSample: f.sample};
        await fs.writeFile(path.join(f.output, 'build-info.json'), JSON.stringify(info));
        const check = () => spawnSync(process.execPath, [path.join(checkout, 'scripts/site/check-artifact.ts'), f.output], {
            cwd: checkout, env: {...process.env, EXPECTED_REVISION: info.siteRevision}, encoding: 'utf8'});
        const result = check();
        assert.equal(result.status, 0, result.stderr);
        manifest.devDependencies['@kubohiroya/turbowarp-kamishibai-app'] = '4.0.0-rc.78';
        await writeManifest();
        assert.equal(check().status, 0, 'The current App release must not change the fixed preview sample');
        manifest.devDependencies['@kubohiroya/turbowarp-kamishibai-preview-app'] = 'npm:@kubohiroya/turbowarp-kamishibai-app@4.0.0-rc.78';
        await writeManifest();
        const wrongAlias = check();
        assert.notEqual(wrongAlias.status, 0);
        assert.match(wrongAlias.stderr, /exact published App rc.77 alias/u);
        manifest.devDependencies['@kubohiroya/turbowarp-kamishibai-preview-app'] = 'npm:@kubohiroya/turbowarp-kamishibai-app@4.0.0-rc.77';
        await writeManifest();
        await fs.rm(path.join(f.output, f.sample.project));
        assert.notEqual(check().status, 0);
    } finally { await f.cleanup(); }
});
