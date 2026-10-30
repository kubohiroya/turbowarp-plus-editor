import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {generatePages} from './generate-pages.mjs';
import {brandEditor} from './brand-editor.mjs';
import {buildYamlEditor} from './build-yaml-editor.mjs';
import {root, readPins, verifyHost, sha} from './source.mjs';
import {buildExtensionAssets} from './extension-assets.mjs';

export async function buildPages(pins) {
    pins = pins || await readPins();
    const gui = process.env.E2E_GUI_ROOT;
    const {revision, coreRevision, securityVersion} = await verifyHost(gui, pins);
    const siteRevision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
    assert.ok(sha(siteRevision), 'Site source must have a full revision');
    const prefix = process.env.ROOT || '/turbowarp-plus-editor/';
    assert.equal(prefix, '/turbowarp-plus-editor/', 'Use the canonical TurboWarp-Plus-Editor prefix');
    const output = path.join(gui, 'build');
    await fs.rm(output, {recursive: true, force: true});
    const result = spawnSync(process.execPath, ['--openssl-legacy-provider',
        path.join(gui, 'node_modules/webpack/bin/webpack.js'), '--config', path.join(root, 'scripts/site/webpack.config.cjs'), '--bail'], {
        cwd: gui, stdio: 'inherit', env: {...process.env, NODE_ENV: 'production', ROOT: prefix, CI: '1'}
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
    await fs.rename(path.join(output, 'index.html'), path.join(output, 'player.html'));
    await generatePages(output, revision, coreRevision, {siteRevision, securityVersion, licensePath: path.join(gui, 'LICENSE')});
    const info = JSON.parse(await fs.readFile(path.join(output, 'build-info.json'), 'utf8'));
    assert.equal(info.repository, `https://github.com/${pins.guiRepository}`);
    assert.equal(info.revision, revision);
    assert.equal(info.coreRepository, `https://github.com/${pins.coreRepository}`);
    assert.equal(info.coreRevision, coreRevision);
    assert.equal(info.siteRepository, 'https://github.com/kubohiroya/turbowarp-plus-editor');
    assert.equal(info.siteRevision, siteRevision);
    assert.equal(info.securityPackage, pins.securityPackage);
    assert.equal(info.securityVersion, securityVersion);
    await brandEditor(output, prefix);
    if (pins.loaderRepository) {
        info.extensionIntegration = await buildExtensionAssets(gui, pins);
        await fs.writeFile(path.join(output, 'build-info.json'), `${JSON.stringify(info, null, 2)}\n`);
    }
    await buildYamlEditor(output, prefix);
    console.log(`TurboWarp-Plus-Editor built: GUI ${revision}; core ${coreRevision}; security ${securityVersion}; site ${siteRevision}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildPages();
