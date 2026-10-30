import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {root, validatePins, sha} from './source.mjs';
import {buildPages} from './build.mjs';

// Local integration builds retain immutable base pins and record the actual overlay.
const gui = process.env.E2E_GUI_ROOT;
if (!gui || !path.isAbsolute(gui)) throw new Error('E2E_GUI_ROOT must be absolute');
const hostRequirePath = path.join(gui, 'node_modules/@kubohiroya/turbowarp-extension-loader');
const loader = await fs.realpath(hostRequirePath);
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
await buildPages(pins);
for (const script of ['scripts/site/build-plus-scaffolding.cjs', 'scripts/site/build-extension-runtime.cjs',
    'scripts/site/build-plus-packager.cjs', 'test/e2e/extension-loader/prepare-packaged.mjs']) {
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
    siteWorkingTreeSha256: await treeDigest(root),
    loaderRepository: pins.loaderRepository,
    loaderRevision: pins.loaderRevision,
    vmSourceRevision: pins.vmRevision,
    vmBaseRevision: pins.vmBaseRevision,
    scaffolding: JSON.parse(await fs.readFile(path.join(path.resolve(process.env.TW_PLUS_SCAFFOLDING_ROOT ||
        path.join(root, '.host/issue-4-artifacts/scaffolding')), 'build-info.json'), 'utf8')),
    published: false
};
await fs.writeFile(filename, `${JSON.stringify(info, null, 2)}\n`);
console.log('Local extension integration provenance recorded');
