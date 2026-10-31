import {emitBrowserModule} from './browser-modules.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sharedPackage = '@kubohiroya/turbowarp-embedded-yaml';
const documentPackage = '@kubohiroya/turbowarp-document-data';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function packageMetadata(packageName, entryName = packageName) {
    const manifestPath = fileURLToPath(import.meta.resolve(`${packageName}/package.json`));
    const packageRoot = path.dirname(manifestPath);
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    const entry = fileURLToPath(import.meta.resolve(entryName));
    return {packageRoot, metadata: {package: packageName, version: manifest.version,
        entry: path.relative(packageRoot, entry), entrySha256: digest(await fs.readFile(entry)),
        license: manifest.license, localOnly: manifest.version.includes('-local.') || Object.values(manifest.dependencies || {}).some(value => typeof value === 'string' && value.startsWith('file:'))}};
}

export async function buildYamlEditor(output, prefix = '/turbowarp-plus-editor/') {
    if (prefix !== '/turbowarp-plus-editor/') throw new TypeError('Use the canonical Editor prefix.');
    const {build} = await import('esbuild');
    const shared = await packageMetadata(sharedPackage);
    const documents = await packageMetadata(documentPackage, `${documentPackage}/composition`);
    const destination = path.join(output, 'yaml-editor');
    await fs.mkdir(destination, {recursive: true});
    const result = await build({
        absWorkingDir: root,
        entryPoints: ['site/yaml-editor/client.ts', 'site/yaml-editor/root-shape-bootstrap.ts'],
        outdir: destination,
        bundle: true, platform: 'browser', format: 'esm', target: ['es2022'],
        sourcemap: false, metafile: true, legalComments: 'eof', logLevel: 'silent'
    });
    const inputs = [...new Set(Object.values(result.metafile.outputs).flatMap(output => Object.entries(output.inputs).filter(([, contribution]) => contribution.bytesInOutput > 0).map(([name]) => name)))];
    // The host discovers owner providers from the VM; it never embeds an App parser.
    if (inputs.some(input => /(?:turbowarp-kamishibai-app|scratch-(?:vm|render|audio)|source-documents|yaml-json|node_modules\/(?:yaml|ajv)\/)/u.test(input))) {
        throw new Error('The generic YAML Editor bundle must not depend on an App or GUI implementation.');
    }
    for (const name of ['ui.css']) {
        await fs.copyFile(path.join(root, 'site/yaml-editor', name), path.join(destination, name));
    }
    for (const name of ['feature-flags', 'bootstrap']) await emitBrowserModule(path.join(root, 'site/yaml-editor', `${name}.ts`), path.join(destination, `${name}.js`));
    const noticeRoot = path.join(destination, 'notices');
    await fs.mkdir(noticeRoot, {recursive: true});
    // Remove only notices emitted by the superseded local App-specific implementation.
    for (const name of ['kamishibai-app-LICENSE', 'kamishibai-app-LICENSES.md']) {
        await fs.rm(path.join(noticeRoot, name), {force: true});
    }
    const notices = [];
    for (const [label, owner] of [['embedded-yaml', shared], ['document-data', documents]] as const) {
        for (const name of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md']) {
            try {
                await fs.copyFile(path.join(owner.packageRoot, name), path.join(noticeRoot, `${label}-${name}`));
                notices.push(`notices/${label}-${name}`);
            } catch (error) { if (error.code !== 'ENOENT' || name === 'LICENSE') throw error; }
        }
    }
    await fs.writeFile(path.join(destination, 'build-info.json'), JSON.stringify({shared: shared.metadata, documents: documents.metadata, notices, metafile: result.metafile}, null, 2) + '\n');
    const htmlPath = path.join(output, 'editor.html');
    let html = await fs.readFile(htmlPath, 'utf8');
    html = html.replace(/<script\b[^>]*\bdata-twpe-yaml-bootstrap(?:="[^"]*")?[^>]*>[\s\S]*?<\/script>/gi, '');
    if (!/<\/head>/i.test(html)) throw new TypeError('The Editor document needs a head element.');
    html = html.replace(/<\/head>/i,
        `<script type="module" data-twpe-yaml-bootstrap src="${prefix}yaml-editor/bootstrap.js"></script></head>`);
    await fs.writeFile(htmlPath, html);
    return {output: destination, inputs, shared: shared.metadata, documents: documents.metadata, notices};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await buildYamlEditor(process.argv[2]);
}
