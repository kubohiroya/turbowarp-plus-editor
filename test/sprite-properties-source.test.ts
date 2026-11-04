import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {readPins, root, verifySpritePropertiesDependency} from '../scripts/site/source.ts';

test('sprite properties archive and installed browser assets match the fixed local release', async () => {
    const pins = await readPins();
    assert.deepEqual(await verifySpritePropertiesDependency(root, pins), {
        package: pins.spritePropertiesPackage, version: pins.spritePropertiesVersion,
        revision: pins.spritePropertiesRevision, source: 'local-tarball',
        artifact: pins.spritePropertiesArtifact, integrity: pins.spritePropertiesIntegrity, featureDefault: false
    });
});

test('sprite properties rejects changed archive bytes, lock integrity and installed browser assets', async () => {
    const pins = await readPins();
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tw175-source-'));
    try {
        const packagePath = path.join('node_modules', pins.spritePropertiesPackage);
        for (const file of ['package.json', 'package-lock.json', pins.spritePropertiesArtifact, packagePath]) {
            await fs.cp(path.join(root, file), path.join(directory, file), {recursive: true});
        }
        await fs.appendFile(path.join(directory, pins.spritePropertiesArtifact), 'changed');
        await assert.rejects(verifySpritePropertiesDependency(directory, pins), /bytes differ.*tgz/);
        await fs.copyFile(path.join(root, pins.spritePropertiesArtifact), path.join(directory, pins.spritePropertiesArtifact));

        for (const file of ['index.js', 'styles.css']) {
            const location = path.join(packagePath, 'dist', file);
            await fs.appendFile(path.join(directory, location), 'changed');
            await assert.rejects(verifySpritePropertiesDependency(directory, pins), /bytes differ/);
            await fs.copyFile(path.join(root, location), path.join(directory, location));
        }

        const lockPath = path.join(directory, 'package-lock.json');
        const lock = JSON.parse(await fs.readFile(lockPath, 'utf8'));
        lock.packages[packagePath.replaceAll(path.sep, '/')].integrity = 'changed';
        await fs.writeFile(lockPath, JSON.stringify(lock));
        await assert.rejects(verifySpritePropertiesDependency(directory, pins), /lock integrity differs/);
    } finally {
        await fs.rm(directory, {recursive: true, force: true});
    }
});
