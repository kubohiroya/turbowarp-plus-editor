import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import JSZip from '@turbowarp/jszip';
import {installEmbeddedYamlMarker} from '@kubohiroya/turbowarp-embedded-yaml';

// Build a real test extension; the product Editor never installs a synthetic owner.
export async function buildSettingsFixture(input, output) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const built = await build({absWorkingDir: root, entryPoints: ['test/fixtures/yaml-editor/settings-extension.js'], bundle: true,
        format: 'iife', platform: 'browser', target: 'es2022', write: false, minify: true, legalComments: 'eof'});
    const runtime = built.outputFiles[0].contents;
    const archive = await JSZip.loadAsync(await fs.readFile(input));
    const project = JSON.parse(await archive.file('project.json').async('string'));
    for (const target of project.targets) { target.blocks = {}; target.comments = {}; }
    project.extensions = ['twpeyamlsettings'];
    project.extensionURLs = {twpeyamlsettings: `data:application/javascript;base64,${Buffer.from(runtime).toString('base64')}`};
    project.extensionStorage = {twpeyamlsettings: {documents: {settings: 'volume: 50\nmode: rehearsal\n', labels: 'title: Chapter 1\n'}}};
    installEmbeddedYamlMarker(project, {opcode: 'twpeyamlsettings_embeddedYaml', reference: {providerId: 'twpeyamlsettings', documentId: 'settings'}, x: 32, y: 32});
    installEmbeddedYamlMarker(project, {opcode: 'twpeyamlsettings_embeddedYaml', reference: {providerId: 'twpeyamlsettings', documentId: 'labels'}, x: 32, y: 180});
    archive.file('project.json', JSON.stringify(project));
    await fs.mkdir(path.dirname(output), {recursive: true});
    const bytes = await archive.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'});
    await fs.writeFile(output, bytes);
    return {output, sha256: createHash('sha256').update(bytes).digest('hex'), runtimeBytes: runtime.length,
        provider: 'twpeyamlsettings', documents: ['settings', 'labels'], filename: 'settings.yml'};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.stdout.write(JSON.stringify(await buildSettingsFixture(process.argv[2], process.argv[3])) + '\n');
}
