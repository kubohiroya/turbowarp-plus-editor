import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {buildDocumentEditorMetadata} from '../scripts/site/build-yaml-editor.mjs';

test('distribution keeps licenses and provenance while GUI owns the document editor bootstrap', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'twpe-document-build-'));
    try {
        const html = '<!doctype html><html><head><title>Editor</title><script src="gui.js"></script></head><body><div id="app"></div></body></html>';
        await fs.writeFile(path.join(directory, 'editor.html'), html.replace('</head>', '<script type="module" data-twpe-yaml-bootstrap src="yaml-editor/bootstrap.js"></script></head>'));
        await fs.mkdir(path.join(directory, 'yaml-editor'));
        await fs.writeFile(path.join(directory, 'yaml-editor/bootstrap.js'), 'throw new Error("Old bootstrap");');
        const built = await buildDocumentEditorMetadata(directory);
        await buildDocumentEditorMetadata(directory);
        assert.equal(await fs.readFile(path.join(directory, 'editor.html'), 'utf8'), html);
        assert.equal(built.mountOwner, 'scratch-gui');
        assert.equal(built.packages.length, 3);
        for (const name of ['document-editor', 'document-source', 'document-data']) {
            const metadata = built.packages.find(item => item.package === `@kubohiroya/turbowarp-${name}`);
            assert.match(metadata.entrySha256, /^[a-f0-9]{64}$/u);
            assert(built.notices.includes(`notices/turbowarp-${name}-LICENSE`));
        }
        assert.deepEqual((await fs.readdir(built.output)).sort(), ['build-info.json', 'notices']);
        await assert.rejects(fs.stat(path.join(directory, 'yaml-editor')), {code: 'ENOENT'});
    } finally { await fs.rm(directory, {recursive: true, force: true}); }
});
