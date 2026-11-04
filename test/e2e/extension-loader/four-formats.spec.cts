const {test, expect} = require('./fixtures.cts');
const {devices} = require('@playwright/test');
const Zip = require('@turbowarp/jszip');
const {specifications, installFixtures, selection, row, form, openCatalog, saveSB3, reopenSB3} =
    require('./catalog.cts');
const {project, bytes, digest, remoteURL} = require('./project.cts');

// The download fallback for saving and the file input for opening are what a phone gets, and what
// a test can drive; a desktop Chromium would offer the File System Access pickers instead.
test.use({userAgent: devices['Pixel 7'].userAgent});

// Issue #68: the four loading forms are the author's choice on the add screen, recorded in the
// Manifest and carried by the SB3; the person opening it may only decline a remote-cacheable copy.
const forms = ['remote-non-cacheable', 'remote-cacheable', 'embedded-file', 'embedded-data'];
const labels = {
    ja: {add: '拡張機能を追加', addButton: '追加', loading: '読み込み元', openTitle: 'この作品は機能拡張を使います',
        ok: 'OK', cancel: 'キャンセル', forms: {
            'remote-cacheable': 'キャッシュを残す（既定）', 'remote-non-cacheable': '毎回取得する',
            'embedded-file': '作品の中から', 'embedded-data': '作品の中の data: アドレスから'}},
    en: {add: 'Add Extension', addButton: 'Add', loading: 'Where it loads from', openTitle: 'This project wants to run extensions',
        ok: 'OK', cancel: 'Cancel', forms: {
            'remote-cacheable': 'Keep a copy (default)', 'remote-non-cacheable': 'Fetch each time',
            'embedded-file': 'In the project', 'embedded-data': 'In the project, as a data address'}}
};

async function openEditor(page, lang = 'ja') {
    await page.goto(`editor.html?lang=${lang}`);
    await page.waitForFunction(() => globalThis.vm?.runtime?.targets?.length > 0);
}
const loaded = (page, id) => page.evaluate(name => vm.extensionManager.isExtensionLoaded(name), id);
const projectFiles = zip => Object.keys(zip.files).filter(name => name.startsWith('extensions/'));

for (const distribution of forms) {
    test(`${distribution}: chosen on the add screen, saved in the SB3, and shown again after reopening it`, async ({page, context}) => {
        const spec = specifications.find(item => item.distribution === distribution);
        const fetched = await installFixtures(context, [spec]);
        await openEditor(page);
        await openCatalog(page, 1);
        await row(page, spec).getByRole('checkbox').check();
        // Chosen by its label, which is what the author reads; the value is what the Manifest says.
        await row(page, spec).getByRole('radio', {name: labels.ja.forms[distribution], exact: true}).check();
        await expect(form(page, spec)).toBeChecked();
        await selection(page).getByRole('button', {name: labels.ja.addButton, exact: true}).click();
        await expect(selection(page)).toHaveCount(0);
        await expect.poll(() => loaded(page, spec.id)).toBe(true);

        const saved = await saveSB3(page);
        const zip = await Zip.loadAsync(saved);
        const json = JSON.parse(await zip.file('project.json').async('string'));
        expect(json.turboWarpPlus.extensions).toHaveLength(1);
        const stored = json.turboWarpPlus.extensions[0];
        expect(stored).toMatchObject({id: spec.id, execution: 'unsandboxed', sha256: spec.sha256,
            source: {type: distribution}});
        const address = (json.extensionURLs || {})[spec.id];
        if (distribution === 'embedded-file') {
            // The code is a file in the SB3, and the project document carries no address for it.
            expect(projectFiles(zip)).toEqual([stored.source.path]);
            expect(await zip.file(stored.source.path).async('nodebuffer')).toEqual(spec.bytes);
            expect(String(address || '')).not.toMatch(/^data:/);
        } else if (distribution === 'embedded-data') {
            // The code is the address a standard TurboWarp host loads, and nothing else is stored.
            expect(address).toMatch(/^data:/);
            expect(Buffer.from(await (await fetch(address)).arrayBuffer())).toEqual(spec.bytes);
            expect(projectFiles(zip)).toEqual([]);
        } else {
            expect(stored.source.url).toBe(spec.url);
            expect(projectFiles(zip)).toEqual([]);
            expect(String(address || '')).not.toMatch(/^data:/);
        }

        // A fresh page holds nothing of the first one, so what comes back comes from the file.
        await openEditor(page);
        const before = fetched.get(spec.id);
        await reopenSB3(page, saved, `${distribution}.sb3`);
        await expect.poll(() => loaded(page, spec.id)).toBe(true);
        // The embedded forms open without the network, and so does the remote-cacheable one: the
        // copy the first page kept is in this browser's IndexedDB (issue #55). Only the form that
        // forbids a copy fetches from the recorded URL again.
        expect(fetched.get(spec.id) - before).toBe(distribution === 'remote-non-cacheable' ? 1 : 0);
        await openCatalog(page, 1);
        await expect(row(page, spec).locator('.twextsec-state')).toHaveText('▶️ 読み込み済み');
        for (const other of forms) {
            if (other === distribution) await expect(form(page, spec, other)).toBeChecked();
            else await expect(form(page, spec, other)).not.toBeChecked();
        }
    });
}

// A project that is not in the catalog is asked about when it opens, and that is the only place the
// opener sees how it loads.
const review = page => page.getByRole('dialog').filter({has: page.locator('.twextsec-review')});
// The review also offers the same labels for all rows at once, so a row's own choice is read in its row.
const reviewRow = page => review(page).locator('.twextsec-row[data-key="plusfixture"]');
const loadingChoices = page => reviewRow(page).locator('input[name="loading-plusfixture"]');
const executions = page => page.evaluate(() => globalThis.__plusFixtureStarted || 0);
function load(page, buffer) {
    return page.evaluate(async values => {
        try { await vm.loadProject(new Uint8Array(values)); return {ok: true}; }
        catch (error) { return {ok: false, code: error.code}; }
    }, [...buffer]);
}
async function allowAndConfirm(page) {
    await review(page).locator('input[name="execution-plusfixture"][value="unsandboxed"]').check();
    await review(page).getByRole('button', {name: 'OK', exact: true}).click();
    await expect(review(page)).toHaveCount(0);
}
async function serveFixture(page) {
    const counter = {fetched: 0};
    await page.route(remoteURL, route => { counter.fetched++; return route.fulfill({body: bytes,
        headers: {'access-control-allow-origin': '*', 'content-type': 'application/javascript'}}); });
    return counter;
}

// Whether a copy was written is read from what a second load needs: with the code's URL refusing
// every request, accepting the copy succeeds only if the first load left one in this browser. A
// route still answers while the context is offline, so the URL is made to fail rather than the
// context taken offline. Keeping the copy is the control that shows the check can tell.
for (const declined of [true, false]) {
    test(declined ? 'opening a remote-cacheable project and choosing to fetch every time keeps nothing in the cache' :
        'opening a remote-cacheable project and keeping the copy lets it reopen without the network', async ({page}) => {
        const counter = await serveFixture(page);
        await openEditor(page);
        const input = await project({type: 'remote-cacheable'});
        let loading = load(page, input);
        await expect(review(page)).toBeVisible();
        // Keeping a copy is the author's default; declining it is the opener's only loading choice.
        await expect(loadingChoices(page)).toHaveCount(2);
        await expect(loadingChoices(page).and(page.locator('[value="remote-cacheable"]'))).toBeChecked();
        if (declined) await reviewRow(page).getByRole('radio', {name: labels.ja.forms['remote-non-cacheable'], exact: true}).check();
        await allowAndConfirm(page);
        expect(await loading).toEqual({ok: true});
        expect(await executions(page)).toBe(1);
        expect(counter.fetched).toBe(1);
        // The opener's answer does not rewrite the author's form.
        expect((await page.evaluate(() => JSON.parse(vm.toJSON()))).turboWarpPlus.extensions[0].source.type)
            .toBe('remote-cacheable');

        let refused = 0;
        await page.unroute(remoteURL);
        await page.route(remoteURL, route => { refused++; return route.abort('internetdisconnected'); });
        loading = load(page, input);
        await expect(review(page)).toBeVisible();
        await reviewRow(page).getByRole('radio', {name: labels.ja.forms['remote-cacheable'], exact: true}).check();
        await allowAndConfirm(page);
        if (declined) {
            expect((await loading).ok).toBe(false);
            expect(refused).toBeGreaterThan(0);
            expect(await executions(page)).toBe(1);
        } else {
            expect(await loading).toEqual({ok: true});
            expect(refused).toBe(0);
            expect(await executions(page)).toBe(2);
        }
    });
}

test('a remote-non-cacheable project offers no copy to keep or decline', async ({page}) => {
    const counter = await serveFixture(page);
    await openEditor(page);
    const loading = load(page, await project({type: 'remote-non-cacheable'}));
    await expect(review(page)).toBeVisible();
    await expect(loadingChoices(page)).toHaveCount(0);
    await expect(review(page).getByRole('radio', {name: labels.ja.forms['remote-non-cacheable'], exact: true})).toHaveCount(0);
    await expect(review(page).getByRole('radio', {name: labels.ja.forms['remote-cacheable'], exact: true})).toHaveCount(0);
    await allowAndConfirm(page);
    expect(await loading).toEqual({ok: true});
    expect(counter.fetched).toBe(1);
});

// The Manifest is rewritten after the helper builds it, so each retired spelling is exactly what
// the SB3 carries, with the code still in the file and at the URL it names.
async function withSource(source) {
    const zip = await Zip.loadAsync(await project({type: 'embedded-file'}));
    const json = JSON.parse(await zip.file('project.json').async('string'));
    json.turboWarpPlus.extensions[0].source = source;
    return zip.file('project.json', JSON.stringify(json)).generateAsync({type: 'nodebuffer'});
}

test('an SB3 whose Manifest uses a retired spelling fails to open with INVALID_SOURCE', async ({page}) => {
    await serveFixture(page);
    await openEditor(page);
    for (const source of [{type: 'remote', url: remoteURL}, {type: 'cached', url: remoteURL},
        {type: 'embedded', path: 'extensions/plusfixture.js'}]) {
        const result = await load(page, await withSource(source));
        expect(result, source.type).toEqual({ok: false, code: 'INVALID_SOURCE'});
        // Refused before anyone is asked and before anything runs: it is not read as a current form.
        await expect(review(page)).toHaveCount(0);
        expect(await executions(page)).toBe(0);
        expect(await loaded(page, 'plusfixture')).toBe(false);
    }
    await expect(page.getByTestId('tw-plus-extension-status')).toHaveCount(0);
    await page.getByTestId('project-diagnostics-snackbar')
        .getByRole('button', {name: '詳細ログを表示', exact: true}).click();
    await expect(page.getByTestId('project-diagnostics')).toContainText('INVALID_SOURCE');
});

for (const lang of ['ja', 'en']) {
    test(`the add screen and the open review are worded in ${lang === 'ja' ? 'Japanese' : 'English'}`, async ({page, context}) => {
        const words = labels[lang];
        await installFixtures(context);
        await openEditor(page, lang);
        await openCatalog(page, specifications.length, words.add);
        const first = row(page, specifications[0]);
        await expect(first).toContainText(words.loading);
        for (const distribution of forms) {
            await expect(first.getByRole('radio', {name: words.forms[distribution], exact: true})).toHaveAttribute('value', distribution);
        }
        await expect(selection(page).getByRole('button', {name: words.addButton, exact: true})).toBeVisible();
        await selection(page).getByRole('button', {name: words.cancel, exact: true}).click();
        await expect(selection(page)).toHaveCount(0);

        const loading = load(page, await project({type: 'remote-cacheable'}));
        await expect(review(page)).toBeVisible();
        await expect(review(page)).toContainText(words.openTitle);
        await expect(review(page).locator('.twextsec-digest')).toContainText(digest);
        await expect(reviewRow(page).getByRole('radio', {name: words.forms['remote-cacheable'], exact: true})).toBeChecked();
        await expect(reviewRow(page).getByRole('radio', {name: words.forms['remote-non-cacheable'], exact: true})).toBeVisible();
        await expect(review(page).getByRole('button', {name: words.ok, exact: true})).toBeVisible();
        await review(page).getByRole('button', {name: words.cancel, exact: true}).click();
        expect((await loading).code).toBe('EXTENSION_SECURITY_CANCELLED');
        expect(await executions(page)).toBe(0);
    });
}
