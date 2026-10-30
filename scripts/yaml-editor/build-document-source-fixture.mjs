import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import JSZip from '@turbowarp/jszip';
import {createEmbeddedYamlMarker} from '@kubohiroya/turbowarp-embedded-yaml';

export const fixtureSources = {
    'yaml-settings': '# User settings\r\nvolume: 50 # percent\r\nmode: rehearsal\r\n',
    'json-settings': '{\r\n  "enabled": true,\r\n  "theme": "day"\r\n}\r\n'
};
const schemas = {
    'yaml-settings': {id: 'urn:twpe:yaml-settings', schema: {$schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', required: ['volume', 'mode'], additionalProperties: false, properties: {volume: {type: 'integer', minimum: 0, maximum: 100}, mode: {enum: ['rehearsal', 'production']}}}},
    'json-settings': {id: 'urn:twpe:json-settings', schema: {$schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', required: ['enabled', 'theme'], additionalProperties: false, properties: {enabled: {type: 'boolean'}, theme: {enum: ['day', 'night']}}}}
};
export async function buildDocumentSourceFixture(input, output) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    // Separate inert block declarations are preloaded only in this explicit test composition.
    const companion = await build({absWorkingDir: root, stdin: {contents: "import {createYamlBlockRuntime} from '@kubohiroya/turbowarp-embedded-yaml/runtime'; Scratch.extensions.register(createYamlBlockRuntime(Scratch,{enabled:true}));", resolveDir: root, sourcefile: 'document-source-companion.js'}, bundle: true, platform: 'browser', format: 'iife', target: 'es2022', write: false, minify: true, legalComments: 'eof'});
    const companionURL = `data:application/javascript;base64,${Buffer.from(companion.outputFiles[0].contents).toString('base64')}`;
    const compiled = await build({absWorkingDir: root, define: {__TWPE_COMPANION_URL__: JSON.stringify(companionURL)}, entryPoints: ['test/fixtures/document-source/runtime.js'], bundle: true, platform: 'browser', format: 'iife', target: 'es2022', write: false, minify: true, legalComments: 'eof'});
    const zip = await JSZip.loadAsync(await fs.readFile(input));
    const p = JSON.parse(await zip.file('project.json').async('string'));
    for (const target of p.targets) {target.blocks = {}; target.comments = {};}
    p.extensions = ['kubohiroyadocumentdata', 'kubohiroyaembeddedyaml'];
    p.extensionURLs = {kubohiroyaembeddedyaml: companionURL, kubohiroyadocumentdata: `data:application/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`};
    p.extensionStorage = {kubohiroyadocumentdata: {formatVersion: 1, documents: Object.fromEntries(Object.entries(fixtureSources).map(([id, source]) => [id, {id, source, revision: '1', format: id.startsWith('yaml') ? 'yaml' : 'json', filename: id.startsWith('yaml') ? 'settings.yml' : 'settings.json', schema: schemas[id], docsURL: 'https://json-schema.org/learn/'}]))}};
    const stage = p.targets.find(target => target.isStage);
    stage.blocks['document-yaml'] = createEmbeddedYamlMarker({opcode: 'kubohiroyadocumentdata_sourceDocument', reference: {providerId: 'document-data', documentId: 'yaml-settings'}, x: 40, y: 40});
    stage.blocks['document-json'] = createEmbeddedYamlMarker({opcode: 'kubohiroyadocumentdata_sourceDocument', reference: {providerId: 'document-data', documentId: 'json-settings'}, x: 40, y: 190});
    zip.file('project.json', JSON.stringify(p));
    const bytes = await zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'});
    await fs.mkdir(path.dirname(output), {recursive: true}); await fs.writeFile(output, bytes);
    return {output, sha256: createHash('sha256').update(bytes).digest('hex'), runtimeBytes: compiled.outputFiles[0].contents.length, companionBytes: companion.outputFiles[0].contents.length, companionSha256: createHash('sha256').update(companion.outputFiles[0].contents).digest('hex'), views: ['source', 'yaml-blocks'], documents: Object.keys(fixtureSources), packages: ['document-data', 'yaml-json', 'structured-data', 'embedded-yaml'], flags: 'Explicitly enabled only in this test composition'};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.stdout.write(JSON.stringify(await buildDocumentSourceFixture(process.argv[2], process.argv[3])) + '\n');
