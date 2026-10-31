import {createServer} from 'node:http';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {constants, createReadStream} from 'node:fs';
import {lstat, mkdir, mkdtemp, open, realpath, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pipeline} from 'node:stream/promises';
import {setTimeout as pause} from 'node:timers/promises';
import {createVSCodeProfile, launchVSCode} from './vscode.ts';
import {writeSchemaWorkspace} from './schema.ts';
import {normalizeSourceDocumentSchema} from '@kubohiroya/turbowarp-document-data/composition';

export const maxSourceBytes = 4 * 1024 * 1024;
export const apiPrefix = '/__twpe_yaml';
const maximumBodyBytes = maxSourceBytes * 6 + 2048;
const maximumSessions = 16;
const idPattern = /^[a-f0-9]{32}$/;
const loopbackAddresses = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const mimeTypes = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.map': 'application/json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
    '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.woff2': 'font/woff2',
    '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav'
};

function failure(status, code, message) {
    return Object.assign(new Error(message), {status, code});
}

function within(root, filename) {
    const relative = path.relative(root, filename);
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function json(response, status, value) {
    response.writeHead(status, {'content-type': 'application/json; charset=utf-8'});
    response.end(JSON.stringify(value));
}

async function readJSON(request) {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
        throw failure(415, 'JSON_REQUIRED', 'Use an application/json request.');
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > maximumBodyBytes) throw failure(413, 'SOURCE_TOO_LARGE', 'The YAML request is too large.');
        chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw failure(400, 'INVALID_JSON', 'The request is not valid JSON.'); }
}

async function readSourceOnce(filename) {
    const entry = await lstat(filename).catch(() => { throw failure(409, 'SOURCE_MISSING', 'The working YAML file is unavailable.'); });
    if (!entry.isFile() || entry.isSymbolicLink()) throw failure(403, 'UNSAFE_SOURCE', 'The working YAML must be a regular file.');
    let handle;
    try {
        handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
        const info = await handle.stat();
        if (!info.isFile()) throw failure(403, 'UNSAFE_SOURCE', 'The working YAML must be a regular file.');
        if (info.size > maxSourceBytes) throw failure(413, 'SOURCE_TOO_LARGE', 'The saved YAML exceeds the size limit.');
        const buffer = Buffer.alloc(maxSourceBytes + 1);
        let count = 0;
        while (count < buffer.length) {
            const result = await handle.read(buffer, count, buffer.length - count, count);
            if (!result.bytesRead) break;
            count += result.bytesRead;
        }
        if (count > maxSourceBytes) throw failure(413, 'SOURCE_TOO_LARGE', 'The saved YAML exceeds the size limit.');
        try { return new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(buffer.subarray(0, count)); }
        catch { throw failure(422, 'INVALID_ENCODING', 'Save the YAML as UTF-8.'); }
    } catch (error) {
        if (error.code === 'ELOOP') throw failure(403, 'UNSAFE_SOURCE', 'The working YAML must not be a symbolic link.');
        throw error;
    } finally { await handle?.close(); }
}

async function readStableSource(filename) {
    let previous = await readSourceOnce(filename);
    for (let attempt = 0; attempt < 5; attempt++) {
        await pause(15);
        const current = await readSourceOnce(filename);
        if (current === previous) return current;
        previous = current;
    }
    throw failure(409, 'SOURCE_UNSTABLE', 'The YAML is still being saved. Try importing it again.');
}

export interface YamlEditorHostOptions {
    siteDirectory?: string;
    dataDirectory?: string;
    launchEditor?: (filePath: string, profile: import('./vscode.ts').VSCodeLaunchProfile) => Promise<void>;
    port?: number;
}

export async function startYamlEditorHost({siteDirectory, dataDirectory, launchEditor = launchVSCode, port = 0}: YamlEditorHostOptions = {}) {
    if (typeof siteDirectory !== 'string' || !path.isAbsolute(siteDirectory)) {
        throw new TypeError('siteDirectory must be an absolute Editor build directory.');
    }
    if (typeof launchEditor !== 'function') throw new TypeError('launchEditor must be a function.');
    if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new TypeError('Invalid local server port.');
    const siteRoot = await realpath(siteDirectory);
    if (!(await stat(siteRoot)).isDirectory()) throw new TypeError('siteDirectory must be a directory.');
    const editorFile = await realpath(path.join(siteRoot, 'editor.html'));
    if (!within(siteRoot, editorFile) || !(await stat(editorFile)).isFile()) throw new TypeError('An Editor build with editor.html is required.');
    let storage;
    if (dataDirectory !== undefined) {
        if (typeof dataDirectory !== 'string' || !path.isAbsolute(dataDirectory)) throw new TypeError('dataDirectory must be absolute.');
        await mkdir(dataDirectory, {recursive: true, mode: 0o700});
        if (!(await lstat(dataDirectory)).isDirectory()) throw new TypeError('dataDirectory must not be a symbolic link.');
        const base = await realpath(dataDirectory);
        if (within(siteRoot, base)) throw new TypeError('Working YAML files must be outside the Editor site.');
        storage = await mkdtemp(path.join(base, 'twpe-yaml-'));
    } else storage = await mkdtemp(path.join(tmpdir(), 'twpe-yaml-'));
    const sessionsRoot = path.join(storage, 'sessions');
    const profile = await createVSCodeProfile(storage);
    await mkdir(sessionsRoot, {mode: 0o700});
    await writeFile(path.join(storage, 'host.json'), JSON.stringify({createdAt: new Date().toISOString(), dataDirectory: storage, vscodeProfile: profile}, null, 2), {mode: 0o600, flag: 'wx'});
    const token = randomBytes(32).toString('base64url');
    const sessions = new Map();
    let apiOrigin;
    let closing = false;
    let closePromise;
    let pendingSessions = 0;
    const server = createServer((request, response) => {
        void handle(request, response).catch(error => {
            if (response.headersSent) { response.destroy(); return; }
            json(response, error.status || 500, {error: error.status ? error.message : 'The local YAML operation failed.', code: error.code || 'YAML_HOST_ERROR'});
        });
    });
    server.requestTimeout = 15_000;
    server.headersTimeout = 10_000;

    function authorizeRequest(request) {
        if (!loopbackAddresses.has(request.socket.remoteAddress) || request.headers.host !== new URL(apiOrigin).host) {
            throw failure(403, 'INVALID_HOST', 'Only this loopback Editor host is accepted.');
        }
        if (request.headers.origin !== undefined && request.headers.origin !== apiOrigin) {
            throw failure(403, 'INVALID_ORIGIN', 'Use the local Editor from the same origin.');
        }
        const fetchSite = request.headers['sec-fetch-site'];
        if (fetchSite !== undefined && !['same-origin', 'none'].includes(fetchSite)) {
            throw failure(403, 'INVALID_ORIGIN', 'Cross-origin requests are not accepted.');
        }
    }

    function authorizeToken(request) {
        const received = request.headers['x-twpe-yaml-token'];
        if (typeof received !== 'string' || Buffer.byteLength(received) !== Buffer.byteLength(token) || !timingSafeEqual(Buffer.from(received), Buffer.from(token))) {
            throw failure(401, 'INVALID_TOKEN', 'The local YAML session token is missing or invalid.');
        }
        if (['POST', 'DELETE'].includes(request.method) && request.headers.origin !== apiOrigin) {
            throw failure(403, 'INVALID_ORIGIN', 'A same-origin request is required.');
        }
    }

    async function handleAPI(request, response, pathname) {
        if (closing) throw failure(503, 'HOST_CLOSED', 'The local YAML host is closing.');
        if (pathname === `${apiPrefix}/config`) {
            if (request.method !== 'GET') throw failure(405, 'METHOD_NOT_ALLOWED', 'Use GET for configuration.');
            json(response, 200, {available: true, token, editor: 'VSCode', maxSourceBytes});
            return;
        }
        authorizeToken(request);
        if (pathname === `${apiPrefix}/sessions` && request.method === 'POST') {
            if (sessions.size + pendingSessions >= maximumSessions) throw failure(429, 'SESSION_LIMIT', 'Close an existing YAML session first.');
            pendingSessions++;
            try {
                const input = await readJSON(request);
                if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).some(key => !['source', 'sourceName', 'schema', 'format'].includes(key))) {
                    throw failure(400, 'INVALID_SESSION', 'Supply source and optional sourceName, schema and format.');
                }
                const format = input.format === undefined ? 'yaml' : input.format;
                if (!['yaml', 'json'].includes(format)) throw failure(400, 'INVALID_FORMAT', 'Choose YAML or JSON.');
                if (typeof input.source !== 'string') throw failure(400, 'INVALID_SOURCE', 'The YAML source must be a string.');
                if (Buffer.byteLength(input.source, 'utf8') > maxSourceBytes) throw failure(413, 'SOURCE_TOO_LARGE', 'The YAML exceeds the size limit.');
                if (input.sourceName !== undefined && (typeof input.sourceName !== 'string' || input.sourceName.length > 256 || /[/\\\x00-\x1f\x7f]/u.test(input.sourceName) || ['.', '..'].includes(input.sourceName))) {
                    throw failure(400, 'INVALID_SOURCE_NAME', 'The source name must be a plain filename.');
                }
                let schema;
                try { schema = input.schema === undefined ? undefined : normalizeSourceDocumentSchema(input.schema); }
                catch { throw failure(400, 'INVALID_SCHEMA', 'Supply a bounded inline JSON Schema object.'); }
                const id = randomBytes(16).toString('hex');
                const directory = path.join(sessionsRoot, id);
                const suffix = format === 'json' ? '.json' : '.yml';
                const suppliedName = input.sourceName || `document${suffix}`;
                let filename = suppliedName.replace(/[<>:"|?*]/gu, '_').replace(/[. ]+$/gu, '');
                if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(filename)) filename = `_${filename}`;
                if (!(format === 'json' ? /\.json$/iu : /\.ya?ml$/iu).test(filename)) filename += suffix;
                if (Buffer.byteLength(filename) > 240) throw failure(400, 'INVALID_SOURCE_NAME', 'The UTF-8 source filename is too long.');
                const filePath = path.join(directory, filename);
                await mkdir(directory, {mode: 0o700});
                await writeFile(filePath, input.source, {encoding: 'utf8', mode: 0o600, flag: 'wx'});
                const metadataDirectory = path.join(directory, '.twpe');
                await mkdir(metadataDirectory, {mode: 0o700});
                await writeFile(path.join(metadataDirectory, 'session.json'), JSON.stringify({id, sourceName: input.sourceName || filename, format, createdAt: new Date().toISOString(), vscodeProfile: profile.directory}), {mode: 0o600, flag: 'wx'});
                const schemaWorkspace = await writeSchemaWorkspace(directory, schema, {format, filename});
                const launchOptions = {...profile, format, ...(schemaWorkspace || {})};
                const session = {filePath, source: input.source, revision: 1, launchOptions};
                try { await launchEditor(filePath, launchOptions); }
                catch {
                    throw failure(503, 'EDITOR_LAUNCH_FAILED', 'VSCode could not be started. Your working YAML file was retained.');
                }
                if (closing) throw failure(503, 'HOST_CLOSED', 'The local YAML host is closing. Your working YAML file was retained.');
                sessions.set(id, session);
                json(response, 201, {id, revision: session.revision, opened: true, format, ...(schemaWorkspace ? {schemaId: schemaWorkspace.schemaId} : {})});
            } finally { pendingSessions--; }
            return;
        }
        const id = pathname.startsWith(`${apiPrefix}/sessions/`) ? pathname.slice(`${apiPrefix}/sessions/`.length) : null;
        if (id === null) throw failure(404, 'NOT_FOUND', 'This YAML API endpoint does not exist.');
        if (!idPattern.test(id)) throw failure(400, 'INVALID_SESSION', 'The YAML session identifier is invalid.');
        const session = sessions.get(id);
        if (!session) throw failure(404, 'SESSION_NOT_FOUND', 'The YAML session is no longer active.');
        if (request.method === 'POST') {
            await readStableSource(session.filePath);
            if (sessions.get(id) !== session) throw failure(404, 'SESSION_NOT_FOUND', 'The YAML session is no longer active.');
            try { await launchEditor(session.filePath, session.launchOptions); }
            catch { throw failure(503, 'EDITOR_LAUNCH_FAILED', 'VSCode could not be started. Your working file was retained.'); }
            if (closing) throw failure(503, 'HOST_CLOSED', 'The local YAML host is closing. Your working file was retained.');
            if (sessions.get(id) !== session) throw failure(404, 'SESSION_NOT_FOUND', 'The YAML session is no longer active.');
            json(response, 200, {id, revision: session.revision, opened: true});
            return;
        }
        if (request.method === 'DELETE') {
            sessions.delete(id);
            json(response, 200, {id, closed: true, retained: true});
            return;
        }
        if (request.method !== 'GET') throw failure(405, 'METHOD_NOT_ALLOWED', 'Use GET, POST or DELETE for a YAML session.');
        const source = await readStableSource(session.filePath);
        if (sessions.get(id) !== session) throw failure(404, 'SESSION_NOT_FOUND', 'The YAML session is no longer active.');
        if (source !== session.source) { session.source = source; session.revision++; }
        json(response, 200, {id, source, revision: session.revision});
    }

    async function handle(request, response) {
        response.setHeader('cache-control', 'no-store');
        response.setHeader('x-content-type-options', 'nosniff');
        response.setHeader('referrer-policy', 'no-referrer');
        response.setHeader('cross-origin-resource-policy', 'same-origin');
        authorizeRequest(request);
        let pathname;
        try { pathname = decodeURIComponent((request.url || '/').split('?')[0]); }
        catch { throw failure(400, 'INVALID_PATH', 'The request path is invalid.'); }
        if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(segment => segment === '..')) {
            throw failure(403, 'INVALID_PATH', 'Parent paths are not served.');
        }
        if (pathname === apiPrefix || pathname.startsWith(`${apiPrefix}/`)) return handleAPI(request, response, pathname);
        if (!['GET', 'HEAD'].includes(request.method)) throw failure(405, 'METHOD_NOT_ALLOWED', 'Use GET or HEAD for Editor files.');
        if (pathname === '/' || pathname === '/turbowarp-plus-editor') {
            response.writeHead(302, {location: '/turbowarp-plus-editor/editor.html?twPlusYamlEditor=1'});
            response.end();
            return;
        }
        const prefix = '/turbowarp-plus-editor/';
        if (!pathname.startsWith(prefix)) throw failure(404, 'NOT_FOUND', 'This local file is not available.');
        const relative = pathname.slice(prefix.length) || 'index.html';
        const candidate = path.resolve(siteRoot, relative);
        if (!within(siteRoot, candidate)) throw failure(403, 'INVALID_PATH', 'The file is outside the Editor site.');
        const filename = await realpath(candidate).catch(() => { throw failure(404, 'NOT_FOUND', 'This Editor file does not exist.'); });
        if (!within(siteRoot, filename)) throw failure(403, 'INVALID_PATH', 'Files outside the Editor site are not served.');
        const entry = await stat(filename);
        if (!entry.isFile()) throw failure(404, 'NOT_FOUND', 'This Editor file does not exist.');
        response.writeHead(200, {'content-type': mimeTypes[path.extname(filename).toLowerCase()] || 'application/octet-stream', 'content-length': entry.size});
        if (request.method === 'HEAD') { response.end(); return; }
        await pipeline(createReadStream(filename), response);
    }

    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
    });
    apiOrigin = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
    return Object.freeze({
        url: `${apiOrigin}/turbowarp-plus-editor/editor.html?twPlusYamlEditor=1`,
        apiOrigin, dataDirectory: storage,
        profileDirectory: profile.directory,
        userDataDirectory: profile.userDataDirectory,
        extensionsDirectory: profile.extensionsDirectory,
        profileSeparated: profile.separated,
        close() {
            if (closePromise) return closePromise;
            closing = true;
            sessions.clear();
            closePromise = new Promise<void>((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve());
                server.closeIdleConnections?.();
            });
            return closePromise;
        }
    });
}
