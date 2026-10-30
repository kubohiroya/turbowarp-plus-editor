import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {root} from './source.mjs';

export const previewSampleDirectory = 'samples/block-preview';
export const previewSampleFilename = 'block-preview-rc77.sb3';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const projectPath = `${previewSampleDirectory}/${previewSampleFilename}`;
const metadataPath = `${previewSampleDirectory}/metadata.json`;
const samplePath = name => typeof name === 'string' && name.startsWith(`${previewSampleDirectory}/`) &&
    /^[A-Za-z0-9_./-]+$/.test(name) && name.split('/').every(part => part && part !== '.' && part !== '..');

async function expectedAppVersion() {
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    const alias = manifest.devDependencies?.['@kubohiroya/turbowarp-kamishibai-preview-app'];
    assert.equal(alias, 'npm:@kubohiroya/turbowarp-kamishibai-app@4.0.0-rc.77',
        'The preview sample requires the exact published App rc.77 alias');
    return '4.0.0-rc.77';
}

async function fileHashes(directory, prefix) {
    const result = {};
    async function visit(relative) {
        const entries = await fs.readdir(path.join(directory, relative), {withFileTypes: true});
        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            const name = relative ? `${relative}/${entry.name}` : entry.name;
            assert.ok(samplePath(`${prefix}/${name}`), `Invalid sample file path: ${name}`);
            if (entry.isDirectory()) await visit(name);
            else {
                assert.ok(entry.isFile(), `Sample files must not be symbolic links: ${name}`);
                result[`${prefix}/${name}`] = sha256(await fs.readFile(path.join(directory, name)));
            }
        }
    }
    assert.ok((await fs.lstat(directory)).isDirectory(), 'The sample directory must not be a symbolic link');
    await visit('');
    return result;
}

/** Native-only verification also runs in the Pages job, which has no npm installation. */
export async function verifyPreviewSample(output, sample) {
    assert.ok(sample && typeof sample === 'object', 'Missing preview sample identity');
    assert.equal(sample.appVersion, await expectedAppVersion(), 'Preview sample App version differs');
    assert.equal(sample.project, projectPath, 'Unexpected preview sample project path');
    assert.equal(sample.metadata, metadataPath, 'Unexpected preview sample metadata path');
    assert.ok(sample.files && typeof sample.files === 'object' && !Array.isArray(sample.files), 'Missing sample file hashes');
    for (const [name, value] of Object.entries(sample.files)) {
        assert.ok(samplePath(name), `Invalid sample file path: ${name}`);
        assert.ok(digest(value), `Invalid sample file digest: ${name}`);
    }
    assert.ok((await fs.lstat(path.join(output, 'samples'))).isDirectory(), 'The samples root must not be a symbolic link');
    const actual = await fileHashes(path.join(output, previewSampleDirectory), previewSampleDirectory);
    assert.deepEqual(actual, sample.files, 'Preview sample files changed, are missing or are unrecorded');
    for (const name of [projectPath, metadataPath, `${previewSampleDirectory}/index.html`,
        `${previewSampleDirectory}/preview.k4.yml`, `${previewSampleDirectory}/LICENSE`]) {
        assert.ok(Object.hasOwn(actual, name), `Missing preview sample file: ${name}`);
    }
    assert.ok(Object.keys(actual).some(name => name.startsWith(`${previewSampleDirectory}/assets/`) && name.endsWith('.svg')),
        'Missing preview sample SVG assets');
    const metadata = JSON.parse(await fs.readFile(path.join(output, metadataPath), 'utf8'));
    assert.equal(metadata.appVersion, sample.appVersion, 'Sample metadata App version differs');
    assert.equal(metadata.filename, previewSampleFilename, 'Sample metadata filename differs');
    assert.equal(metadata.sha256, actual[projectPath], 'Sample metadata project digest differs');
    assert.equal(metadata.sourceSha256, actual[`${previewSampleDirectory}/preview.k4.yml`], 'Sample metadata source digest differs');
    assert.ok(digest(metadata.runtimeSha256), 'Missing sample runtime digest');
    const project = await fs.readFile(path.join(output, projectPath));
    assert.equal(project.subarray(0, 4).toString('hex'), '504b0304', 'The sample must be an SB3 ZIP archive');
    return metadata;
}

export async function buildPreviewSample(output, {
    sourceDirectory = path.join(root, 'site', previewSampleDirectory), createSample
} = {}) {
    assert.ok(path.isAbsolute(output), 'The sample output directory must be absolute');
    // Keep the official App/generator import out of the dependency-free artifact gate.
    const generate = createSample || (await import('../samples/block-preview-project.mjs')).createBlockPreviewSample;
    const {bytes, metadata} = await generate();
    assert.ok(Buffer.isBuffer(bytes), 'The sample generator must return a Buffer');
    assert.equal(metadata.appVersion, await expectedAppVersion());
    assert.equal(metadata.filename, previewSampleFilename);
    assert.equal(metadata.sha256, sha256(bytes), 'Generated sample project digest differs');
    const source = await fileHashes(sourceDirectory, previewSampleDirectory);
    assert.ok(!Object.hasOwn(source, projectPath) && !Object.hasOwn(source, metadataPath),
        'Generated sample files must not shadow authored sample inputs');
    const destination = path.join(output, previewSampleDirectory);
    await fs.rm(destination, {recursive: true, force: true});
    await fs.mkdir(destination, {recursive: true});
    await fs.cp(sourceDirectory, destination, {recursive: true});
    await fs.writeFile(path.join(output, projectPath), bytes);
    await fs.writeFile(path.join(output, metadataPath), `${JSON.stringify(metadata, null, 2)}\n`);
    const sample = {appVersion: metadata.appVersion, project: projectPath, metadata: metadataPath,
        files: await fileHashes(destination, previewSampleDirectory)};
    await verifyPreviewSample(output, sample);
    return sample;
}
