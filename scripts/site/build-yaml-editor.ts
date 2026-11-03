import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {copyNoticeFiles} from './family-notices.ts';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function packageMetadata(packageName, entryName = packageName) {
    const manifestPath = fileURLToPath(import.meta.resolve(`${packageName}/package.json`));
    const packageRoot = path.dirname(manifestPath);
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    const entry = fileURLToPath(import.meta.resolve(entryName));
    return {packageRoot, metadata: {package: packageName, version: manifest.version,
        entry: path.relative(packageRoot, entry), entrySha256: digest(await fs.readFile(entry)),
        license: manifest.license, localOnly: Object.values(manifest.dependencies || {}).some(value => typeof value === 'string' && /^(?:file:|link:)/u.test(value))}};
}

// This distribution mounts the editor (`site/plus-integration.js`, through the fork's
// `attachToWorkspace` socket) and bundles it (`withDocumentEditorWebpack4` in
// `scripts/site/webpack.config.cts`). This records which packages went in and their licenses.
export async function buildDocumentEditorMetadata(output, prefix = '/turbowarp-plus-editor/') {
    if (prefix !== '/turbowarp-plus-editor/') throw new TypeError('Use the canonical Editor prefix.');
    const packages = await Promise.all([
        packageMetadata('@kubohiroya/turbowarp-document-editor'),
        packageMetadata('@kubohiroya/turbowarp-document-source'),
        packageMetadata('@kubohiroya/turbowarp-document-data', '@kubohiroya/turbowarp-document-data/composition')
    ]);
    const destination = path.join(output, 'document-editor');
    const noticeRoot = path.join(destination, 'notices');
    const notices = [];
    for (const owner of packages) {
        const label = owner.metadata.package.split('/').at(-1);
        const names = await copyNoticeFiles(owner.packageRoot, noticeRoot, `${label}-`);
        if (!names.includes('LICENSE')) throw new Error(`${owner.metadata.package} ships no LICENSE`);
        notices.push(...names.map(name => `notices/${label}-${name}`));
    }
    const metadata = {mountOwner: 'turbowarp-plus-editor', packages: packages.map(owner => owner.metadata), notices};
    await fs.writeFile(path.join(destination, 'build-info.json'), JSON.stringify(metadata, null, 2) + '\n');
    const htmlPath = path.join(output, 'editor.html');
    const html = await fs.readFile(htmlPath, 'utf8');
    await fs.writeFile(htmlPath, html.replace(/<script\b[^>]*\bdata-twpe-yaml-bootstrap(?:="[^"]*")?[^>]*>[\s\S]*?<\/script>/gi, ''));
    // Remove the old distribution-owned UI during incremental builds.
    await fs.rm(path.join(output, 'yaml-editor'), {recursive: true, force: true});
    return {output: destination, ...metadata};
}

export {buildDocumentEditorMetadata as buildYamlEditor};
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await buildDocumentEditorMetadata(process.argv[2]);
}
