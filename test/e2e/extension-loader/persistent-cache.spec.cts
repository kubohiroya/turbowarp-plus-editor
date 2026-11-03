const {test, expect} = require('./fixtures.cts');
const Zip = require('@turbowarp/jszip');
const {project, digest, bytes, remoteURL} = require('./project.cts');

// Issue #55, stages 3 and 4: the editor keeps a remote-cacheable copy in IndexedDB, filed under the
// address of the project it was fetched for, so it survives a reload. This server is
// http://localhost, where the editor gives no project an address of its own, so the project here
// carries one already — as an SB3 saved from the published editor would.
const address = 'https://kubohiroya.github.io/turbowarp-plus-projects/aa/00aa/0193f0a1-2b3c-7d4e-8f01-0000000000aa.sb3';

const review = page => page.getByRole('dialog').filter({has: page.locator('.twextsec-review')});
const reviewRow = page => review(page).locator('.twextsec-row[data-key="plusfixture"]');
const executions = page => page.evaluate(() => globalThis.__plusFixtureStarted || 0);

async function openEditor(page) {
    await page.goto('editor.html?lang=ja');
    await page.waitForFunction(() => globalThis.vm?.runtime?.targets?.length > 0);
}
function load(page, buffer) {
    return page.evaluate(async values => {
        try { await vm.loadProject(new Uint8Array(values)); return {ok: true}; }
        catch (error) { return {ok: false, code: error.code}; }
    }, [...buffer]);
}
// The loading choice is the opener's: keep the copy (the author's default) or fetch every time.
async function answer(page, loading) {
    await expect(review(page)).toBeVisible();
    await reviewRow(page).locator(`input[name="loading-plusfixture"][value="${loading}"]`).check();
    await review(page).locator('input[name="execution-plusfixture"][value="unsandboxed"]').check();
    await review(page).getByRole('button', {name: 'OK', exact: true}).click();
    await expect(review(page)).toHaveCount(0);
}
// Every claim the cache recorded, read from the browser's own store rather than from the host.
const usage = page => page.evaluate(async () => {
    if (!(await indexedDB.databases()).some(db => db.name === 'turbowarp-plus-extension-cache')) return [];
    const db: IDBDatabase = await new Promise((resolve, reject) => {
        const request = indexedDB.open('turbowarp-plus-extension-cache');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    try {
        if (!db.objectStoreNames.contains('usage')) return [];
        return await new Promise((resolve, reject) => {
            const request = db.transaction('usage').objectStore('usage').getAll();
            request.onsuccess = () => resolve(request.result.map(({bucket, key}) => ({bucket, key})));
            request.onerror = () => reject(request.error);
        });
    } finally {
        db.close();
    }
});
async function serve(page) {
    const counter = {fetched: 0};
    await page.route(remoteURL, route => { counter.fetched++; return route.fulfill({body: bytes,
        headers: {'access-control-allow-origin': '*', 'content-type': 'application/javascript'}}); });
    return counter;
}
// A route still answers while the context is offline, so the URL is made to refuse instead.
async function refuse(page) {
    const counter = {refused: 0};
    await page.unroute(remoteURL);
    await page.route(remoteURL, route => { counter.refused++; return route.abort('internetdisconnected'); });
    return counter;
}
const savedURI = async page => {
    const saved = Buffer.from(await page.evaluate(async () => [...new Uint8Array(await vm.saveProjectSb3('arraybuffer'))]));
    const json = JSON.parse(await (await Zip.loadAsync(saved)).file('project.json').async('string'));
    return {saved, uri: json.turboWarpPlus?.uri};
};

test('a kept copy survives a reload under the project address, and saving and reopening keeps the address', async ({page}) => {
    const network = await serve(page);
    await openEditor(page);
    let loading = load(page, await project({type: 'remote-cacheable', extraManifest: {uri: address}}));
    await answer(page, 'remote-cacheable');
    expect(await loading).toEqual({ok: true});
    expect(network.fetched).toBe(1);
    await expect.poll(() => usage(page)).toEqual([{bucket: address, key: digest}]);
    const first = await savedURI(page);
    expect(first.uri).toBe(address);

    // A fresh page holds nothing of the first one but what the browser stored.
    await openEditor(page);
    const offline = await refuse(page);
    loading = load(page, first.saved);
    await answer(page, 'remote-cacheable');
    expect(await loading).toEqual({ok: true});
    expect(offline.refused).toBe(0);
    expect(await executions(page)).toBe(1);
    expect((await savedURI(page)).uri).toBe(address);
    expect(await usage(page)).toEqual([{bucket: address, key: digest}]);
});

test('choosing to fetch every time records nothing, and a reload then needs the network', async ({page}) => {
    await serve(page);
    await openEditor(page);
    const input = await project({type: 'remote-cacheable', extraManifest: {uri: address}});
    let loading = load(page, input);
    await answer(page, 'remote-non-cacheable');
    expect(await loading).toEqual({ok: true});
    expect(await executions(page)).toBe(1);
    expect(await usage(page)).toEqual([]);

    await openEditor(page);
    const offline = await refuse(page);
    loading = load(page, input);
    await answer(page, 'remote-cacheable');
    expect((await loading).ok).toBe(false);
    expect(offline.refused).toBeGreaterThan(0);
    expect(await usage(page)).toEqual([]);
});
