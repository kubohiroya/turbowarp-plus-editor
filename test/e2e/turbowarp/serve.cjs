const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(require('./gui-root.cjs')(), 'build');
const prefix = process.env.E2E_PATH_PREFIX || '/turbowarp-plus-editor/';
if (!fs.existsSync(path.join(root, 'build-info.json'))) {
    throw new Error('Build the Pages application first: npm run build');
}
const types = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.wasm': 'application/wasm',
    '.sb3': 'application/octet-stream'
};
const server = http.createServer((request, response) => {
    let filename;
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (!pathname.startsWith(prefix)) throw new Error('Unknown application path');
        filename = path.resolve(root, pathname.slice(prefix.length) || 'index.html');
        if (!filename.startsWith(`${root}${path.sep}`)) throw new Error('Invalid path');
        if (fs.statSync(filename).isDirectory()) filename = path.join(filename, 'index.html');
        if (!fs.statSync(filename).isFile()) throw new Error('Not a file');
    } catch {
        response.writeHead(404).end('Not found');
        return;
    }
    response.writeHead(200, {
        'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
        'Cache-Control': 'no-store'
    });
    fs.createReadStream(filename).on('error', () => response.destroy())
        .pipe(response);
});
server.on('error', error => {
    console.error(error); process.exitCode = 1;
});
server.listen(Number(process.env.E2E_PORT || 8732), '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
