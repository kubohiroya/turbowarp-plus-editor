const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {createManifest, validateSnapshot, createServer, listen, checkHttp} =
    require('../../../../scripts/local-security-preview.cts');

test('incomplete or modified snapshots are rejected before serving', async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'security-preview-'));
    t.after(() => fs.rm(directory, {recursive: true, force: true}));
    const files = ['editor.html', 'js/iframe-extension-worker.js',
        'local-security-preview/extension-security-preview.sb3',
        'local-security-preview/previewbanner.js', 'local-security-preview/previewgithub.js',
        'local-security-preview/previewcommon.js', 'local-security-preview/extension-banner.png'];
    for (const name of files) {
        await fs.mkdir(path.dirname(path.join(directory, name)), {recursive: true});
        await fs.writeFile(path.join(directory, name), name);
    }
    const manifest = await createManifest(directory, 8601);
    await validateSnapshot(directory, manifest);
    const worker = path.join(directory, 'js/iframe-extension-worker.js');
    await fs.rm(worker);
    await assert.rejects(validateSnapshot(directory, manifest), {code: 'ENOENT'});
    await assert.rejects(validateSnapshot(directory, await createManifest(directory, 8601)), /iframe-extension-worker/);
    await fs.writeFile(worker, '<html>wrong build</html>');
    await assert.rejects(validateSnapshot(directory, manifest), /ビルド時と一致/);
    // A worker compiled into the editor needs no separate lazy chunk, but still needs its bytes.
    await fs.rm(worker);
    const editor = path.join(directory, 'js/editor.js');
    await fs.writeFile(editor, '/* editor with the inline iframe worker */');
    const inlineManifest = {...await createManifest(directory, 8601), iframeWorkerAsset: 'js/editor.js'};
    await validateSnapshot(directory, inlineManifest);
    await fs.rm(editor);
    await assert.rejects(validateSnapshot(directory, inlineManifest), {code: 'ENOENT'});
});

test('HTTP serves the selected snapshot without cache or fallback and detects missing chunks', async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'security-preview-http-'));
    t.after(() => fs.rm(directory, {recursive: true, force: true}));
    const files = ['editor.html', 'js/iframe-extension-worker.js', 'js/another-lazy-chunk.js',
        'local-security-preview/extension-security-preview.sb3',
        'local-security-preview/previewbanner.js', 'local-security-preview/previewgithub.js',
        'local-security-preview/previewcommon.js', 'local-security-preview/extension-banner.png'];
    for (const name of files) {
        await fs.mkdir(path.dirname(path.join(directory, name)), {recursive: true});
        await fs.writeFile(path.join(directory, name), name);
    }
    const manifest = await createManifest(directory, 0);
    const server = createServer(directory, manifest);
    await listen(server, 0);
    t.after(() => new Promise(resolve => server.close(resolve)));
    const port = server.address().port;
    manifest.port = port;
    await fs.writeFile(path.join(directory, 'preview-manifest.json'), JSON.stringify(manifest));
    await checkHttp(port, manifest);
    const status = name => new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/${name}`, response => {
            response.resume();
            resolve(response.statusCode);
        }).on('error', reject);
    });
    assert.equal(await status('missing.js'), 404);
    assert.equal(await status('../package.json'), 404);
    assert.equal(await status('%2e%2e%2fpackage.json'), 404);
    await fs.rm(path.join(directory, 'js/another-lazy-chunk.js'));
    await assert.rejects(checkHttp(port, manifest), /HTTP 404.*another-lazy-chunk/);
});
