import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {readYamlEditorFlags} from '../site/yaml-editor/feature-flags.js';
import {buildYamlEditor} from '../scripts/site/build-yaml-editor.mjs';

test('the startup flag is explicit, immutable and off by default', () => {
    for (const search of ['', '?twPlusYamlEditor=0', '?twPlusYamlEditor=true']) {
        assert.equal(readYamlEditorFlags(search).embeddedYamlEditor, false);
    }
    const enabled = readYamlEditorFlags('?lang=ja&twPlusYamlEditor=1');
    assert.equal(enabled.embeddedYamlEditor, true);
    assert(Object.isFrozen(enabled));
});

test('the optional generic browser bundle excludes App parsers and injects once', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'twpe-yaml-build-'));
    try {
        await fs.writeFile(path.join(directory, 'editor.html'), '<!doctype html><html><head><title>Editor</title></head><body><div id="app"></div></body></html>');
        const built = await buildYamlEditor(directory);
        await buildYamlEditor(directory);
        const html = await fs.readFile(path.join(directory, 'editor.html'), 'utf8');
        assert.equal((html.match(/data-twpe-yaml-bootstrap/gu) || []).length, 1);
        assert.equal(built.shared.package, '@kubohiroya/turbowarp-embedded-yaml');
        assert.match(built.shared.entrySha256, /^[a-f0-9]{64}$/u);
        assert(!built.inputs.some(input => /turbowarp-kamishibai-app/u.test(input)));
        const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
        const sharedEntry = fileURLToPath(import.meta.resolve('@kubohiroya/turbowarp-embedded-yaml'));
        assert(built.inputs.some(input => path.resolve(repoRoot, input).startsWith(path.dirname(sharedEntry) + path.sep)));
        assert.equal(built.documents.package, '@kubohiroya/turbowarp-document-data');
        assert.match(built.documents.entrySha256, /^[a-f0-9]{64}$/u);
        assert(!built.inputs.some(input => /source-documents|yaml-json|node_modules\/(?:yaml|ajv)\//u.test(input)));
        assert(built.notices.includes('notices/document-data-LICENSE'));
        assert(!built.inputs.some(input => /scratch-(?:vm|render|audio)/u.test(input)));
        assert(built.notices.includes('notices/embedded-yaml-LICENSE'));
        assert(!built.notices.some(input => /kamishibai/u.test(input)));
        const bootstrap = await fs.readFile(path.join(directory, 'yaml-editor/bootstrap.js'), 'utf8');
        assert(bootstrap.indexOf('if (yamlEditorFlags.embeddedYamlEditor)') < bootstrap.indexOf("import('./client.js')"));
    } finally { await fs.rm(directory, {recursive: true, force: true}); }
});
