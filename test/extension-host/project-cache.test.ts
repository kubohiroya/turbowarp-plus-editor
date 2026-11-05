import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Zip from '@turbowarp/jszip';
import {createProjectIO} from '@kubohiroya/turbowarp-extension-loader/project-codec';
import {installEditorExtensionHost} from '../../site/extension-host/editor-host.ts';
import {installExtensionLoader} from '../../site/extension-host/project-loader.ts';
import {identifyProject} from '../../site/extension-host/review.ts';
import {createPlusTrustedCatalog} from '../../site/trusted-extensions.ts';
import {guiRequire, guiRoot, vmModules} from './pinned-host.ts';

/**
 * Issue #55, stages 3 and 4: the editor keeps fetched extensions in one IndexedDB cache per host,
 * filed under the project open at each write, and a project whose manifest has no address is
 * given one the first time it is saved.
 */

const SHAPE = /^https:\/\/editor\.example\/turbowarp-plus-projects\/[0-9a-f]{2}\/[0-9a-f]{4}\/[0-9a-f-]{36}\.sb3$/;
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
const remote = (uri?: string) => ({schemaVersion: 1, ...(uri ? {uri} : {}), extensions: [spec]});

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

// ---- Stage 4: the bridge assigns at the first save, through the real codec ------------------

function bridge({manifest, addressProject}) {
    const projectIO = createProjectIO({zip: Zip});
    let serialized;
    const vm = {
        async loadProject(project) {
            const archive = await Zip.loadAsync(project);
            serialized = JSON.parse(await archive.file('project.json').async('string'));
            await this._loadExtensions(new Set(serialized.extensions), new Map());
        },
        async _loadExtensions() {},
        toJSON(target?: string) { return target ? '{"sprite":true}' : JSON.stringify(serialized); },
        _saveProjectZip() { return new Zip().file('project.json', this.toJSON()); },
        saveProjectSb3DontZip() { return {'project.json': new TextEncoder().encode(this.toJSON())}; }
    };
    const loader = {async load (input) { return {ids: input.extensions.map(item => item.id)}; }, async unload () {}};
    const told = [];
    let issued = 0;
    installExtensionLoader({vm, projectIO, transactionalRegistration: true, onProjectURI: uri => told.push(uri),
        addressProject: addressProject && (() => {
            issued++;
            return addressProject(issued);
        })}, loader);
    const uriOf = json => JSON.parse(json).turboWarpPlus?.uri;
    return {vm, told, issued: () => issued, uriOf, load: async () => vm.loadProject(await sb3(manifest))};
}

const address = n => `https://editor.example/turbowarp-plus-projects/aa/00aa/0193f0a1-2b3c-7d4e-8f01-00000000000${n}.sb3`;

test('a manifest without an address is given one at the first save, and keeps it on the next', async () => {
    const f = bridge({manifest: remote(), addressProject: address});
    await f.load();
    assert.deepEqual(f.told, [undefined]);
    assert.equal(f.issued(), 0, 'opening a project names nothing');
    const first = f.uriOf(f.vm.toJSON());
    assert.equal(first, address(1));
    assert.equal(f.uriOf(f.vm.toJSON()), first);
    // The ZIP and file saves serialize through toJSON and restore with the same context.
    const zip = await Zip.loadAsync(await f.vm._saveProjectZip().generateAsync({type: 'uint8array'}));
    assert.equal(f.uriOf(await zip.file('project.json').async('string')), first);
    assert.equal(f.uriOf(new TextDecoder().decode(f.vm.saveProjectSb3DontZip()['project.json'])), first);
    assert.equal(f.issued(), 1);
    assert.deepEqual(f.told, [undefined, first], 'the cache hears the new address once');
});

test('the first save may be a ZIP or file save; a sprite export is never addressed', async () => {
    const f = bridge({manifest: remote(), addressProject: address});
    await f.load();
    assert.equal(f.vm.toJSON('sprite'), '{"sprite":true}');
    assert.equal(f.issued(), 0);
    const files = f.vm.saveProjectSb3DontZip();
    assert.equal(f.uriOf(new TextDecoder().decode(files['project.json'])), address(1));
    assert.equal(f.uriOf(f.vm.toJSON()), address(1));
    assert.equal(f.issued(), 1);
});

test('an address the project already has is never overwritten', async () => {
    const f = bridge({manifest: remote(kept), addressProject: address});
    await f.load();
    assert.equal(f.uriOf(f.vm.toJSON()), kept);
    assert.equal(f.uriOf(f.vm.toJSON()), kept);
    assert.equal(f.issued(), 0);
    assert.deepEqual(f.told, [kept]);
});

test('a project without a manifest is given nothing, and neither is one on a host that makes no address', async () => {
    const plain = bridge({manifest: null, addressProject: address});
    await plain.load();
    assert.equal(plain.uriOf(plain.vm.toJSON()), undefined);
    assert.equal(JSON.parse(plain.vm.toJSON()).turboWarpPlus, undefined);
    assert.equal(plain.issued(), 0);
    const none = bridge({manifest: remote(), addressProject: null});
    await none.load();
    assert.equal(none.uriOf(none.vm.toJSON()), undefined);
});

test('reopening forgets the address given to the previous project', async () => {
    const f = bridge({manifest: remote(), addressProject: address});
    await f.load();
    assert.equal(f.uriOf(f.vm.toJSON()), address(1));
    await f.load();
    assert.equal(f.told.at(-1), undefined);
    assert.equal(f.uriOf(f.vm.toJSON()), address(2), 'a different project opened later is its own');
});

test('the real editor host addresses at save over HTTPS only, once, and the address survives reopening', async () => {
    const unaddressed = await sb3(remote());
    // http://localhost — the local preview and the E2E server — names nothing.
    const local = await editor('http://localhost:8080');
    try {
        await local.vm.loadProject(unaddressed);
        // With no address the review names the project by its content instead.
        assert.match(await identifyProject(await local.vm.saveProjectSb3('arraybuffer')), /^sha256:/);
    } finally {
        await local.dispose();
    }
    const served = await editor('https://editor.example');
    try {
        await served.vm.loadProject(unaddressed);
        const saved = await served.vm.saveProjectSb3('arraybuffer');
        const first = await identifyProject(saved);
        assert.match(first, SHAPE);
        assert.equal(await identifyProject(await served.vm.saveProjectSb3('arraybuffer')), first);
        await served.vm.loadProject(new Uint8Array(saved));
        assert.equal(await identifyProject(await served.vm.saveProjectSb3('arraybuffer')), first);
    } finally {
        await served.dispose();
    }
});

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
        // Saving the unaddressed one gives it an address, and its next write goes there.
        const named = await identifyProject(await f.vm.saveProjectSb3('arraybuffer'));
        assert.match(named, SHAPE);
        assert.equal(cache.made[0].appURI(), named);
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

test('a built single HTML does not bundle the IndexedDB cache or the save-time addressing', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'plus-runtime-'));
    try {
        const output = path.join(out, 'extension-runtime.js');
        execFileSync(process.execPath, ['scripts/site/build-extension-runtime.cts'], {
            env: {...process.env, E2E_GUI_ROOT: guiRoot, TW_PLUS_RUNTIME_OUTPUT: output}, stdio: 'pipe'});
        const bundle = fs.readFileSync(output, 'utf8');
        const modules = [...bundle.matchAll(/CONCATENATED MODULE: (\S+)/g)].map(match => match[1]);
        assert.ok(modules.some(file => file.endsWith('/turbowarp-extension-loader/dist/memory-cache.js')), 'sanity');
        assert.equal(modules.filter(file => /indexeddb-cache|project-address|editor-host/.test(file)).length, 0,
            modules.join('\n'));
        assert.doesNotMatch(bundle, /createIndexedDBContentCache|IndexedDB unavailable|defaultProjectURI/);
    } finally {
        fs.rmSync(out, {recursive: true, force: true});
    }
});
