import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function packageMetadata(packageName, entryName = packageName) {
    const manifestPath = fileURLToPath(import.meta.resolve(`${packageName}/package.json`));
    const packageRoot = path.dirname(manifestPath);
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    const entry = fileURLToPath(import.meta.resolve(entryName));
    return {packageRoot, metadata: {package: packageName, version: manifest.version,
        entry: path.relative(packageRoot, entry), entrySha256: digest(await fs.readFile(entry)),
        license: manifest.license, localOnly: Object.values(manifest.dependencies || {}).some(value => /^(?:file:|link:)/u.test(value))}};
}

// The GUI owns mounting and bundling. The distribution records provenance and licenses only.
export async function buildDocumentEditorMetadata(output, prefix = '/turbowarp-plus-editor/') {
    if (prefix !== '/turbowarp-plus-editor/') throw new TypeError('Use the canonical Editor prefix.');
    const packages = await Promise.all([
        packageMetadata('@kubohiroya/turbowarp-document-editor'),
        packageMetadata('@kubohiroya/turbowarp-document-source'),
        packageMetadata('@kubohiroya/turbowarp-document-data', '@kubohiroya/turbowarp-document-data/composition')
    ]);
    const destination = path.join(output, 'document-editor');
    const noticeRoot = path.join(destination, 'notices');
    await fs.mkdir(noticeRoot, {recursive: true});
    const notices = [];
    for (const owner of packages) {
        const label = owner.metadata.package.split('/').at(-1);
        for (const name of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md']) {
            try {
                await fs.copyFile(path.join(owner.packageRoot, name), path.join(noticeRoot, `${label}-${name}`));
                notices.push(`notices/${label}-${name}`);
            } catch (error) { if (error.code !== 'ENOENT' || name === 'LICENSE') throw error; }
        }
    }
    const metadata = {mountOwner: 'scratch-gui', packages: packages.map(owner => owner.metadata), notices};
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
