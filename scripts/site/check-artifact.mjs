import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {readPins, sha} from './source.mjs';

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
assert.equal(info.securityPackage, pins.securityPackage);
assert.equal(info.securityVersion, pins.securityVersion);
for (const file of ['index.html', 'editor.html', 'player.html', 'LICENSE', 'NOTICE', 'assets/icon.svg', 'assets/edit-button.css']) {
    assert.ok((await fs.stat(path.join(directory, file))).isFile(), `Missing site file: ${file}`);
}
console.log('The site artifact matches the checked integration sources.');
