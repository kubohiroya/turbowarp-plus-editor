const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {createRequire} = require('node:module');
const {setTimeout: delay} = require('node:timers/promises');

const hostRoot = path.resolve(__dirname, '..');
const repo = process.env.E2E_GUI_ROOT || path.join(hostRoot, '.host', 'scratch-gui');
const guiRequire = createRequire(path.join(repo, 'package.json'));
const storage = path.join(hostRoot, '.local-preview', 'security');
const fixturePath = 'local-security-preview';
const required = [
    'editor.html', 'js/iframe-extension-worker.js',
    `${fixturePath}/extension-security-preview.sb3`,
    `${fixturePath}/previewbanner.js`, `${fixturePath}/previewgithub.js`,
    `${fixturePath}/previewcommon.js`, `${fixturePath}/extension-banner.png`
];
// A synchronously imported iframe worker is carried by the editor chunk instead of a lazy chunk.
const requiredFiles = manifest => required.map(name => name === 'js/iframe-extension-worker.js' ?
    manifest.iframeWorkerAsset || name : name);
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const contentTypes = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
    '.wasm': 'application/wasm', '.woff2': 'font/woff2'
};

async function createFixture (directory, port) {
    const JSZip = require('@turbowarp/jszip');
    const target = path.join(directory, fixturePath);
    await fs.mkdir(target, {recursive: true});
    await fs.copyFile(path.join(repo, 'src/lib/libraries/extensions/music/music.png'),
        path.join(target, 'extension-banner.png'));
    const extensions = [
        ['previewbanner', 'バナー表示の確認', '// Banner: /local-security-preview/extension-banner.png'],
        ['previewgithub', 'GitHubプレビューの確認',
            '// Repository: https://github.com/kubohiroya/turbowarp-extension-security-dialog'],
        ['previewcommon', '共通バナーの確認', '']
    ];
    for (const [id, name, metadata] of extensions) {
        const source = `// Name: ${name}\n// Author: ローカル確認用サンプル\n// Version: 1.0.0\n${metadata}\n` +
            `(function (Scratch) {\n    Scratch.extensions.register({\n` +
            `        getInfo () { return {id: ${JSON.stringify(id)}, name: ${JSON.stringify(name)},\n` +
            `            blocks: [{opcode: 'getValue', blockType: Scratch.BlockType.REPORTER, text: ${JSON.stringify(name)}}]}; },\n` +
            `        getValue () { return ${JSON.stringify(name)}; }\n    });\n})(Scratch);\n`;
        await fs.writeFile(path.join(target, `${id}.js`), source);
    }
    const zip = new JSZip();
    const makeTarget = async (isStage, filename) => {
        const data = await fs.readFile(path.join(repo, 'src/lib/default-project', filename));
        const assetId = crypto.createHash('md5').update(data).digest('hex');
        zip.file(`${assetId}.svg`, data);
        return {
            isStage, name: isStage ? 'Stage' : 'スプライト1', variables: {}, lists: {},
            broadcasts: {}, blocks: {}, comments: {}, currentCostume: 0,
            costumes: [{assetId, name: 'costume1', md5ext: `${assetId}.svg`, dataFormat: 'svg',
                rotationCenterX: isStage ? 240 : 31, rotationCenterY: isStage ? 180 : 59}],
            sounds: [], volume: 100, layerOrder: isStage ? 0 : 1,
            ...(isStage ? {} : {visible: true, x: 0, y: 0, size: 100, direction: 90,
                draggable: false, rotationStyle: 'all around'})
        };
    };
    const targets = [await makeTarget(true, 'cd21514d0531fdffb22204e0ec5ed84a.svg'),
        await makeTarget(false, 'dango-cat.svg')];
    const extensionURLs = {};
    extensions.forEach(([id], index) => {
        extensionURLs[id] = `http://127.0.0.1:${port}/${fixturePath}/${id}.js`;
        targets[1].blocks[`preview-${id}`] = {
            opcode: `${id}_getValue`, next: null, parent: null, inputs: {}, fields: {},
            shadow: false, topLevel: true, x: 40, y: 40 + (index * 80)
        };
    });
    zip.file('project.json', JSON.stringify({targets, monitors: [], extensions: extensions.map(([id]) => id),
        extensionURLs, meta: {semver: '3.0.0', vm: '0.2.0', agent: 'local-security-preview'}}));
    await fs.writeFile(path.join(target, 'extension-security-preview.sb3'),
        await zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'}));
}

async function createManifest (directory, port) {
    const files = {};
    async function visit (relative) {
        for (const entry of await fs.readdir(path.join(directory, relative), {withFileTypes: true})) {
            const name = path.posix.join(relative, entry.name);
            if (entry.isDirectory()) await visit(name);
            else if (entry.isFile()) files[name] = digest(await fs.readFile(path.join(directory, name)));
            else throw new Error(`通常ファイルではありません: ${name}`);
        }
    }
    await visit('');
    return {version: 1, port, createdAt: new Date().toISOString(), files};
}

async function validateSnapshot (directory, manifest) {
    if (manifest.version !== 1 || !manifest.files) throw new Error('配信マニフェストが不正です。再ビルドしてください。');
    for (const name of requiredFiles(manifest)) {
        if (!manifest.files[name]) throw new Error(`必要なファイルがありません: ${name}`);
    }
    for (const [name, hash] of Object.entries(manifest.files)) {
        if (name.includes('\\') || path.isAbsolute(name) || name.split('/').includes('..')) {
            throw new Error(`配信パスが不正です: ${name}`);
        }
        const filename = path.join(directory, name);
        const stat = await fs.lstat(filename);
        if (!stat.isFile() || digest(await fs.readFile(filename)) !== hash) {
            throw new Error(`ファイルがビルド時と一致しません: ${name}。再ビルドしてください。`);
        }
    }
}

async function buildSnapshot (port) {
    // A new output directory keeps an already running editor's lazy chunks intact.
    const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const directory = path.join(storage, id);
    await fs.mkdir(directory, {recursive: true});
    Object.assign(process.env, {NODE_ENV: 'development', CI: '1', ROOT: '', STATIC_PATH: '/static',
        ENABLE_SERVICE_WORKER: '', BUILD_MODE: ''});
    process.chdir(repo);
    const webpack = guiRequire('webpack');
    const HtmlWebpackPlugin = guiRequire('html-webpack-plugin');
    process.env.E2E_GUI_ROOT = repo;
    const config = require('./site/webpack.config.cts');
    // A local package is opt-in here; published site builds keep their pinned dependency.
    const securityRoot = process.env.TW_PLUS_SECURITY_PREVIEW_ROOT;
    let securityPreview;
    if (securityRoot) {
        if (!path.isAbsolute(securityRoot)) throw new Error('TW_PLUS_SECURITY_PREVIEW_ROOTは絶対パスで指定してください。');
        const pkg = JSON.parse(await fs.readFile(path.join(securityRoot, 'package.json'), 'utf8'));
        if (pkg.name !== '@kubohiroya/turbowarp-extension-security-dialog') throw new Error('確認用パッケージが一致しません。');
        for (const [subpath, file] of [['', 'dist/index.mjs'], ['/react', 'dist/react.mjs'],
            ['/turbowarp', 'dist/turbowarp.mjs'], ['/webpack4.css', 'webpack4.css']]) {
            const target = path.join(securityRoot, file);
            if (!(await fs.stat(target)).isFile()) throw new Error(`確認用ビルドがありません: ${target}`);
            config.resolve.alias[pkg.name + subpath + '$'] = target;
        }
        securityPreview = {root: securityRoot,
            ...JSON.parse(await fs.readFile(path.join(securityRoot, 'dist/build-info.json'), 'utf8'))};
    }
    config.entry = {editor: './src/playground/editor.jsx'};
    config.output.path = directory;
    config.plugins = config.plugins.filter(plugin => !(plugin instanceof HtmlWebpackPlugin) ||
        plugin.options.filename === 'editor.html');
    console.log('エディターと全ワーカーを専用ディレクトリへビルドしています…');
    const stats = await new Promise((resolve, reject) => {
        webpack(config, (error, result) => {
            if (error) reject(error);
            else if (result.hasErrors()) reject(new Error(result.toString({all: false, errors: true})));
            else resolve(result);
        });
    });
    if (stats.hasWarnings()) console.warn(stats.toString({all: false, warnings: true}));
    await createFixture(directory, port);
    const manifest = await createManifest(directory, port);
    const iframeWorker = stats.compilation.modules.find(module => module.resource &&
        module.resource.endsWith('/extension-support/tw-iframe-extension-worker.js'));
    if (iframeWorker && [...iframeWorker.chunksIterable].some(chunk => chunk.files.includes('js/editor.js'))) {
        manifest.iframeWorkerAsset = 'js/editor.js';
    }
    if (securityPreview) manifest.securityPreview = securityPreview;
    manifest.commit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim();
    manifest.dirty = Boolean(execFileSync('git', ['status', '--porcelain'], {cwd: repo, encoding: 'utf8'}).trim());
    manifest.hostCommit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: hostRoot, encoding: 'utf8'}).trim();
    manifest.hostDirty = Boolean(execFileSync('git', ['status', '--porcelain'], {cwd: hostRoot, encoding: 'utf8'}).trim());
    await validateSnapshot(directory, manifest);
    await fs.writeFile(path.join(directory, 'preview-manifest.json'), JSON.stringify(manifest, null, 2));
    // Only publish the pointer once the complete snapshot has passed validation.
    const pointer = path.join(storage, `current-${id}.json`);
    await fs.writeFile(pointer, JSON.stringify({id}));
    await fs.rename(pointer, path.join(storage, 'current.json'));
    console.log(`ビルド完了: ${directory}`);
    return {directory, manifest};
}

async function currentSnapshot (port) {
    const {id} = JSON.parse(await fs.readFile(path.join(storage, 'current.json'), 'utf8'));
    if (!/^\d+-[a-f0-9]+$/.test(id)) throw new Error('配信先が不正です。再ビルドしてください。');
    const directory = path.join(storage, id);
    const manifest = JSON.parse(await fs.readFile(path.join(directory, 'preview-manifest.json'), 'utf8'));
    if (manifest.port !== port) throw new Error(`このビルドはポート${manifest.port}用です。--port ${port}で再ビルドしてください。`);
    await validateSnapshot(directory, manifest);
    return {directory, manifest};
}

function createServer (directory, manifest) {
    return http.createServer(async (request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        try {
            const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1) || 'editor.html';
            const listed = Object.prototype.hasOwnProperty.call(manifest.files, name);
            if (!listed && name !== 'preview-manifest.json') {
                response.writeHead(404).end('Not found');
                return;
            }
            if (request.method !== 'GET' && request.method !== 'HEAD') {
                response.writeHead(405, {Allow: 'GET, HEAD'}).end();
                return;
            }
            const data = await fs.readFile(path.join(directory, name));
            response.writeHead(200, {'Content-Type': contentTypes[path.extname(name)] || 'application/octet-stream',
                'Content-Length': data.length});
            response.end(request.method === 'HEAD' ? undefined : data);
        } catch (error) {
            response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('File unavailable');
        }
    });
}

function listen (server, port) {
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen({host: '127.0.0.1', port, backlog: 128}, () => {
            server.removeListener('error', reject);
            resolve();
        });
    });
}

function get (url) {
    return new Promise((resolve, reject) => {
        const request = http.get(url, response => {
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => {
                if (response.statusCode !== 200) reject(new Error(`HTTP ${response.statusCode}: ${url}`));
                else resolve({data: Buffer.concat(chunks), headers: response.headers});
            });
            response.on('error', reject);
        });
        request.setTimeout(10000, () => request.destroy(new Error(`取得タイムアウト: ${url}`)));
        request.on('error', reject);
    });
}

async function checkHttp (port, expected) {
    const base = `http://127.0.0.1:${port}/`;
    const manifest = JSON.parse((await get(`${base}preview-manifest.json`)).data);
    if (manifest.version !== 1 || manifest.port !== port || !manifest.files) throw new Error('確認対象サーバーが一致しません。');
    if (expected && JSON.stringify(manifest) !== JSON.stringify(expected)) throw new Error('配信ビルドが一致しません。');
    const names = [...new Set([...requiredFiles(manifest), ...Object.keys(manifest.files).filter(name => /\.(js|html)$/.test(name))])];
    for (const name of names) {
        const {data, headers} = await get(`${base}${name}`);
        if (digest(data) !== manifest.files[name] || headers['cache-control'] !== 'no-store') {
            throw new Error(`HTTP配信内容が一致しません: ${name}`);
        }
        if (name.endsWith('.js') && !headers['content-type'].startsWith('text/javascript')) {
            throw new Error(`JavaScriptのContent-Typeが不正です: ${name}`);
        }
    }
    console.log(`HTTP確認成功: ${names.length}ファイル（エディター・全JSチャンク・確認用SB3・機能拡張・バナー）`);
}

async function main () {
    const args = process.argv.slice(2);
    if (args.includes('--help')) {
        console.log('npm run preview:security -- [start|build|serve|check] [--port 8601]\n既定はstart（ビルドして配信）。停止はCtrl+C。\nTW_PLUS_SECURITY_PREVIEW_ROOTでビルド済み共通パッケージの絶対パスを指定できます。');
        return;
    }
    const command = args[0] && !args[0].startsWith('--') ? args.shift() : 'start';
    const portIndex = args.indexOf('--port');
    const port = portIndex === -1 ? 8601 : Number(args.splice(portIndex, 2)[1]);
    if (!['start', 'build', 'serve', 'check'].includes(command) || args.length ||
        !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('引数が不正です。--helpを確認してください。');
    if (command === 'check') {
        // launchctl returns before the child has finished validating its files.
        for (let attempt = 0; attempt < 10; attempt++) {
            try {
                return await checkHttp(port);
            } catch (error) {
                if (error.code !== 'ECONNREFUSED' || attempt === 9) throw error;
                await delay(500);
            }
        }
    }
    if (command === 'build') return buildSnapshot(port);
    // Fail on a conflicting server before doing an expensive build; never kill it.
    const probe = http.createServer();
    await listen(probe, port);
    await new Promise(resolve => probe.close(resolve));
    const {directory, manifest} = command === 'start' ? await buildSnapshot(port) : await currentSnapshot(port);
    const server = createServer(directory, manifest);
    await listen(server, port);
    try {
        await checkHttp(port, manifest);
    } catch (error) {
        server.close();
        throw error;
    }
    const url = new URL(`http://127.0.0.1:${port}/editor.html`);
    url.search = new URLSearchParams({lang: 'ja',
        project_url: `http://127.0.0.1:${port}/${fixturePath}/extension-security-preview.sb3`}).toString();
    console.log(`\n確認URL: ${url}\n配信先: ${directory}\n停止: このターミナルでCtrl+C`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));
}

if (require.main === module) main().catch(error => {
    console.error(`ローカル確認を開始できません: ${error.message}`);
    if (error.code === 'EADDRINUSE') console.error('ポートは使用中です。既存の配信を確認して停止するか、--portで変更してください。');
    process.exitCode = 1;
});

module.exports = {createManifest, validateSnapshot, createServer, listen, checkHttp};
