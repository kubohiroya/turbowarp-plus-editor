const {expect} = require('@playwright/test');
const {createHash} = require('node:crypto');
const {readFile} = require('node:fs/promises');

// The catalog the add screen reads, answered from fixtures so no test reaches the network.
const catalogURL = 'https://kubohiroya.github.io/turbowarp-plus-packages/extensions-v1.json';

// A catalog extension is trusted like TurboWarp's own gallery, so it always runs without the
// sandbox and the screen states that instead of asking. What the author chooses is how it loads,
// spelled the same way by the screen and the manifest.
function fixture(id, distribution) {
    const source = `// Name: ${id}\n// ID: ${id}\n// Version: 1.0.0\n// Unsandboxed: optional\n// License: MIT\n
(function(Scratch) {
 const execution = Scratch.extensions.unsandboxed ? 'unsandboxed' : 'sandboxed';
 const vmAccess = typeof Scratch.vm !== 'undefined';
 if (Scratch.extensions.unsandboxed) {
  globalThis.__catalogAuthoringRuns = globalThis.__catalogAuthoringRuns || {};
  globalThis.__catalogAuthoringRuns['${id}'] = (globalThis.__catalogAuthoringRuns['${id}'] || 0) + 1;
 }
 Scratch.extensions.register({
  getInfo() { return {id: '${id}', name: '${id}', blocks: [
   {opcode: 'value', blockType: Scratch.BlockType.REPORTER, text: '${id} mode'}
  ]}; },
  value() { return execution + ':' + (vmAccess ? 'vm' : 'no-vm'); }
 });
})(Scratch);\n`;
    const bytes = Buffer.from(source);
    return {id, distribution, bytes, sha256: createHash('sha256').update(bytes).digest('hex'),
        url: `https://catalog-authoring.invalid/${id}.js`};
}
const specifications = [
    fixture('catembeddedfile', 'embedded-file'),
    fixture('catembeddeddata', 'embedded-data'),
    fixture('catremotecacheable', 'remote-cacheable'),
    fixture('catremotenoncacheable', 'remote-non-cacheable')
];

/**
 * Answer the catalog, the official gallery's metadata and every fixture's code from memory.
 * @returns {Map<string, number>} How many times each fixture's code was fetched, by ID.
 */
async function installFixtures(context, specs = specifications) {
    const fetched = new Map(specs.map(spec => [spec.id, 0]));
    await context.route(catalogURL, route => route.fulfill({json: {schemaVersion: 1,
        extensions: specs.map(spec => ({id: spec.id, name: spec.id, version: '1.0.0', url: spec.url,
            sha256: spec.sha256, dependencies: [], unsandboxed: 'optional',
            description: 'Catalog authoring browser fixture', license: 'MIT'}))},
        headers: {'access-control-allow-origin': '*'}}));
    await context.route('https://extensions.turbowarp.org/generated-metadata/extensions-v0.json',
        route => route.fulfill({json: {extensions: []}, headers: {'access-control-allow-origin': '*'}}));
    for (const spec of specs) {
        await context.route(spec.url, route => {
            fetched.set(spec.id, fetched.get(spec.id) + 1);
            return route.fulfill({body: spec.bytes,
                headers: {'content-type': 'application/javascript', 'access-control-allow-origin': '*'}});
        });
    }
    return fetched;
}

const selection = page => page.locator('.twextsec-review');
const row = (page, spec) => selection(page).locator(`.twextsec-row[data-key="${spec.id}"]`);
const form = (page, spec, distribution = spec.distribution) =>
    row(page, spec).locator(`input[name="loading-${spec.id}"][value="${distribution}"]`);

// The menu labels are the GUI's. The tests run in Japanese unless they name the English label.
async function openCatalog(page, count = specifications.length, addLabel = '拡張機能を追加') {
    await page.getByRole('button', {name: addLabel, exact: true}).click();
    await page.getByText('TurboWarp Plus', {exact: true}).click();
    await expect(selection(page)).toBeVisible();
    await expect(selection(page).locator('.twextsec-row')).toHaveCount(count);
}

async function saveSB3(page) {
    await page.getByText('ファイル', {exact: true}).click();
    const downloading = page.waitForEvent('download');
    await page.getByRole('listitem').filter({hasText: /^コンピューターに保存する$/}).click();
    return readFile(await (await downloading).path());
}

async function reopenSB3(page, bytes, name = 'catalog-authored.sb3') {
    await page.getByText('ファイル', {exact: true}).click();
    const choosing = page.waitForEvent('filechooser');
    await page.getByText('コンピューターから読み込む', {exact: true}).click();
    await (await choosing).setFiles({name, mimeType: 'application/octet-stream', buffer: bytes});
}

module.exports = {catalogURL, fixture, specifications, installFixtures, selection, row, form, openCatalog,
    saveSB3, reopenSB3};
