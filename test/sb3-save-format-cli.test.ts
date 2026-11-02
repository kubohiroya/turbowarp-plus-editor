import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import JSZip from '@turbowarp/jszip';
import {sb3SaveFormats} from '@kubohiroya/turbowarp-sb3-save-format';
// The security dialog this repository will move to in #68. Until then it is installed under an
// alias, for this test only, so the value it decides can be passed to the CLI as it is.
import {loadingModes, type LoadingMode, type ReviewDecision} from 'turbowarp-extension-security-dialog-0.7';
import {remoteCacheableNote, saveSb3Format, type Sb3SaveFormatOptions} from '../scripts/sb3-save-format/cli.ts';

const cli = fileURLToPath(new URL('../scripts/sb3-save-format/cli.ts', import.meta.url));

// The dialog's choice and the CLI's input are one type: each is assignable to the other, so there
// is nothing a table between them could translate.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type CliFormat = NonNullable<Sb3SaveFormatOptions['selection']['extensions']>;
const sameVocabulary: Equal<LoadingMode, CliFormat> = true;
const decisionLoadingIsInput: Equal<ReviewDecision['loading'], Sb3SaveFormatOptions['selection']['extensions']> = true;

const extensions = {
    alpha: 'class Alpha { getInfo() { return {id: "alpha", name: "Alpha", blocks: []}; } }\nScratch.extensions.register(new Alpha());\n',
    beta: 'class Beta { getInfo() { return {id: "beta", name: "Beta", blocks: []}; } }\nScratch.extensions.register(new Beta());\n'
};
const urls = {alpha: 'https://example.com/ext/alpha.js', beta: 'https://example.com/ext/beta.js'};

async function fixture() {
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify({
        targets: [{isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {}, currentCostume: 0, costumes: [], sounds: [], volume: 100}],
        monitors: [],
        extensions: Object.keys(extensions),
        extensionURLs: Object.fromEntries(Object.entries(extensions).map(([id, code]) => [id, `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`])),
        meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
    }));
    zip.file('83a9787d4cb6f3b7632b4ddfebf74367.wav', new Uint8Array([1, 2, 3]));
    return zip.generateAsync({type: 'nodebuffer'});
}

async function workspace(t: test.TestContext) {
    const directory = await mkdtemp(path.join(tmpdir(), 'twpe-sb3-format-'));
    t.after(() => rm(directory, {recursive: true, force: true}));
    await writeFile(path.join(directory, 'in.sb3'), await fixture());
    await writeFile(path.join(directory, 'urls.json'), JSON.stringify(urls));
    let step = 0;
    // One CLI run, from one file to the next, returning the bytes it wrote.
    const run = async (from: string, format: string, ...extra: string[]) => {
        const output = path.join(directory, `${++step}-${format}.sb3`);
        const result = spawnSync(process.execPath, [cli, '--input', path.join(directory, from), '--output', output,
            '--extensions', format, '--extension-urls', path.join(directory, 'urls.json'), '--skip-url-check', ...extra], {encoding: 'utf8'});
        assert.ifError(result.error);
        assert.equal(result.status, 0, result.stderr);
        return {file: path.basename(output), bytes: await readFile(output), stdout: result.stdout, stderr: result.stderr};
    };
    return {directory, run};
}

const project = async (bytes: Uint8Array) => JSON.parse(await (await JSZip.loadAsync(bytes)).file('project.json')!.async('string'));

test('the dialog\'s loading modes are this CLI\'s formats, spelled the same', () => {
    assert.equal(sameVocabulary, true);
    assert.equal(decisionLoadingIsInput, true);
    // The dialog lists them in its own order; the set is what has to be the same.
    assert.deepEqual([...loadingModes].sort(), [...sb3SaveFormats].sort());
});

test('every ReviewDecision.loading value is accepted by the CLI as it is', async t => {
    const {run} = await workspace(t);
    for (const loading of loadingModes) {
        const decision: ReviewDecision = {execution: 'sandboxed', loading};
        const {bytes, stdout} = await run('in.sb3', decision.loading!);
        assert.match(stdout, new RegExp(`extensions as ${loading} \\(2 converted\\)`));
        const manifest = (await project(bytes)).turboWarpPlus;
        assert.deepEqual(manifest.extensions.map((spec: {source: {type: string}}) => spec.source.type), [loading, loading]);
    }
});

test('a decision reaches the writer through the programmatic entry without translation', async () => {
    const decision: ReviewDecision = {execution: 'sandboxed', loading: 'embedded-file'};
    const result = await saveSb3Format(await fixture(), {selection: {extensions: decision.loading}});
    assert.equal(result.selection.extensions, 'embedded-file');
    assert.deepEqual(result.converted, ['alpha', 'beta']);
    const [alpha] = (await project(result.bytes)).turboWarpPlus.extensions;
    assert.equal(alpha.source.type, 'embedded-file');
    assert.equal(await (await JSZip.loadAsync(result.bytes)).file(alpha.source.path)!.async('string'), extensions.alpha);
});

test('the old spellings are refused rather than read as one of the four forms', t => {
    for (const old of ['embedded', 'remote', 'cached']) {
        const result = spawnSync(process.execPath, [cli, '--input', 'in.sb3', '--output', 'out.sb3', '--extensions', old], {encoding: 'utf8', cwd: tmpdir()});
        assert.equal(result.status, 1, old);
        assert.match(result.stderr, new RegExp(`must be one of remote-non-cacheable, remote-cacheable, embedded-file, embedded-data, received ${old}`));
    }
    t.diagnostic('embedded, remote and cached refused');
});

test('source data and assets are refused with what to do instead', () => {
    for (const [option, reason] of [['--source', /Omit --source/], ['--assets', /Omit --assets/]] as const) {
        const result = spawnSync(process.execPath, [cli, '--input', 'in.sb3', '--output', 'out.sb3', option, 'embedded-data'], {encoding: 'utf8', cwd: tmpdir()});
        assert.equal(result.status, 1);
        assert.match(result.stderr, reason);
    }
});

test('rerunning any form on its own output writes the same bytes', async t => {
    const {run} = await workspace(t);
    for (const format of sb3SaveFormats) {
        const first = await run('in.sb3', format);
        const second = await run(first.file, format);
        assert.ok(first.bytes.equals(second.bytes), `${format} changed on a rerun`);
        assert.match(second.stdout, /\(2 converted\)/);
    }
});

test('embedded-file and embedded-data convert into each other byte for byte', async t => {
    const {run} = await workspace(t);
    const data = await run('in.sb3', 'embedded-data');
    const file = await run(data.file, 'embedded-file');
    const dataAgain = await run(file.file, 'embedded-data');
    const fileAgain = await run(dataAgain.file, 'embedded-file');
    assert.ok(data.bytes.equals(dataAgain.bytes), 'embedded-data → embedded-file → embedded-data changed the bytes');
    assert.ok(file.bytes.equals(fileAgain.bytes), 'embedded-file → embedded-data → embedded-file changed the bytes');
    assert.ok(!data.bytes.equals(file.bytes));
    // The carried bytes are the extension's own in both forms.
    const filed = await JSZip.loadAsync(file.bytes);
    for (const spec of (await project(file.bytes)).turboWarpPlus.extensions)
        assert.equal(await filed.file(spec.source.path)!.async('string'), extensions[spec.id as keyof typeof extensions]);
    assert.equal((await project(file.bytes)).extensionURLs.alpha, undefined);
    assert.match((await project(data.bytes)).extensionURLs.alpha, /^data:/);
});

test('remote-cacheable says the CLI has no part in the browser copy', async t => {
    const {run} = await workspace(t);
    const cacheable = await run('in.sb3', 'remote-cacheable');
    assert.ok(cacheable.stderr.includes(`Note: ${remoteCacheableNote}`));
    assert.match(remoteCacheableNote, /IndexedDB/);
    assert.match(remoteCacheableNote, /no reason the saved SB3 will run offline/);
    const nonCacheable = await run('in.sb3', 'remote-non-cacheable');
    assert.doesNotMatch(nonCacheable.stderr, /IndexedDB/);
    const embedded = await run('in.sb3', 'embedded-file');
    assert.equal(embedded.stderr, '');
    const help = spawnSync(process.execPath, [cli, '--help'], {encoding: 'utf8'});
    assert.equal(help.status, 0);
    assert.ok(help.stdout.includes(remoteCacheableNote));
});

test('an extension is never promoted to unsandboxed unless the caller names it', async t => {
    const {run} = await workspace(t);
    const sandboxed = (await project((await run('in.sb3', 'embedded-file')).bytes)).turboWarpPlus.extensions;
    assert.deepEqual(sandboxed.map((spec: {execution: string}) => spec.execution), ['sandboxed', 'sandboxed']);
    const named = (await project((await run('in.sb3', 'embedded-file', '--unsandboxed-extensions', 'beta')).bytes)).turboWarpPlus.extensions;
    assert.deepEqual(Object.fromEntries(named.map((spec: {id: string; execution: string}) => [spec.id, spec.execution])), {alpha: 'sandboxed', beta: 'unsandboxed'});
});

test('a remote form converts back to a carried one only with the pinned bytes', async () => {
    const data = await saveSb3Format(await fixture(), {selection: {extensions: 'embedded-data'}});
    const remote = await saveSb3Format(data.bytes, {selection: {extensions: 'remote-cacheable'}, urls, skipUrlCheck: true});
    const serve = (body: Record<string, string>) => (async (input: string | URL | Request) => {
        const id = Object.entries(urls).find(([, url]) => url === String(input))![0];
        return new Response(body[id]);
    }) as typeof fetch;
    const back = await saveSb3Format(remote.bytes, {selection: {extensions: 'embedded-data'}, fetch: serve(extensions)});
    assert.deepEqual((await project(back.bytes)).extensionURLs, (await project(data.bytes)).extensionURLs);
    await assert.rejects(saveSb3Format(remote.bytes, {selection: {extensions: 'embedded-data'}, fetch: serve({...extensions, beta: 'tampered'})}));
});
