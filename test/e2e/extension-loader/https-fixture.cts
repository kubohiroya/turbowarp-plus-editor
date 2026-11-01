const https = require('node:https');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');

// Real TLS responses exercise Chromium's CORS/redirect behavior without route emulation.
exports.createHTTPSFixture = async function(body) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-plus-tls-'));
    const key = path.join(directory, 'key.pem');
    const cert = path.join(directory, 'cert.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key,
        '-out', cert, '-days', '1', '-subj', '/CN=localhost'], {stdio: 'ignore'});
    const seen = [];
    let flaky = 0;
    const server = https.createServer({key: await fs.readFile(key), cert: await fs.readFile(cert)}, (request, response) => {
        seen.push(request.url);
        if (request.url === '/redirect') {
            response.writeHead(302, {'access-control-allow-origin': '*', location: '/final'}).end();
        } else if (request.url === '/flaky' && flaky > 0) {
            // A server-side failure the Loader is expected to ask again about, unlike a 404.
            flaky--;
            response.writeHead(503, {'access-control-allow-origin': '*'}).end();
        } else {
            response.writeHead(200, {'content-type': 'application/javascript',
                ...(request.url === '/nocors' ? {} : {'access-control-allow-origin': '*'})}).end(body);
        }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    return {url: `https://127.0.0.1:${server.address().port}`, seen,
        failNext(times) { flaky = times; },
        async close() { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
            await fs.rm(directory, {recursive: true, force: true}); }};
};
