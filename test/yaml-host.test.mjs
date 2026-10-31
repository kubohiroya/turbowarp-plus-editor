import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, unlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {request} from 'node:http';
import {EventEmitter} from 'node:events';
import {startYamlEditorHost, maxSourceBytes} from '../scripts/yaml-editor/host.mjs';
import {parseArguments} from '../scripts/yaml-editor/cli.mjs';
import {createVSCodeProfile, launchVSCode, waitForVSCodeReady} from '../scripts/yaml-editor/vscode.mjs';

async function fixture(t, options = {}) {
    const directory = await mkdtemp(path.join(tmpdir(), 'twpe-yaml-host-test-'));
    const siteDirectory = path.join(directory, 'site');
    const dataDirectory = path.join(directory, 'data');
    await mkdir(siteDirectory);
    await writeFile(path.join(siteDirectory, 'editor.html'), '<!doctype html><title>Local editor</title>');
    await writeFile(path.join(siteDirectory, 'app.js'), 'window.fixture = true;');
    const launches = [];
    const host = await startYamlEditorHost({siteDirectory, dataDirectory, launchEditor: async (...args) => launches.push(args), ...options});
    t.after(async () => {
        await host.close();
        await rm(directory, {recursive: true, force: true});
        if (host.profileSeparated) await rm(host.profileDirectory, {recursive: true, force: true});
    });
    const response = await fetch(`${host.apiOrigin}/__twpe_yaml/config`);
    assert.equal(response.status, 200);
    const config = await response.json();
    const headers = {'X-TWPE-Yaml-Token': config.token, Origin: host.apiOrigin, 'Content-Type': 'application/json'};
    const create = (source = 'scenes:\n  opening: []\n', extra = {}) => fetch(`${host.apiOrigin}/__twpe_yaml/sessions`, {
        method: 'POST', headers, body: JSON.stringify({source, sourceName: 'story.k4.yml', ...extra})
    });
    return {directory, siteDirectory, host, launches, config, headers, create};
}

function rawRequest(origin, pathname, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(origin);
        const req = request({hostname: url.hostname, port: url.port, path: pathname, headers}, response => {
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => resolve({status: response.statusCode, body: Buffer.concat(chunks).toString()}));
        });
        req.on('error', reject);
        req.end();
    });
}

test('serves the local Editor and a same-origin config without putting a token in the URL', async t => {
    const f = await fixture(t);
    assert.equal(f.config.available, true);
    assert.equal(f.config.editor, 'VSCode');
    const privateSettings = JSON.parse(await readFile(path.join(f.host.userDataDirectory, 'User/settings.json'), 'utf8'));
    assert.equal(privateSettings['extensions.autoUpdate'], 'off');
    assert.equal(privateSettings['telemetry.telemetryLevel'], 'off');
    assert.equal(f.config.maxSourceBytes, maxSourceBytes);
    assert.equal(new URL(f.host.url).searchParams.get('twPlusYamlEditor'), '1');
    assert.ok(!f.host.url.includes(f.config.token));
    const html = await fetch(f.host.url);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /Local editor/);
    assert.equal(html.headers.get('access-control-allow-origin'), null);
    const script = await fetch(`${f.host.apiOrigin}/turbowarp-plus-editor/app.js`);
    assert.match(script.headers.get('content-type'), /javascript/);
    assert.equal((await stat(f.host.dataDirectory)).mode & 0o777, 0o700);
});

test('launches only its private YAML file, imports saved changes and increments revision only on content changes', async t => {
    const f = await fixture(t);
    const source = '\uFEFFtitle: 最初\nscenes:\n  opening: []\n';
    const response = await f.create(source);
    assert.equal(response.status, 201);
    const opened = await response.json();
    assert.equal(opened.opened, true);
    assert.equal(opened.revision, 1);
    const [[filePath, profile]] = f.launches;
    assert.equal(await readFile(filePath, 'utf8'), source);
    assert.ok(filePath.startsWith(`${f.host.dataDirectory}${path.sep}sessions${path.sep}`));
    assert.equal(path.basename(filePath), 'story.k4.yml');
    assert.equal((await stat(filePath)).mode & 0o777, 0o600);
    assert.ok(profile.userDataDirectory.startsWith(f.host.profileDirectory));
    assert.ok(profile.extensionsDirectory.startsWith(f.host.profileDirectory));
    const metadata = JSON.parse(await readFile(path.join(f.host.dataDirectory, 'host.json'), 'utf8'));
    assert.equal(metadata.vscodeProfile.userDataDirectory, profile.userDataDirectory);
    const endpoint = `${f.host.apiOrigin}/__twpe_yaml/sessions/${opened.id}`;
    const get = async () => (await fetch(endpoint, {headers: {'X-TWPE-Yaml-Token': f.config.token}})).json();
    assert.deepEqual(await get(), {id: opened.id, source, revision: 1});
    const changed = source.replace('最初', '保存後');
    await writeFile(filePath, changed);
    assert.deepEqual(await get(), {id: opened.id, source: changed, revision: 2});
    assert.equal((await get()).revision, 2);
    assert.equal((await fetch(endpoint, {method: 'DELETE', headers: f.headers})).status, 200);
    assert.equal((await fetch(endpoint, {headers: f.headers})).status, 404);
    assert.equal(await readFile(filePath, 'utf8'), changed);
    await f.host.close();
    assert.equal(await readFile(filePath, 'utf8'), changed);
});

test('reopens the same session with its schema and preserves unchanged and edited workfiles', async t => {
    const f = await fixture(t);
    const schema = {id: 'urn:reopen', schema: {type: 'object'}};
    const created = await (await f.create('# comment\ntitle: original\n', {schema})).json();
    const endpoint = `${f.host.apiOrigin}/__twpe_yaml/sessions/${created.id}`;
    const originalLaunch = f.launches[0];
    const [file] = originalLaunch;
    for (const source of ['# comment\ntitle: original\n', '# retained\ntitle: changed\n']) {
        await writeFile(file, source);
        assert.equal((await fetch(endpoint, {method: 'POST', headers: f.headers})).status, 200);
        assert.deepEqual(f.launches.at(-1), originalLaunch);
        assert.equal(await readFile(file, 'utf8'), source);
        assert.equal((await (await fetch(endpoint, {headers: f.headers})).json()).source, source);
    }
    assert.equal((await fetch(endpoint, {method: 'POST'})).status, 401);
    assert.equal((await fetch(endpoint, {method: 'POST', headers: {...f.headers, Origin: 'https://untrusted.test'}})).status, 403);
    assert.equal(f.launches.length, 3);
    assert.equal((await fetch(endpoint, {method: 'DELETE', headers: f.headers})).status, 200);
    assert.equal((await fetch(endpoint, {method: 'POST', headers: f.headers})).status, 404);
});

test('a failed reopen can be retried and an unsafe workfile is never launched', async t => {
    let fail = false, launches = 0;
    const f = await fixture(t, {launchEditor: async () => {
        launches++;
        if (fail) throw Error('Launch failed');
    }});
    const created = await (await f.create('title: retained')).json();
    const endpoint = `${f.host.apiOrigin}/__twpe_yaml/sessions/${created.id}`;
    const file = path.join(f.host.dataDirectory, 'sessions', created.id, 'story.k4.yml');
    fail = true;
    assert.equal((await fetch(endpoint, {method: 'POST', headers: f.headers})).status, 503);
    assert.equal(await readFile(file, 'utf8'), 'title: retained');
    fail = false;
    assert.equal((await fetch(endpoint, {method: 'POST', headers: f.headers})).status, 200);
    const outside = path.join(f.directory, 'outside.yml');
    await writeFile(outside, 'private');
    await unlink(file);
    await symlink(outside, file);
    assert.equal((await fetch(endpoint, {method: 'POST', headers: f.headers})).status, 403);
    assert.equal(launches, 3);
});

test('rejects untrusted origins, fetch sites, hosts, absent tokens and modified tokens', async t => {
    const f = await fixture(t);
    const api = `${f.host.apiOrigin}/__twpe_yaml/config`;
    assert.equal((await fetch(api, {headers: {Origin: 'https://attacker.example'}})).status, 403);
    assert.equal((await fetch(api, {headers: {'Sec-Fetch-Site': 'cross-site'}})).status, 403);
    assert.equal((await rawRequest(f.host.apiOrigin, '/__twpe_yaml/config', {Host: 'attacker.example'})).status, 403);
    const endpoint = `${f.host.apiOrigin}/__twpe_yaml/sessions`;
    assert.equal((await fetch(endpoint, {method: 'POST', headers: {Origin: f.host.apiOrigin, 'Content-Type': 'application/json'}, body: '{}'})).status, 401);
    assert.equal((await fetch(endpoint, {method: 'POST', headers: {...f.headers, 'X-TWPE-Yaml-Token': 'x'.repeat(f.config.token.length)}, body: '{}'})).status, 401);
    assert.equal((await fetch(endpoint, {method: 'POST', headers: {...f.headers, Origin: 'null'}, body: '{}'})).status, 403);
    const {Origin, ...withoutOrigin} = f.headers;
    assert.equal((await fetch(endpoint, {method: 'POST', headers: withoutOrigin, body: '{}'})).status, 403);
    assert.equal(f.launches.length, 0);
});

test('rejects traversal, arbitrary command keys, invalid identifiers and symlinks outside the site', async t => {
    const f = await fixture(t);
    for (const pathname of ['/turbowarp-plus-editor/../secret', '/turbowarp-plus-editor/%2e%2e/secret', '/__twpe_yaml/sessions/%2e%2e%2fsecret']) {
        assert.equal((await rawRequest(f.host.apiOrigin, pathname, f.headers)).status, 403);
    }
    assert.equal((await f.create('title: test', {sourceName: '../../outside.yml'})).status, 400);
    assert.equal((await f.create('title: test', {command: 'anything'})).status, 400);
    assert.equal((await fetch(`${f.host.apiOrigin}/__twpe_yaml/sessions/not-an-id`, {headers: f.headers})).status, 400);
    assert.equal((await fetch(`${f.host.apiOrigin}/__twpe_yaml/sessions/${'0'.repeat(32)}`, {headers: f.headers})).status, 404);
    const outside = path.join(f.directory, 'private.txt');
    await writeFile(outside, 'private');
    await symlink(outside, path.join(f.siteDirectory, 'leak.txt'));
    assert.equal((await fetch(`${f.host.apiOrigin}/turbowarp-plus-editor/leak.txt`)).status, 403);
    assert.equal(f.launches.length, 0);
    const created = await (await f.create()).json();
    const [[workingFile]] = f.launches;
    await unlink(workingFile);
    await symlink(outside, workingFile);
    assert.equal((await fetch(`${f.host.apiOrigin}/__twpe_yaml/sessions/${created.id}`, {headers: f.headers})).status, 403);
});

test('rejects oversized initial or saved sources and non-UTF8 saved files without losing the working session', async t => {
    const f = await fixture(t);
    assert.equal((await f.create('a'.repeat(maxSourceBytes + 1))).status, 413);
    assert.equal((await f.create('あ'.repeat(Math.ceil(maxSourceBytes / 3)))).status, 413);
    assert.equal(f.launches.length, 0);
    const response = await f.create('title: valid');
    const {id} = await response.json();
    const endpoint = `${f.host.apiOrigin}/__twpe_yaml/sessions/${id}`;
    const [[filePath]] = f.launches;
    await writeFile(filePath, Buffer.alloc(maxSourceBytes + 1));
    assert.equal((await fetch(endpoint, {headers: f.headers})).status, 413);
    await writeFile(filePath, Buffer.from([0xff, 0xfe]));
    assert.equal((await fetch(endpoint, {headers: f.headers})).status, 422);
    await writeFile(filePath, 'title: repaired');
    assert.deepEqual(await (await fetch(endpoint, {headers: f.headers})).json(), {id, source: 'title: repaired', revision: 2});
});

test('retains the YAML on an editor launch failure and keeps session auth private between processes', async t => {
    let filePath;
    const f = await fixture(t, {launchEditor: async filename => { filePath = filename; throw new Error('launch failed'); }});
    const response = await f.create('title: draft');
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'EDITOR_LAUNCH_FAILED');
    assert.equal(await readFile(filePath, 'utf8'), 'title: draft');
    assert.equal((await readdir(path.join(f.host.dataDirectory, 'sessions'))).length, 1);
    const other = await fixture(t);
    assert.notEqual(other.config.token, f.config.token);
    assert.notEqual(other.host.dataDirectory, f.host.dataDirectory);
});

test('an installed VSCode CLI exiting nonzero does not report an opened session and uses only fixed arguments', async t => {
    let launched;
    const f = await fixture(t, {launchEditor: (filename, profile) => launchVSCode(filename, profile, {
        platform: 'darwin', findExecutable: async () => '/trusted/code',
        spawnProcess: (executable, args, options) => {
            launched = {executable, args, options};
            const child = new EventEmitter();
            child.unref = () => {};
            child.kill = () => {};
            queueMicrotask(() => { child.emit('spawn'); child.emit('exit', 1, null); });
            return child;
        }
    })});
    const response = await f.create('title: saved draft');
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'EDITOR_LAUNCH_FAILED');
    assert.equal(launched.executable, '/trusted/code');
    assert.equal(launched.options.shell, false);
    assert.ok(launched.args.includes('--disable-extensions'));
    assert.ok(launched.args.includes('--disable-workspace-trust'));
    const filename = launched.args.at(-1);
    assert.equal(launched.args.at(-2), '--');
    assert.equal(await readFile(filename, 'utf8'), 'title: saved draft');
    assert.equal(launched.options.env.VSCODE_IPC_HOOK_CLI, undefined);
});

test('CLI exit zero alone does not report an opened session when the private VSCode IPC is absent', async t => {
    const f = await fixture(t, {launchEditor: (filename, profile) => launchVSCode(filename, profile, {
        platform: 'darwin', findExecutable: async () => '/trusted/code',
        checkReady: (directory, options) => waitForVSCodeReady(directory, {...options, timeoutMs: 30}),
        spawnProcess: () => {
            const child = new EventEmitter();
            child.unref = () => {};
            child.kill = () => {};
            queueMicrotask(() => { child.emit('spawn'); child.emit('exit', 0, null); });
            return child;
        }
    })});
    const response = await f.create('title: retained after GUI failure');
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'EDITOR_LAUNCH_FAILED');
});

test('a long working directory gets a short private VSCode profile with recorded paths', {skip: process.platform === 'win32'}, async t => {
    const base = await mkdtemp(path.join(tmpdir(), 'twpe-profile-test-'));
    const storage = path.join(base, 'long-working-directory-'.repeat(7));
    await mkdir(storage);
    const profile = await createVSCodeProfile(storage);
    t.after(async () => {
        await rm(base, {recursive: true, force: true});
        if (profile.separated) await rm(profile.directory, {recursive: true, force: true});
    });
    assert.equal(profile.separated, true);
    assert.ok(Buffer.byteLength(path.join(profile.userDataDirectory, '1.00-main.sock')) <= 100);
    assert.equal((await stat(profile.directory)).mode & 0o777, 0o700);
    assert.equal(path.basename(profile.userDataDirectory), 'u');
    assert.equal(path.basename(profile.extensionsDirectory), 'e');
    assert.ok(!profile.userDataDirectory.startsWith(storage));
});

test('CLI accepts only explicit local directories and a bounded numeric port', () => {
    assert.deepEqual(parseArguments(['--site-dir', '/tmp/editor', '--data-dir', '/tmp/yaml', '--port', '0']), {
        siteDirectory: '/tmp/editor', dataDirectory: '/tmp/yaml', port: 0
    });
    for (const args of [[], ['--site-dir'], ['--site-dir', '/tmp/editor', '--editor', 'sh'], ['--site-dir', '/tmp/editor', '--port', '65536'], ['--site-dir', '/tmp/editor', '--port', '-1']]) {
        assert.throws(() => parseArguments(args));
    }
});

test('each YAML session gets its exact owner schema and private workspace without rewriting the source', async t => {
    const f = await fixture(t);
    const source = '# a retained comment\nvolume: 50\n';
    const schemas = [
        {id: 'urn:twpe:test:volume', schema: {$schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: {volume: {type: 'integer', maximum: 100}}}},
        {id: 'urn:twpe:test:title', schema: {type: 'object', required: ['title'], properties: {title: {type: 'string'}}}}
    ];
    for (const schema of schemas) {
        const response = await f.create(source, {schema});
        assert.equal(response.status, 201);
        assert.equal((await response.json()).schemaId, schema.id);
        const [file, profile] = f.launches.at(-1);
        assert.equal(await readFile(file, 'utf8'), source);
        assert.equal(path.dirname(profile.schemaFile), path.join(path.dirname(file), '.twpe'));
        assert.equal(path.dirname(profile.workspaceFile), path.join(path.dirname(file), '.twpe'));
        assert.deepEqual(JSON.parse(await readFile(profile.schemaFile, 'utf8')), schema.schema);
        const workspace = JSON.parse(await readFile(profile.workspaceFile, 'utf8'));
        assert.equal(workspace.settings['yaml.validate'], true);
        assert.equal(workspace.settings['yaml.completion'], true);
        assert.equal(workspace.settings['yaml.schemaStore.enable'], false);
        assert.equal(workspace.settings['extensions.autoUpdate'], undefined);
        assert.equal(workspace.settings['telemetry.telemetryLevel'], undefined);
        assert.deepEqual(Object.values(workspace.settings['yaml.schemas']), [['story.k4.yml']]);
        assert.equal((await stat(profile.schemaFile)).mode & 0o777, 0o600);
    }
    assert.notEqual(f.launches[0][1].schemaFile, f.launches[1][1].schemaFile);
    for (const schema of [null, {id: 'bad', schema: []}, {id: 'bad', schema: {description: 'x'.repeat(1024 * 1024)}}]) {
        assert.equal((await f.create(source, {schema})).status, 400);
    }
    assert.equal(f.launches.length, 2);
});

test('schema sessions enable only their private extension directory and open the generated workspace', async t => {
    const directory = await mkdtemp(path.join(tmpdir(), 'twpe-schema-launch-'));
    t.after(() => rm(directory, {recursive: true, force: true}));
    const profile = {userDataDirectory: path.join(directory, 'u'), extensionsDirectory: path.join(directory, 'e'), workspaceFile: path.join(directory, 'yaml.code-workspace')};
    const calls = [];
    let prepared = false;
    await launchVSCode(path.join(directory, 'story.k4.yml'), profile, {
        findExecutable: async () => '/official/code', checkReady: async () => {},
        ensureSupport: async actual => { assert.equal(actual.extensionsDirectory, profile.extensionsDirectory); prepared = true; },
        spawnProcess(executable, args, options) {
            calls.push({executable, args, options});
            const child = new EventEmitter(); child.unref = () => {}; child.kill = () => {};
            process.nextTick(() => { child.emit('spawn'); child.emit('exit', 0); });
            return child;
        }
    });
    assert.equal(prepared, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.shell, false);
    assert(!calls[0].args.includes('--disable-extensions'));
    assert.deepEqual(calls[0].args.slice(calls[0].args.indexOf('--') + 1), [profile.workspaceFile, path.join(directory, 'story.k4.yml')]);
});


test('JSON sources use their filename, isolated JSON Schema association and no YAML-specific workspace settings', async t => {
    const f = await fixture(t);
    const source = '{\r\n  "volume": 25\r\n}\r\n';
    const schema = {id: 'urn:twpe:test:json', schema: {type: 'object', properties: {volume: {type: 'number'}}}};
    for (const sourceName of ['settings.json', 'schema.json', 'session.json']) {
        const response = await f.create(source, {sourceName, format: 'json', schema});
        assert.equal(response.status, 201); assert.equal((await response.json()).format, 'json');
        const [file, profile] = f.launches.at(-1);
        assert.equal(path.basename(file), sourceName); assert.equal(await readFile(file, 'utf8'), source);
        assert.equal(profile.format, 'json');
        const workspace = JSON.parse(await readFile(profile.workspaceFile, 'utf8'));
        assert.equal(workspace.settings['yaml.schemas'], undefined);
        assert.deepEqual(workspace.settings['json.schemas'][0].fileMatch, [sourceName]);
        assert.equal(workspace.settings['files.associations'][sourceName], 'json');
        assert.equal(workspace.folders[0].path, '..');
    }
    assert.equal((await f.create(source, {format: 'html'})).status, 400);
    assert.equal((await f.create(source, {sourceName: 'bad\nname.json', format: 'json'})).status, 400);
});

test('JSON schema workspaces use the built-in language service without installing the YAML extension', async t => {
    const directory = await mkdtemp(path.join(tmpdir(), 'twpe-json-launch-'));
    t.after(() => rm(directory, {recursive: true, force: true}));
    let installs = 0;
    await launchVSCode(path.join(directory, 'settings.json'), {userDataDirectory: path.join(directory, 'u'), extensionsDirectory: path.join(directory, 'e'), workspaceFile: path.join(directory, '.twpe/editor.code-workspace'), format: 'json'}, {
        findExecutable: async () => '/official/code', checkReady: async () => {}, ensureSupport: async () => { installs++; },
        spawnProcess() {const child = new EventEmitter(); child.unref = () => {}; child.kill = () => {}; process.nextTick(() => {child.emit('spawn'); child.emit('exit', 0);}); return child;}
    });
    assert.equal(installs, 0);
});
