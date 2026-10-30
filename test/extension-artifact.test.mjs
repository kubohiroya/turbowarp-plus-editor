import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {readPins, validatePins, root} from '../scripts/site/source.mjs';
import {contentHash} from '../scripts/site/extension-assets.mjs';

test('production pins reject incomplete or unpinned extension dependency graphs', async () => {
    const pins = await readPins();
    for (const changes of [{loaderRevision: 'main'}, {vmRevision: 'develop'}, {packagerRevision: 'latest'},
        {loaderRepository: undefined}, {vmRepository: 'TurboWarp/scratch-vm'}]) {
        assert.throws(() => validatePins({...pins, ...changes}));
    }
});

test('the deployment gate rejects changed builder assets and enabled-by-default metadata', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'twplus-deploy-gate-'));
    try {
        const pins = await readPins();
        const revision = 'a'.repeat(40);
        const integration = {featureDefault: false, assets: {}};
        for (const key of ['loaderRepository', 'loaderRevision', 'vmRepository', 'vmRevision', 'packagerRepository', 'packagerRevision']) integration[key] = pins[key];
        const files = ['index.html', 'editor.html', 'player.html', 'LICENSE', 'NOTICE', 'assets/icon.svg',
            'assets/edit-button.css', 'plus-packager.html', 'plus-packager.js'];
        for (const name of files) {
            await fs.mkdir(path.dirname(path.join(directory, name)), {recursive: true});
            await fs.writeFile(path.join(directory, name), 'checked asset');
        }
        for (const name of ['plus-packager.html', 'plus-packager.js']) integration.assets[name] = contentHash('checked asset');
        const info = {siteRepository: 'https://github.com/kubohiroya/turbowarp-plus-editor', siteRevision: revision,
            repository: `https://github.com/${pins.guiRepository}`, revision: pins.guiRevision,
            coreRepository: `https://github.com/${pins.coreRepository}`, coreRevision: pins.coreRevision,
            securityPackage: pins.securityPackage, securityVersion: pins.securityVersion, extensionIntegration: integration};
        const writeInfo = () => fs.writeFile(path.join(directory, 'build-info.json'), JSON.stringify(info));
        const check = () => spawnSync(process.execPath, [path.join(root, 'scripts/site/check-artifact.mjs'), directory], {
            env: {...process.env, EXPECTED_REVISION: revision}, encoding: 'utf8'});
        await writeInfo();
        assert.equal(check().status, 0);
        await fs.writeFile(path.join(directory, 'plus-packager.js'), 'unreviewed replacement');
        assert.notEqual(check().status, 0);
        await fs.writeFile(path.join(directory, 'plus-packager.js'), 'checked asset');
        integration.featureDefault = true;
        await writeInfo();
        assert.notEqual(check().status, 0);
        integration.featureDefault = false;
        integration.loaderRevision = 'b'.repeat(40);
        await writeInfo();
        assert.notEqual(check().status, 0);
    } finally { await fs.rm(directory, {recursive: true, force: true}); }
});
