import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {readPins, sha} from './source.mjs';
import {contentHash} from './extension-assets.mjs';

const pins = await readPins();
assert.ok(sha(process.env.EXPECTED_REVISION), 'Full site revision required');
const directory = process.argv[2];
assert.ok(directory);
const info = JSON.parse(await fs.readFile(path.join(directory, 'build-info.json'), 'utf8'));
assert.equal(info.siteRepository, 'https://github.com/kubohiroya/turbowarp-plus-editor');
assert.equal(info.siteRevision, process.env.EXPECTED_REVISION);
assert.equal(info.repository, `https://github.com/${pins.guiRepository}`);
assert.equal(info.revision, pins.guiRevision);
assert.equal(info.coreRepository, `https://github.com/${pins.coreRepository}`);
assert.equal(info.coreRevision, pins.coreRevision);
assert.equal(info.coreVersion, pins.coreVersion);
assert.equal(info.securityPackage, pins.securityPackage);
assert.equal(info.securityVersion, pins.securityVersion);
for (const file of ['index.html', 'editor.html', 'player.html', 'LICENSE', 'NOTICE', 'assets/icon.svg', 'assets/edit-button.css']) {
    assert.ok((await fs.stat(path.join(directory, file))).isFile(), `Missing site file: ${file}`);
}
if (pins.loaderRepository) {
    const integration = info.extensionIntegration;
    assert.ok(integration, 'Missing published extension integration identity');
    for (const key of ['loaderRepository', 'loaderRevision', 'vmRepository', 'vmRevision', 'packagerRepository', 'packagerRevision']) {
        assert.equal(integration[key], pins[key], `Extension integration differs: ${key}`);
    }
    assert.equal(integration.featureDefault, false, 'Extension loader must default off');
    for (const name of ['plus-packager.html', 'plus-packager.js']) {
        assert.equal(contentHash(await fs.readFile(path.join(directory, name))), integration.assets[name], `Asset changed: ${name}`);
    }
}
console.log('The site artifact matches the checked integration sources.');
