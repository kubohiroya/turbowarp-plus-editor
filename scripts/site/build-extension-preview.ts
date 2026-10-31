import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {root, validatePins, sha} from './source.ts';
import {buildPages} from './build.ts';
import {createRequire} from 'node:module';
import {prepareLocalCatalogPreview} from './local-catalog-preview.ts';

// Local integration builds retain immutable base pins and record the actual overlay.
const gui = process.env.E2E_GUI_ROOT;
if (!gui || !path.isAbsolute(gui)) throw new Error('E2E_GUI_ROOT must be absolute');
const hostRequirePath = path.join(gui, 'node_modules/@kubohiroya/turbowarp-extension-loader');
const loader = await fs.realpath(hostRequirePath);
const hostRequire = createRequire(path.join(gui, 'package.json'));
const security = await fs.realpath(path.resolve(path.dirname(hostRequire.resolve('@kubohiroya/turbowarp-extension-security-dialog')), '..'));
const vmSource = await fs.realpath(path.join(path.dirname(hostRequire.resolve('scratch-vm/package.json')), 'src'));
const pins = JSON.parse(await fs.readFile(path.join(root, 'site/extension-source.json'), 'utf8'));
validatePins(pins);
for (const name of ['loaderRevision', 'vmRevision', 'vmBaseRevision', 'packagerRevision']) {
    if (!sha(pins[name])) throw new Error(`A full ${name} is required`);
}
async function treeDigest(directory) {
    const hash = createHash('sha256');
    async function visit(relative) {
        const entries = await fs.readdir(path.join(directory, relative), {withFileTypes: true});
        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            if (['.git', '.host', 'node_modules', 'build', 'dist', 'translations',
                'test-results', 'playwright-report'].includes(entry.name)) continue;
            const name = path.join(relative, entry.name);
            if (entry.isDirectory()) await visit(name);
            else if (entry.isFile()) { hash.update(name); hash.update(await fs.readFile(path.join(directory, name))); }
        }
    }
    await visit('');
    return hash.digest('hex');
}
let localCatalog;
if (process.env.TW_PLUS_CATALOG_ROOT) {
    localCatalog = await prepareLocalCatalogPreview(process.env.TW_PLUS_CATALOG_ROOT, gui,
        path.join(root, '.host/issue-4-artifacts/catalog-preview/webpack-input.json'));
    process.env.TW_PLUS_LOCAL_CATALOG_INPUT = localCatalog.inputPath;
    process.env.TW_PLUS_CATALOG_PREVIEW = '1';
} else if (process.env.TW_PLUS_LOCAL_CATALOG_INPUT || process.env.TW_PLUS_CATALOG_PREVIEW) {
    throw new Error('Set TW_PLUS_CATALOG_ROOT instead of internal preview catalog settings');
}
await buildPages(pins);
for (const script of ['test/e2e/extension-loader/prepare-packaged.ts']) {
    const result = spawnSync(process.execPath, ['--openssl-legacy-provider', path.join(root, script)], {
        cwd: root, env: process.env, stdio: 'inherit'
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
}
const filename = path.join(gui, 'build/build-info.json');
const info = JSON.parse(await fs.readFile(filename, 'utf8'));
info.localExtensionIntegration = {
    guiBaseRevision: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: gui, encoding: 'utf8'}).trim(),
    guiWorkingTreeSha256: await treeDigest(gui),
    loaderSourceSha256: await treeDigest(loader),
    securityDialogSourceSha256: await treeDigest(security),
    vmSourceSha256: await treeDigest(vmSource),
    siteWorkingTreeSha256: await treeDigest(root),
    loaderRepository: pins.loaderRepository,
    loaderRevision: pins.loaderRevision,
    vmSourceRevision: pins.vmRevision,
    vmBaseRevision: pins.vmBaseRevision,
    scaffolding: JSON.parse(await fs.readFile(path.join(path.resolve(process.env.TW_PLUS_SCAFFOLDING_ROOT ||
        path.join(root, '.host/issue-4-artifacts/scaffolding')), 'build-info.json'), 'utf8')),
    published: false
};
if (localCatalog) info.localExtensionIntegration.catalogPreview = localCatalog;
await fs.writeFile(filename, `${JSON.stringify(info, null, 2)}\n`);
console.log('Local extension integration provenance recorded');
