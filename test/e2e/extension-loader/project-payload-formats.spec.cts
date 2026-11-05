const {test, expect} = require('./fixtures.cts');
const {devices} = require('@playwright/test');
const Zip = require('@turbowarp/jszip');
const {createHash} = require('node:crypto');
const {fixture, installFixtures, saveSB3, reopenSB3} = require('./catalog.cts');
const {project} = require('./project.cts');

test.use({userAgent: devices['Pixel 7'].userAgent});

const owner = 'kubohiroyakamishibairuntime4';
const source = "kamishibai: '4.0'\nscenes:\n  opening: []\n";
const bundledAsset = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"/>');
const sound = Buffer.from('524946463400000057415645666d74201000000001000100401f0000803e0000020010006461746110000000' +
    '00000000000000000000000000000000', 'hex');
const soundId = createHash('md5').update(sound).digest('hex');
const soundName = `${soundId}.wav`;
const extension = fixture(owner, 'embedded-file');
const endpoints = {
    source: 'https://payload-fixture.invalid/story.k4.yml',
    bundled: 'https://payload-fixture.invalid/model.svg',
    native: 'https://payload-fixture.invalid/backdrop.svg',
    sound: 'https://payload-fixture.invalid/beat.wav'
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function makeProject() {
    const sb3 = await project({id: owner, code: extension.bytes, sha256: extension.sha256});
    const zip = await Zip.loadAsync(sb3);
    const json = JSON.parse(await zip.file('project.json').async('string'));
    const nativeName = json.targets[0].costumes[0].md5ext;
    const nativeAsset = await zip.file(nativeName).async('nodebuffer');
    json.extensionStorage = {[owner]: {
        source: {mode: 'embedded', displayName: '台本 fixture', text: source},
        assets: {formatVersion: 1, files: [{assetId: 'Model', path: 'model.svg', encoding: 'base64',
            data: bundledAsset.toString('base64')}]}
    }};
    json.targets[0].sounds.push({name: 'Beat', assetId: soundId, dataFormat: 'wav', md5ext: soundName,
        rate: 8000, sampleCount: 8});
    zip.file(soundName, sound);
    zip.file('project.json', JSON.stringify(json));
    return {sb3: await zip.generateAsync({type: 'nodebuffer'}), nativeName, nativeAsset};
}

const settings = page => page.getByRole('dialog', {name: '作品データの形式'});
async function openSettings(page) {
    await page.getByText('ファイル', {exact: true}).locator('xpath=ancestor::div[1]').click();
    await page.getByRole('button', {name: '作品データの形式…'}).click();
    await expect(settings(page)).toBeVisible();
}
async function start(page, disableFormatEditing = false) {
    await page.goto(`editor.html?lang=ja${disableFormatEditing ? '&twPlusPayloadFormats=0' : ''}`);
    await page.waitForFunction(() => globalThis.vm?.runtime?.targets?.length > 0);
}
async function waitForOwner(page) {
    await expect.poll(() => page.evaluate(id => {
        try {
            const project = JSON.parse(vm.toJSON());
            return project.extensionStorage?.[id]?.source?.text;
        } catch { return undefined; }
    }, owner)).toBe(source);
}
const selections = [
    ['ソースデータ – 台本 fixture', '台本 fixture', 'source'],
    ['アセット – Model / model.svg', 'Model / model.svg', 'bundled'],
    ['アセット – Blank', 'Blank', 'native'],
    ['アセット – Beat', 'Beat', 'sound']
];
async function reopenRemote(page, sb3, cacheable, disableFormatEditing = false, useCache = true) {
    await start(page, disableFormatEditing);
    await reopenSB3(page, sb3, 'payload-formats.sb3');
    const permission = page.getByRole('dialog', {name: /作品のデータを取得する|Load Project Data/u});
    await expect(permission).toBeVisible();
    for (const url of Object.values(endpoints)) await expect(permission).toContainText(url);
    const answer = cacheable ? (useCache ? /キャッシュを許可して開く|Allow caching and open/u :
        /キャッシュせずに開く|Open without caching/u) : /^(開く|Open)$/u;
    await permission.getByRole('button', {name: answer}).click();
}

for (const format of ['embedded-file', 'embedded-data', 'remote-non-cacheable', 'remote-cacheable']) {
    test(`${format} stores and reopens source, bundled assets and native assets`, async ({page, context}) => {
        const {sb3, nativeName, nativeAsset} = await makeProject();
        await installFixtures(context, [extension]);
        const inputs = {source: Buffer.from(source), bundled: bundledAsset, native: nativeAsset, sound};
        const requests = {source: 0, bundled: 0, native: 0, sound: 0};
        for (const [name, url] of Object.entries(endpoints)) {
            await context.route(url, route => {
                requests[name]++;
                return route.fulfill({body: inputs[name], headers: {'access-control-allow-origin': '*'}});
            });
        }
        await start(page);
        await reopenSB3(page, sb3);
        await waitForOwner(page);
        await openSettings(page);
        const remote = format.startsWith('remote-');
        for (const [name, label, key] of selections) {
            await settings(page).getByRole('combobox', {name}).selectOption(format);
            if (remote) await settings(page).getByRole('textbox', {name: `${label} HTTPS URL`}).fill(endpoints[key]);
        }
        await settings(page).getByRole('button', {name: '適用', exact: true}).click();
        await expect(settings(page)).toHaveCount(0);
        expect(Object.values(requests)).toEqual(remote ? [1, 1, 1, 1] : [0, 0, 0, 0]);

        const saved = await saveSB3(page);
        const zip = await Zip.loadAsync(saved);
        const json = JSON.parse(await zip.file('project.json').async('string'));
        const entries = json.turboWarpPlusPayloads.entries;
        expect(entries.map(entry => [entry.kind, entry.format])).toEqual([
            ['source', format], ['assets', format], ['assets', format], ['assets', format]
        ]);
        expect(json.extensionStorage[owner].source.text).toBeUndefined();
        expect(json.extensionStorage[owner].assets.files[0].data).toBeUndefined();
        if (format === 'embedded-file') {
            expect(await zip.file('plus-payloads/source-0.bin').async('string')).toBe(source);
            expect(await zip.file('plus-payloads/assets-1.bin').async('nodebuffer')).toEqual(bundledAsset);
            expect(await zip.file(nativeName).async('nodebuffer')).toEqual(nativeAsset);
            expect(await zip.file(soundName).async('nodebuffer')).toEqual(sound);
        } else {
            expect(zip.file(nativeName)).toBeNull();
            expect(zip.file(soundName)).toBeNull();
            expect(Object.keys(zip.files).filter(name => name.startsWith('plus-payloads/'))).toHaveLength(0);
            const expected = Object.values(inputs);
            for (const [index, entry] of entries.entries()) {
                if (remote) {
                    expect(entry.url).toBe(Object.values(endpoints)[index]);
                    expect(entry.sha256).toBe(hash(expected[index]));
                    expect(entry.data).toBeUndefined();
                } else {
                    expect(entry.data).toBe(`data:application/octet-stream;base64,${expected[index].toString('base64')}`);
                }
            }
        }

        if (remote) {
            await reopenRemote(page, saved, format === 'remote-cacheable');
        } else {
            await start(page);
            await reopenSB3(page, saved);
        }
        await waitForOwner(page);
        await openSettings(page);
        for (const [name] of selections) await expect(settings(page).getByRole('combobox', {name})).toHaveValue(format);
        await settings(page).getByRole('button', {name: 'キャンセル'}).click();
        const expanded = await page.evaluate(({id, soundFile}) => {
            const files = vm.saveProjectSb3DontZip();
            const json = JSON.parse(new TextDecoder().decode(files['project.json']));
            const name = json.targets[0].costumes[0].md5ext;
            return {data: json.extensionStorage[id].assets.files[0].data, native: [...files[name]], sound: [...files[soundFile]]};
        }, {id: owner, soundFile: soundName});
        expect(expanded.data).toBe(bundledAsset.toString('base64'));
        expect(Buffer.from(expanded.native)).toEqual(nativeAsset);
        expect(Buffer.from(expanded.sound)).toEqual(sound);

        if (format === 'embedded-file') {
            await openSettings(page);
            for (const [name] of selections) {
                await settings(page).getByRole('combobox', {name}).selectOption('embedded-data');
            }
            await settings(page).getByRole('button', {name: '適用', exact: true}).click();
            await expect(settings(page)).toHaveCount(0);
            const repacked = await Zip.loadAsync(await saveSB3(page));
            expect(Object.keys(repacked.files).filter(name => name.startsWith('plus-payloads/'))).toHaveLength(0);
            expect(repacked.file(nativeName)).toBeNull();
            expect(repacked.file(soundName)).toBeNull();
        }
        if (remote) {
            expect(Object.values(requests)).toEqual([2, 2, 2, 2]);
            await reopenRemote(page, saved, format === 'remote-cacheable');
            await waitForOwner(page);
            expect(Object.values(requests)).toEqual(format === 'remote-cacheable' ? [2, 2, 2, 2] : [3, 3, 3, 3]);
            if (format === 'remote-cacheable') {
                await reopenRemote(page, saved, true, true, false);
                await waitForOwner(page);
                await page.getByText('ファイル', {exact: true}).locator('xpath=ancestor::div[1]').click();
                await expect(page.getByRole('button', {name: '作品データの形式…'})).toHaveCount(0);
                await expect(page.getByRole('button', {name: 'バンドル素材を作品に追加…'})).toHaveCount(0);
                expect(Object.values(requests)).toEqual([3, 3, 3, 3]);
            }
        }
    });
}

test('adds bundled images and sound as native project assets that work after reopening', async ({page, context}) => {
    await installFixtures(context, [extension]);
    const {sb3} = await makeProject();
    const input = await Zip.loadAsync(sb3);
    const json = JSON.parse(await input.file('project.json').async('string'));
    const artwork = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="28"><rect width="36" height="28" fill="#abcdef"/></svg>');
    const chime = Buffer.from(sound);
    chime.writeInt16LE(500, 44);
    const originalBundle = json.extensionStorage[owner].assets;
    originalBundle.files.push(
        {assetId: 'Artwork', path: 'artwork.svg', encoding: 'base64', data: artwork.toString('base64')},
        {assetId: 'Chime', path: 'chime.wav', encoding: 'base64', data: chime.toString('base64')},
        {assetId: 'Broken', path: 'invalid.wav', encoding: 'base64', data: Buffer.from('invalid sound').toString('base64')}
    );
    json.targets.push({...json.targets[0], isStage: false, name: 'Fixture Sprite', blocks: {}, sounds: [],
        visible: true, x: 0, y: 0, size: 100, direction: 90, rotationStyle: 'all around', layerOrder: 1});
    input.file('project.json', JSON.stringify(json));

    await start(page);
    await reopenSB3(page, await input.generateAsync({type: 'nodebuffer'}));
    await waitForOwner(page);
    await page.getByText('ファイル', {exact: true}).locator('xpath=ancestor::div[1]').click();
    await page.getByRole('button', {name: 'バンドル素材を作品に追加…'}).click();
    const dialog = page.getByRole('dialog', {name: 'バンドル素材を作品に追加'});
    const material = dialog.getByRole('combobox', {name: 'バンドル素材'});
    const kind = dialog.getByRole('combobox', {name: '追加する種類'});
    const target = dialog.getByRole('combobox', {name: '追加先'});
    const add = dialog.getByRole('button', {name: '作品に追加', exact: true});
    await expect(dialog).toBeVisible();

    await material.selectOption({label: 'Broken / invalid.wav'});
    await target.selectOption({label: 'ステージ'});
    await add.click();
    await expect(dialog.getByRole('alert')).toContainText('素材を追加できませんでした');
    for (const [file, type, destination, name] of [
        ['Artwork / artwork.svg', 'costume', 'Fixture Sprite', 'Artwork'],
        ['Artwork / artwork.svg', 'backdrop', 'ステージ', 'Artwork'],
        ['Chime / chime.wav', 'sound', 'ステージ', 'Chime']
    ]) {
        await material.selectOption({label: file});
        await kind.selectOption(type);
        await target.selectOption({label: destination});
        await add.click();
        await expect(dialog.getByRole('status')).toContainText(`「${name}」を追加しました`);
    }
    await dialog.getByRole('button', {name: '閉じる'}).click();

    const saved = await saveSB3(page);
    const zip = await Zip.loadAsync(saved);
    const output = JSON.parse(await zip.file('project.json').async('string'));
    const savedStage = output.targets.find(target => target.isStage);
    const savedSprite = output.targets.find(target => target.name === 'Fixture Sprite');
    const savedBackdrop = savedStage.costumes.find(costume => costume.name === 'Artwork');
    const savedCostume = savedSprite.costumes.find(costume => costume.name === 'Artwork');
    const savedSound = savedStage.sounds.find(item => item.name === 'Chime');
    expect(savedStage.sounds.map(item => item.name)).toEqual(['Beat', 'Chime']);
    expect(savedCostume.md5ext).toBe(savedBackdrop.md5ext);
    expect(await zip.file(savedCostume.md5ext).async('string')).toContain('#abcdef');
    expect(await zip.file(savedSound.md5ext).async('nodebuffer')).toEqual(chime);
    expect(output.extensionStorage[owner].assets).toEqual(originalBundle);

    await start(page);
    await reopenSB3(page, saved, 'native-materials.sb3');
    await waitForOwner(page);
    const used = await page.evaluate(() => {
        const stage = vm.runtime.getTargetForStage();
        const sprite = vm.runtime.targets.find(item => item.getName() === 'Fixture Sprite');
        for (const target of [stage, sprite]) {
            target.setCostume(0);
            target.setCostume(target.getCostumes().findIndex(item => item.name === 'Artwork'));
        }
        const sound = stage.sprite.sounds.find(item => item.name === 'Chime');
        const bank = stage.sprite.soundBank;
        const player = bank.getSoundPlayer(sound.soundId);
        bank.playSound(stage, sound.soundId);
        return {
            backdrop: stage.getCostumes()[stage.currentCostume].name,
            costume: sprite.getCostumes()[sprite.currentCostume].name,
            backdropSkin: stage.getCostumes()[stage.currentCostume].skinId,
            costumeSkin: sprite.getCostumes()[sprite.currentCostume].skinId,
            samples: player.buffer.length,
            soundPlaying: player.isPlaying
        };
    });
    expect(used).toMatchObject({backdrop: 'Artwork', costume: 'Artwork',
        backdropSkin: expect.any(Number), costumeSkin: expect.any(Number), soundPlaying: true});
    expect(used.samples).toBeGreaterThan(0);
});
