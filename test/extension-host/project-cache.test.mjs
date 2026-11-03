import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Zip from '@turbowarp/jszip';
import {installEditorExtensionHost} from '../../site/extension-host/editor-host.js';
import {createPlusTrustedCatalog} from '../../site/trusted-extensions.js';
import {guiRequire, guiRoot, vmModules} from './pinned-host.mjs';

/**
 * Issue #55, stage 3: the editor keeps fetched extensions in one IndexedDB cache per host, filed
 * under the project open at each write.
 */

const kept = 'https://published.example/works/kept.sb3';
const other = 'https://published.example/works/other.sb3';
const url = 'https://cdn.example.test/npm/@owner/example@1.0.0/dist/example.js';
const code = new TextEncoder().encode(
    "Scratch.extensions.register({getInfo(){return {id:'example',name:'Example',blocks:[]}}});");
const sha256 = createHash('sha256').update(code).digest('hex');
const spec = {id: 'example', source: {type: 'remote-cacheable', url}, execution: 'unsandboxed', sha256};

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"></svg>';
const assetId = createHash('md5').update(svg).digest('hex');
const sb3 = (manifest, extensions = manifest ? manifest.extensions.map(item => item.id) : []) => new Zip()
    .file('project.json', JSON.stringify({targets: [{isStage: true, name: 'Stage', variables: {}, lists: {},
        broadcasts: {}, blocks: {}, comments: {}, currentCostume: 0, sounds: [], volume: 100, layerOrder: 0,
        tempo: 60, costumes: [{name: 'Blank', assetId, dataFormat: 'svg', md5ext: `${assetId}.svg`,
            rotationCenterX: 240, rotationCenterY: 180}], videoTransparency: 50, videoState: 'off',
        textToSpeechLanguage: null}], monitors: [], extensions,
    meta: {semver: '3.0.0', vm: '2.0.0', agent: 'cache fixture'}, ...(manifest ? {turboWarpPlus: manifest} : {})}))
    .file(`${assetId}.svg`, svg)
    .generateAsync({type: 'uint8array'});
const remote = uri => ({schemaVersion: 1, ...(uri ? {uri} : {}), extensions: [spec]});

const withOrigin = async (origin, run) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
    Object.defineProperty(globalThis, 'location', {configurable: true, value: {origin}});
    try {
        return await run();
    } finally {
        if (descriptor) Object.defineProperty(globalThis, 'location', descriptor);
        else delete globalThis.location;
    }
};

/** A cache that records whose bucket each write would go to, read the way the adapter reads it. */
const recordingCache = () => {
    const writes = [];
    const made = [];
    let closed = 0;
    const create = options => {
        made.push(options);
        return {
            async get () { return undefined; },
            async put (key) {
                const owner = typeof options.appURI === 'function' ? options.appURI() : options.appURI;
                writes.push({key, bucket: options.sharedDigests?.has(key) ? 'shared' : owner ?? 'shared'});
            },
            async close () { closed++; }
        };
    };
    return {create, writes, made, closed: () => closed};
};

/** The real editor host on the pinned VM, fetching the one extension from a stand-in network. */
const editor = async (origin, settings = {}) => {
    const VM = guiRequire('scratch-vm');
    const Storage = guiRequire('@turbowarp/scratch-storage');
    const vm = new VM();
    vm.attachStorage(new Storage());
    let fetches = 0;
    const fetchImpl = async requested => {
        fetches++;
        const response = new Response(code, {status: 200});
        Object.defineProperty(response, 'url', {value: String(requested)});
        return response;
    };
    const host = await withOrigin(origin, () => installEditorExtensionHost(vm, {enabled: true, document: undefined,
        vmModules, fetchImpl, requestApproval: async () => true, ...settings}));
    return {vm, host, fetches: () => fetches,
        async dispose () {
            await host.dispose();
            vm.runtime.dispose();
        }};
};

// ---- Stage 3: one cache per host, filed under the project open at each write ----------------

test('each write is filed under the project open then, and reopening switches the bucket', async () => {
    const cache = recordingCache();
    const f = await editor('https://editor.example', {createContentCache: cache.create});
    try {
        assert.equal(cache.made.length, 1, 'one cache for the host');
        await f.vm.loadProject(await sb3(remote(kept)));
        await f.vm.loadProject(await sb3(remote(other)));
        await f.vm.loadProject(await sb3(remote()));
        assert.deepEqual(cache.writes.map(write => write.bucket), [kept, other, 'shared']);
        assert.equal(cache.made.length, 1);
        await f.vm.loadProject(await sb3(null));
        assert.equal(cache.made[0].appURI(), undefined, 'a project without a manifest names no bucket');
    } finally {
        await f.dispose();
    }
    assert.equal(cache.closed(), 1, 'disposing closes the connection and deletes nothing');
});

test('what the catalog lists is filed as shared, filled as the catalog loads', async () => {
    const cache = recordingCache();
    let release;
    const read = new Promise(resolve => { release = resolve; });
    const trustedCatalog = createPlusTrustedCatalog({readCatalog: async () => {
        await read;
        return {schemaVersion: 1, extensions: [{id: 'example', name: 'Example', version: '1.0.0', url,
            dependencies: [], sha256}]};
    }});
    const f = await editor('https://editor.example', {createContentCache: cache.create, trustedCatalog});
    try {
        const shared = cache.made[0].sharedDigests;
        assert.equal(shared, trustedCatalog.listedDigests, 'the set the trust check fills, not a copy');
        assert.equal(shared.has(sha256), false, 'nothing is read at startup');
        // The Loader writes the copy before asking about trust, so the write waits for the read.
        const loading = f.vm.loadProject(await sb3(remote(kept)));
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.deepEqual(cache.writes, []);
        release();
        await loading;
        assert.equal(shared.has(sha256), true);
        assert.deepEqual(cache.writes, [{key: sha256, bucket: 'shared'}]);
    } finally {
        await f.dispose();
    }
});

test('without IndexedDB the editor keeps the memory cache, and other failures are not hidden', async () => {
    assert.equal(globalThis.indexedDB, undefined, 'Node offers no IndexedDB');
    const f = await editor('https://editor.example');
    try {
        await f.vm.loadProject(await sb3(remote(kept)));
        await f.vm.loadProject(await sb3(remote(kept)));
        assert.equal(f.fetches(), 1, 'the second open reads the copy kept for this visit');
    } finally {
        await f.dispose();
    }
    await assert.rejects(editor('https://editor.example', {createContentCache: () => {
        throw new Error('maxBytes must be positive');
    }}), /maxBytes must be positive/);
});

test('a built single HTML does not bundle the IndexedDB cache', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'plus-runtime-'));
    try {
        const output = path.join(out, 'extension-runtime.js');
        execFileSync(process.execPath, ['scripts/site/build-extension-runtime.cts'], {
            env: {...process.env, E2E_GUI_ROOT: guiRoot, TW_PLUS_RUNTIME_OUTPUT: output}, stdio: 'pipe'});
        const bundle = fs.readFileSync(output, 'utf8');
        const modules = [...bundle.matchAll(/CONCATENATED MODULE: (\S+)/g)].map(match => match[1]);
        assert.ok(modules.some(file => file.endsWith('/turbowarp-extension-loader/dist/memory-cache.js')), 'sanity');
        assert.equal(modules.filter(file => /indexeddb-cache|editor-host/.test(file)).length, 0,
            modules.join('\n'));
        assert.doesNotMatch(bundle, /createIndexedDBContentCache|IndexedDB unavailable/);
    } finally {
        fs.rmSync(out, {recursive: true, force: true});
    }
});
