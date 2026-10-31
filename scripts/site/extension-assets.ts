import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {root} from './source.ts';

export const contentHash = bytes => createHash('sha256').update(bytes).digest('hex');

/** Publish the same host/runtime assets that the integration preview verifies. */
export async function buildExtensionAssets(gui, pins) {
    for (const script of ['build-plus-scaffolding.cts', 'build-extension-runtime.cts', 'build-plus-packager.cts']) {
        const result = spawnSync(process.execPath, ['--openssl-legacy-provider', path.join(root, 'scripts/site', script)], {
            cwd: root, env: process.env, stdio: 'inherit'
        });
        if (result.error) throw result.error;
        assert.equal(result.status, 0, `${script} failed`);
    }
    const scaffoldRoot = path.resolve(process.env.TW_PLUS_SCAFFOLDING_ROOT || path.join(root, '.host/issue-4-artifacts/scaffolding'));
    const scaffolding = JSON.parse(await fs.readFile(path.join(scaffoldRoot, 'build-info.json'), 'utf8'));
    assert.equal(scaffolding.packagerRevision, pins.packagerRevision);
    const scriptHash = contentHash(await fs.readFile(path.join(gui, 'build/plus-packager.js')));
    const htmlPath = path.join(gui, 'build/plus-packager.html');
    const html = await fs.readFile(htmlPath, 'utf8');
    const versionedHTML = html.replace('src="plus-packager.js"', `src="plus-packager.js?v=${scriptHash}"`);
    assert.notEqual(versionedHTML, html, 'Builder HTML must reference its bundled runtime');
    await fs.writeFile(htmlPath, versionedHTML);
    const assets = {};
    for (const name of ['plus-packager.html', 'plus-packager.js']) {
        assets[name] = contentHash(await fs.readFile(path.join(gui, 'build', name)));
    }
    return {loaderRepository: pins.loaderRepository, loaderRevision: pins.loaderRevision,
        vmRepository: pins.vmRepository, vmRevision: pins.vmRevision,
        packagerRepository: pins.packagerRepository, packagerRevision: pins.packagerRevision,
        featureDefault: false, assets, scaffolding};
}
