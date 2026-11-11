import assert from 'node:assert/strict';
import {test} from 'node:test';
import FontManager from 'scratch-vm/src/engine/tw-font-manager.js';
import {installWebFonts, webFontEditor, withPackagerFontFallbacks} from '@kubohiroya/turbowarp-plus-editor-ui/web-fonts';

const system = {system: true, family: 'Arial', fallback: 'Sans Serif'};
const web = {system: true, family: 'Press Start 2P', fallback: 'Pixel',
    webFont: {provider: 'google-fonts', id: 'press-start-2p'}};
const fontAsset = {assetId: '1'.repeat(32), dataFormat: 'woff2', data: new Uint8Array([1, 2, 3]),
    encodeDataURI: () => 'data:font/woff2;base64,AQID'};
const file = {system: false, family: 'Legacy', fallback: 'Serif', md5ext: `${fontAsset.assetId}.woff2`};

function host() {
    let faces: Record<string, string>;
    let changes = 0;
    const runtime = {
        fontManager: undefined,
        renderer: {async setCustomFonts(next: Record<string, string>) { faces = next; }},
        storage: {AssetType: {Font: {}}, load: async () => fontAsset},
        wrapAssetRequest: run => run(),
        emitProjectChanged() { changes++; }
    };
    const manager = runtime.fontManager = new FontManager(runtime);
    return {vm: {runtime}, manager, faces: () => faces, changes: () => changes};
}

test('approved web fonts render alongside file fonts and save as system fonts with references', async t => {
    const {vm, manager, faces} = host();
    const events: string[] = [];
    t.after(installWebFonts(vm, async families => {
        events.push(`approve ${families.join(', ')}`);
        return true;
    }, async font => {
        events.push(`read ${font.id}`);
        return fontAsset.data;
    }));
    await manager.deserialize([system, web, file]);
    assert.deepEqual(events, ['approve Press Start 2P', 'read press-start-2p']);
    assert.match(faces()['"Press Start 2P", Pixel'], /data:font\/woff2;base64,AQID/);
    assert.match(faces()['"Legacy", Serif'], /data:font\/woff2;base64,AQID/);
    assert.deepEqual(manager.serializeJSON(), [system, web, file]);
    assert.deepEqual(manager.serializeAssets(), [fontAsset]);

    const plain = withPackagerFontFallbacks(vm, () => manager.serializeJSON());
    assert.deepEqual(plain, [system, {system: true, family: web.family, fallback: web.fallback}, file]);
    const upstream = host().manager;
    await upstream.deserialize(manager.serializeJSON());
    assert.deepEqual(upstream.serializeJSON(), plain);
    assert.deepEqual(upstream.serializeAssets(), [fontAsset]);
    assert.deepEqual(manager.serializeJSON(), [system, web, file]);

    manager.deleteFont(1);
    assert.deepEqual(Object.keys(faces()), ['"Legacy", Serif']);
    assert.deepEqual(manager.serializeJSON(), [system, file]);
    manager.clear();
    assert.deepEqual(faces(), {});
});

test('refusal, failed downloads and an unknown catalog ID leave usable fallbacks', async t => {
    const {vm, manager, faces, changes} = host();
    let approve = false;
    let prompts = 0;
    let requests = 0;
    t.after(installWebFonts(vm, async () => { prompts++; return approve; }, async () => { requests++; return undefined; }));
    const unknown = {...web, webFont: {...web.webFont, id: 'https://example.org/file.woff2'}};
    await manager.deserialize([unknown]);
    assert.equal(prompts, 0);
    assert.equal(requests, 0);
    assert.equal(manager.serializeJSON()[0].webFont, undefined);

    await manager.deserialize([web]);
    assert.equal(prompts, 1);
    assert.equal(requests, 0);
    assert.deepEqual(manager.serializeJSON(), [web]);
    assert.deepEqual(faces(), {});
    approve = true;
    await manager.deserialize([web]);
    assert.equal(prompts, 2);
    assert.equal(requests, 1);
    assert.deepEqual(manager.serializeJSON(), [web]);
    assert.deepEqual(faces(), {});

    assert.equal(await webFontEditor(manager).add('press-start-2p', 'Pixel'), false);
    assert.equal(await webFontEditor(manager).add('roboto-mono', 'Sans Serif'), true);
    assert.equal(changes(), 1);
    assert.equal(manager.serializeJSON()[1].webFont.id, 'roboto-mono');
});
