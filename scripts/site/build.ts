import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {generatePages} from './generate-pages.ts';
import {brandEditor} from './brand-editor.ts';
import {buildDocumentEditorMetadata} from './build-yaml-editor.ts';
import {
    root, readPins, verifyHost, verifyDocumentEditorDependency, verifyLoaderDependency,
    verifySecurityDependency, verifyInstalledCore, verifyScriptTransferDependency, sha
} from './source.ts';
import {buildExtensionAssets} from './extension-assets.ts';
import {buildFamilyNotices} from './family-notices.ts';

export async function buildPages(pins = undefined) {
    pins = pins || await readPins();
    const gui = process.env.E2E_GUI_ROOT;
    const {revision} = await verifyHost(gui, pins);
    const {coreRevision, coreVersion} = await verifyInstalledCore(root, pins);
    if (pins.documentEditorRepository) await verifyDocumentEditorDependency(root, pins);
    if (pins.loaderRepository) await verifyLoaderDependency(root, pins);
    if (pins.scriptTransferRepository) await verifyScriptTransferDependency(root, pins);
    const {version: securityVersion} = await verifySecurityDependency(root, pins);
    const siteRevision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
    assert.ok(sha(siteRevision), 'Site source must have a full revision');
    const prefix = process.env.ROOT || '/turbowarp-plus-editor/';
    assert.equal(prefix, '/turbowarp-plus-editor/', 'Use the canonical TurboWarp-Plus-Editor prefix');
    const output = path.join(gui, 'build');
    await fs.rm(output, {recursive: true, force: true});
    const result = spawnSync(process.execPath, ['--openssl-legacy-provider',
        path.join(gui, 'node_modules/webpack/bin/webpack.js'), '--config', path.join(root, 'scripts/site/webpack.config.cts'), '--bail'], {
        cwd: gui, stdio: 'inherit', env: {...process.env, NODE_ENV: 'production', ROOT: prefix, CI: '1'}
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
    await fs.rename(path.join(output, 'index.html'), path.join(output, 'player.html'));
    await generatePages(output, revision, coreRevision, {siteRevision, coreVersion, securityVersion,
        securityRevision: pins.securityRevision, licensePath: path.join(gui, 'LICENSE')});
    const info = JSON.parse(await fs.readFile(path.join(output, 'build-info.json'), 'utf8'));
    assert.equal(info.repository, `https://github.com/${pins.guiRepository}`);
    assert.equal(info.revision, revision);
    assert.equal(info.coreRepository, `https://github.com/${pins.coreRepository}`);
    assert.equal(info.coreRevision, coreRevision);
    assert.equal(info.coreVersion, coreVersion);
    assert.equal(info.siteRepository, 'https://github.com/kubohiroya/turbowarp-plus-editor');
    assert.equal(info.siteRevision, siteRevision);
    assert.equal(info.securityPackage, pins.securityPackage);
    assert.equal(info.securityVersion, securityVersion);
    await brandEditor(output, prefix);
    if (pins.loaderRepository) {
        info.extensionIntegration = await buildExtensionAssets(gui, pins);
    }
    const documents = await buildDocumentEditorMetadata(output, prefix);
    info.documentEditor = {repository: `https://github.com/${pins.documentEditorRepository}`,
        revision: pins.documentEditorRevision, version: pins.documentEditorVersion,
        metadata: 'document-editor/build-info.json', source: pins.documentEditorSource || 'git',
        integrity: pins.documentEditorIntegrity};
    assert.equal(documents.packages[0].version, pins.documentEditorVersion);
    // The GUI install supplies the VM and its own tooling; this repository's install supplies every
    // family package the site bundles. Its dev entries count: the Loader and the review dialog are
    // devDependencies here and are bundled all the same, so their licenses have to be recorded.
    if (pins.scriptTransferRepository) info.scriptTransfer = {
        repository: `https://github.com/${pins.scriptTransferRepository}`,
        revision: pins.scriptTransferRevision, version: pins.scriptTransferVersion, featureDefault: false
    };
    info.familyNotices = await buildFamilyNotices(output, [
        {origin: 'scratch-gui', directory: gui},
        {origin: 'turbowarp-plus-editor', directory: root, includeDev: true}]);
    await fs.writeFile(path.join(output, 'build-info.json'), `${JSON.stringify(info, null, 2)}\n`);
    console.log(`TurboWarp-Plus-Editor built: GUI ${revision}; core ${coreRevision}; security ${securityVersion}; site ${siteRevision}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildPages();
