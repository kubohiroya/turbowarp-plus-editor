import assert from 'node:assert/strict';
import test from 'node:test';

import {CATALOG_URL, createPlusCatalog} from '../site/plus-catalog.js';
import {createPlusIntegration} from '../site/plus-integration.js';

const document = {extensions: [{id: 'alpha', url: 'https://example.test/alpha.js'}]};
const svg = 'data:image/svg+xml;base64,PHN2Zy8+';

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
        flags: {embeddedYamlEditor: false},
        mountEditor: () => ({dispose () {}})
    });
    assert.equal(typeof shipped.extensionCatalog.read, 'function');
    assert.equal(shipped.extensionCatalog.url, CATALOG_URL);
});

// The builder has no editor chrome, so it is given only the catalog. Supplying the editor's
// integration there would pull the document editor into a bundle that has no use for it.
test('the builder is given the catalog, the trust it implies, the dialog, and nothing else', async () => {
    const {plusIntegration: builder} = await import('../site/plus-integration.packager.js');
    const supplied = builder() as Record<string, unknown>;
    // Nothing of the editor: its integration would pull the document editor into this bundle, and
    // the extension host with it, neither of which the builder page runs.
    assert.deepEqual(Object.keys(supplied).sort(), ['createPermissionUI', 'extensionCatalog', 'trustedExtensions']);
    assert.equal(typeof (supplied.extensionCatalog as {read: unknown}).read, 'function');
    assert.equal(typeof (supplied.trustedExtensions as {listDigests: unknown}).listDigests, 'function');
    assert.equal(typeof supplied.createPermissionUI, 'function');
});
