import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

import {CATALOG_URL, createPlusCatalog} from '../site/plus-catalog.ts';
import {createPlusIntegration} from '../site/plus-integration.ts';
import {prepareLocalCatalogPreview} from '../scripts/site/local-catalog-preview.ts';

const document = {extensions: [{id: 'alpha', url: 'https://example.test/alpha.js'}]};
const svg = 'data:image/svg+xml;base64,PHN2Zy8+';

test('the preview uses the Editor catalog dependency with a clean GUI checkout', async t => {
    const directory = await mkdtemp(path.join(tmpdir(), 'plus-catalog-wiring-'));
    t.after(() => rm(directory, {recursive: true, force: true}));
    const gui = path.join(directory, 'gui');
    const catalog = path.join(directory, 'catalog');
    await mkdir(gui);
    await writeFile(path.join(gui, 'package.json'), '{"private":true}');
    await mkdir(path.join(catalog, 'site'), {recursive: true});
    const input = {schemaVersion: 1, extensions: [{id: 'fixture', version: '1.0.0',
        name: 'Fixture', url: 'https://example.test/fixture.js', sha256: 'a'.repeat(64),
        dependencies: [], unsandboxed: 'optional'}]};
    await writeFile(path.join(catalog, 'site/extensions-v1.json'), JSON.stringify(input));
    const output = path.join(directory, 'artifacts/catalog.json');
    const info = await prepareLocalCatalogPreview(catalog, gui, output);
    assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), {catalog: input, icons: {}});
    assert.equal(info.published, false);
});

test('a normal distribution reads the published catalog without credentials', async () => {
    const asked: unknown[] = [];
    const catalog = createPlusCatalog({
        localCatalog: null,
        fetchDocument: (signal: unknown) => {
            asked.push(signal);
            return Promise.resolve(document);
        }
    });
    assert.equal(catalog.url, CATALOG_URL);
    const read = await catalog.read('signal' as unknown as AbortSignal);
    assert.deepEqual(read, {catalog: document, icons: {}});
    assert.deepEqual(asked, ['signal']);
});

// While previewing the document comes from the build, so there is no address to report.
test('a preview build answers from its own input and reports no address', async () => {
    const catalog = createPlusCatalog({localCatalog: {catalog: document, icons: {alpha: svg}}});
    assert.equal(catalog.url, null);
    const read = await catalog.read(undefined as unknown as AbortSignal);
    assert.equal(read.catalog, document);
    assert.deepEqual(read.icons, {alpha: svg});
});

// Images are the trusted build's own bytes. Anything else is this side's mistake to catch.
test('an image for an unlisted id, or one that is not an SVG data URL, is refused', async () => {
    const unlisted = createPlusCatalog({localCatalog: {catalog: document, icons: {other: svg}}});
    await assert.rejects(() => unlisted.read(undefined as unknown as AbortSignal), /cannot vouch for: other/);
    for (const bad of ['https://example.test/alpha.svg', 'data:image/png;base64,AAAA', 42]) {
        const catalog = createPlusCatalog({localCatalog: {catalog: document, icons: {alpha: bad}}});
        await assert.rejects(() => catalog.read(undefined as unknown as AbortSignal), /cannot vouch for: alpha/);
    }
});

test('a cancelled preview read says so instead of answering', async () => {
    const catalog = createPlusCatalog({localCatalog: {catalog: document, icons: {}}});
    await assert.rejects(() => catalog.read({aborted: true} as unknown as AbortSignal), /cancelled/i);
});

test('the integration ships the catalog, so the GUI can ask for it', () => {
    const shipped = createPlusIntegration({
        mountEditor: () => ({dispose () {}})
    });
    // The catalog is not handed through the integration any more: the GUI stopped reading it when
    // the library tab and the trusted catalog moved here, so both read `plus-catalog.js` directly.
    assert.equal('extensionCatalog' in shipped, false);
});

// The builder has no editor chrome, so it is given only the catalog. Supplying the editor's
// integration there would pull the document editor into a bundle that has no use for it.
// The builder page is this repository's own entry now, importing the catalog, the trust it implies
// and the dialog directly, so there is no integration socket to fill in that bundle any more.
