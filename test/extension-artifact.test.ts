import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {readPins, validatePins, root} from '../scripts/site/source.ts';
import {contentHash} from '../scripts/site/extension-assets.ts';
import {requiredFamilyPackages} from '../scripts/site/family-notices.ts';

test('production pins reject incomplete or unpinned extension dependency graphs', async () => {
    const pins = await readPins();
    for (const changes of [{loaderRevision: 'main'}, {vmRevision: 'develop'}, {packagerRevision: 'latest'},
        {loaderRepository: undefined}, {vmRepository: 'TurboWarp/scratch-vm'},
        {securityRevision: 'main'}, {securityRevision: '0.4.0'},
        {loaderSource: 'local'}, {loaderSource: 'npm', loaderVersion: 'latest'},
        {loaderSource: 'npm', loaderIntegrity: 'unknown'}]) {
        assert.throws(() => validatePins({...pins, ...changes}));
    }
});

// The integration preview builds the same Editor through the same webpack config, so it has to pin
// the same GUI. A GUI older than the Plus integration socket stops that build, and one that is
// merely older previews an Editor that is not the one being shipped.
test('the integration preview pins the same sources as the normal build', async () => {
    const preview = JSON.parse(await fs.readFile(path.join(root, 'site/extension-source.json'), 'utf8'));
    assert.deepEqual(preview, await readPins());
});

test('the deployment gate rejects changed builder assets and disabled-by-default metadata', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'twplus-deploy-gate-'));
    try {
        const pins = await readPins();
        const revision = 'a'.repeat(40);
        const integration: {featureDefault: boolean; assets: Record<string, string>; loaderRevision?: string;
            loaderSource?: string; loaderIntegrity?: string} = {featureDefault: true, assets: {}};
        for (const key of ['loaderRepository', 'loaderRevision', 'loaderVersion', 'loaderIntegrity', 'vmRepository', 'vmRevision', 'packagerRepository', 'packagerRevision']) integration[key] = pins[key];
        integration.loaderSource = pins.loaderSource || 'git';
        const files = ['index.html', 'editor.html', 'player.html', 'LICENSE', 'NOTICE', 'assets/icon.svg',
            'assets/edit-button.css', 'plus-packager.html', 'plus-packager.js'];
        for (const name of files) {
            await fs.mkdir(path.dirname(path.join(directory, name)), {recursive: true});
            await fs.writeFile(path.join(directory, name), 'checked asset');
        }
        for (const name of ['plus-packager.html', 'plus-packager.js']) integration.assets[name] = contentHash('checked asset');
        const info = {siteRepository: 'https://github.com/kubohiroya/turbowarp-plus-editor', siteRevision: revision,
            repository: `https://github.com/${pins.guiRepository}`, revision: pins.guiRevision,
            coreRepository: `https://github.com/${pins.coreRepository}`, coreRevision: pins.coreRevision, coreVersion: pins.coreVersion,
            securityPackage: pins.securityPackage, securityVersion: pins.securityVersion, securityRevision: pins.securityRevision,
            extensionIntegration: integration, familyNotices: {index: 'notices/family.json'}};
        const writeInfo = () => fs.writeFile(path.join(directory, 'build-info.json'), JSON.stringify(info));
        const family = {packages: requiredFamilyPackages.map(name => ({package: name, version: '1.0.0',
            files: [`notices/${name.split('/').at(-1)}/LICENSE`], source: {repository: 'https://github.com/kubohiroya/example'}}))};
        for (const entry of family.packages) {
            await fs.mkdir(path.join(directory, path.dirname(entry.files[0])), {recursive: true});
            await fs.writeFile(path.join(directory, entry.files[0]), 'license text');
        }
        const writeFamily = () => fs.writeFile(path.join(directory, 'notices/family.json'), JSON.stringify(family));
        await writeFamily();
        const check = () => spawnSync(process.execPath, [path.join(root, 'scripts/site/check-artifact.ts'), directory], {
            env: {...process.env, EXPECTED_REVISION: revision}, encoding: 'utf8'});
        await writeInfo();
        assert.equal(check().status, 0);
        info.securityRevision = 'f'.repeat(40);
        await writeInfo();
        assert.notEqual(check().status, 0);
        info.securityRevision = pins.securityRevision;
        await writeInfo();
        info.coreVersion = '0.5.0';
        await writeInfo();
        assert.notEqual(check().status, 0);
        info.coreVersion = pins.coreVersion;
        await writeInfo();
        await fs.writeFile(path.join(directory, 'plus-packager.js'), 'unreviewed replacement');
        assert.notEqual(check().status, 0);
        await fs.writeFile(path.join(directory, 'plus-packager.js'), 'checked asset');
        integration.featureDefault = false;
        await writeInfo();
        assert.notEqual(check().status, 0);
        integration.featureDefault = true;
        integration.loaderRevision = 'b'.repeat(40);
        await writeInfo();
        assert.notEqual(check().status, 0);
        integration.loaderRevision = pins.loaderRevision;
        // A published loader identity must match the tarball and source the pins name.
        integration.loaderIntegrity = 'sha512-' + Buffer.alloc(64, 3).toString('base64');
        await writeInfo();
        assert.notEqual(check().status, 0);
        integration.loaderIntegrity = pins.loaderIntegrity;
        assert.equal(pins.loaderSource, 'npm', 'production pins the published npm loader');
        integration.loaderSource = 'git';
        await writeInfo();
        assert.notEqual(check().status, 0);
        integration.loaderSource = 'npm';
        await writeInfo();
        assert.equal(check().status, 0);
        // Every bundled family package keeps its license text and source in the published notices.
        const removed = family.packages.shift();
        await writeFamily();
        assert.match(check().stderr, /Bundled family package without notices/);
        family.packages.unshift(removed);
        await fs.rm(path.join(directory, removed.files[0]));
        await writeFamily();
        assert.match(check().stderr, /Missing notice|ENOENT/);
    } finally { await fs.rm(directory, {recursive: true, force: true}); }
});
