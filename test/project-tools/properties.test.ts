import {test} from 'node:test';
import assert from 'node:assert/strict';
import JSZip from '@turbowarp/jszip';
import {installProjectProperties, PROJECT_INFO_KEY as key} from '../../site/project-tools/properties.ts';
import {createAuthorHistory} from '../../site/project-tools/history.ts';
import {contactLink, descriptionParts} from '../../site/project-tools/links.ts';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';
import {EventEmitter} from 'node:events';

const data = () => ({schemaVersion: 1, title: 'Saved title', description: 'Example', author: 'Author',
    contact: 'a@example.test', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z'});
const fixture = (isNew = false) => {
    let project = {targets: [], meta: {agent: 'test'}};
    let title = 'Native title';
    let time = '2026-11-04T01:00:00Z';
    let failSave = false;
    const vm = {
        changes: 0,
        runtime: {emitProjectChanged: () => vm.changes++},
        async loadProject(input) {
            if (input?.fail) throw new Error('Rejected project');
            project = typeof input === 'string' ? JSON.parse(input) : input instanceof Uint8Array ?
                JSON.parse(await (await JSZip.loadAsync(input)).file('project.json').async('string')) : input;
        },
        toJSON(target?: string) { return JSON.stringify(target ? {sprite: true} : {targets: project.targets, meta: project.meta}); },
        async saveProjectSb3() {
            if (failSave) throw new Error('Compression failed');
            const zip = new JSZip(); zip.file('project.json', this.toJSON());
            return zip.generateAsync({type: 'uint8array'});
        },
        saveProjectSb3Stream() { return Object.assign(new EventEmitter(), {json: this.toJSON()}); },
        saveProjectSb3DontZip() { return {'project.json': new TextEncoder().encode(this.toJSON())}; }
    };
    const original = {...vm};
    const service = installProjectProperties(vm, {projectState: {getTitle: () => title,
        setTitle: value => { title = value; }, isNew: () => isNew}, now: () => time});
    return {vm, service, original, setTitle: value => { title = value; },
        setTime: value => { time = value; }, failSave: () => { failSave = true; }, project: () => project};
};

test('project tools defaults on, supports explicit off and rejects arbitrary values independently of the loader', () => {
    assert.equal(readWebStartupFeatureFlags('').projectTools, true);
    assert.equal(readWebStartupFeatureFlags('?lang=ja').projectTools, true);
    assert.equal(readWebStartupFeatureFlags('?twPlusProjectTools=1').projectTools, true);
    for (const value of ['0', '', 'true', 'false', 'invalid']) {
        assert.equal(readWebStartupFeatureFlags(`?twPlusProjectTools=${value}`).projectTools, false);
    }
    assert.deepEqual(readWebStartupFeatureFlags('?twPlusExtensionLoader=0'), {extensionLoader: false, projectTools: true, manualProjectURI: false, payloadFormats: true, spriteProperties: false, splitter: true, windowLayout: false, backpackPopout: false, internalWindows: false, stagePanel: false, stageDisplayMenu: true, targetList: false, spriteCodeWindows: false, standardLayout: true, extensionFileMenu: true, paletteDeletePreview: true, horizontalBlockPalette: false, contextMenuIcons: false, workspaceMinimap: true});
    assert.deepEqual(readWebStartupFeatureFlags('?twPlusProjectTools=0'), {extensionLoader: true, projectTools: false, manualProjectURI: true, payloadFormats: true, spriteProperties: false, splitter: true, windowLayout: false, backpackPopout: false, internalWindows: false, stagePanel: false, stageDisplayMenu: true, targetList: false, spriteCodeWindows: false, standardLayout: true, extensionFileMenu: true, paletteDeletePreview: true, horizontalBlockPalette: false, contextMenuIcons: false, workspaceMinimap: true});
});
test('properties round trip through an SB3 and preserve the title across a renamed file', async () => {
    const f = fixture();
    await f.vm.loadProject({targets: [], [key]: data()});
    assert.equal(f.service.snapshot().title, 'Saved title');
    f.service.apply({description: 'Changed', author: 'New name'});
    assert.equal(f.vm.changes, 1);
    const bytes = await f.vm.saveProjectSb3();
    const next = fixture(); await next.vm.loadProject(bytes);
    assert.equal(next.service.loadedTitle(), 'Saved title');
    assert.equal(next.service.snapshot().description, 'Changed');
    assert.equal(next.service.snapshot().updatedAt, '2026-11-04T01:00:00Z');
    assert.equal(next.service.snapshot().createdAt, data().createdAt);
});
test('viewing or serializing does not change dates; unchanged saves retain the modification date', async () => {
    const f = fixture(); await f.vm.loadProject({targets: [], [key]: data()});
    f.service.snapshot(); f.vm.toJSON(); await f.vm.saveProjectSb3();
    assert.equal(f.service.snapshot().updatedAt, data().updatedAt);
    f.project().targets.push({name: 'Sprite'});
    await f.vm.saveProjectSb3();
    assert.equal(f.service.snapshot().updatedAt, '2026-11-04T01:00:00Z');
    f.setTime('2026-11-05T00:00:00Z'); await f.vm.saveProjectSb3();
    assert.equal(f.service.snapshot().updatedAt, '2026-11-04T01:00:00Z');
});
test('native title changes are saved and affect the modification date', async () => {
    const f = fixture(); await f.vm.loadProject({targets: [], [key]: data()});
    f.setTitle('Native edit');
    const bytes = f.vm.saveProjectSb3DontZip()['project.json'];
    const info = JSON.parse(new TextDecoder().decode(bytes))[key];
    assert.equal(info.title, 'Native edit');
    assert.equal(info.updatedAt, '2026-11-04T01:00:00Z');
});
test('existing projects have blank dates; new projects record creation and reset author information', async () => {
    const old = fixture(); await old.vm.loadProject({targets: []});
    old.service.apply({author: 'A'});
    assert.equal(old.service.snapshot().createdAt, null);
    const fresh = fixture(true); await fresh.vm.loadProject({targets: []});
    assert.equal(fresh.service.snapshot().createdAt, '2026-11-04T01:00:00Z');
    assert.equal(fresh.service.snapshot().author, '');
    await old.vm.loadProject({targets: []});
    assert.equal(old.service.snapshot().author, '');
});
test('no-op apply does not dirty a project and sprite export contains no project metadata', async () => {
    const f = fixture(); await f.vm.loadProject({targets: [], [key]: data()});
    assert.equal(f.service.apply(f.service.snapshot()), false);
    assert.equal(f.vm.changes, 0);
    assert.equal(JSON.parse(f.vm.toJSON('sprite'))[key], undefined);
});
test('failed compression does not commit a date and edits during compression are retained', async () => {
    const f = fixture(); await f.vm.loadProject({targets: [], [key]: data()});
    f.service.apply({author: 'First'});
    const saving = f.vm.saveProjectSb3();
    f.service.apply({author: 'Second'});
    await saving;
    assert.equal(f.service.snapshot().author, 'Second');
    f.setTime('2026-11-05T00:00:00Z'); await f.vm.saveProjectSb3();
    assert.equal(f.service.snapshot().updatedAt, '2026-11-05T00:00:00Z');
    // The stream date is committed only on completion, not on construction or failure.
    f.service.apply({author: 'Third'});
    f.setTime('2026-11-06T00:00:00Z'); const stream = f.vm.saveProjectSb3Stream();
    assert.equal(f.service.snapshot().updatedAt, '2026-11-05T00:00:00Z');
    stream.emit('end');
    assert.equal(f.service.snapshot().updatedAt, '2026-11-06T00:00:00Z');
});
test('an old save completing after a project switch cannot change the new project', async () => {
    const f = fixture(); await f.vm.loadProject({targets: [], [key]: data()});
    f.service.apply({author: 'Old'});
    const stream = f.vm.saveProjectSb3Stream();
    await f.vm.loadProject({targets: [], [key]: {...data(), author: 'New'}});
    stream.emit('end');
    assert.equal(f.service.snapshot().author, 'New');
    assert.equal(f.service.snapshot().updatedAt, data().updatedAt);
});
test('unknown metadata versions and unknown v1 fields survive without reinterpretation', async () => {
    const f = fixture(); const unknown = {schemaVersion: 8, extension: {foo: true}};
    await f.vm.loadProject({targets: [], [key]: unknown});
    assert.equal(f.service.snapshot().readOnly, true);
    assert.throws(() => f.service.apply({author: 'X'}), /not editable/);
    assert.deepEqual(JSON.parse(f.vm.toJSON())[key], unknown);
    await f.vm.loadProject({targets: [], [key]: {...data(), future: {keep: true}}});
    f.service.apply({author: 'X'});
    assert.deepEqual(JSON.parse(f.vm.toJSON())[key].future, {keep: true});
});
test('load failure is reported without changing metadata; disposal restores native methods', async () => {
    const f = fixture(); await f.vm.loadProject({targets: [], [key]: data()});
    await assert.rejects(f.vm.loadProject({fail: true}), /Rejected/);
    assert.equal(f.service.loadState().phase, 'failed');
    assert.equal(f.service.snapshot().author, 'Author');
    f.service.dispose();
    for (const name of ['loadProject', 'toJSON', 'saveProjectSb3']) assert.equal(f.vm[name], f.original[name]);
});
test('histories are independent, capped at five, deduplicated and only stored when remembered', () => {
    const values = new Map(); const storage = {getItem: key => values.get(key), setItem: (key, value) => values.set(key, value)};
    const history = createAuthorHistory(storage);
    for (let i = 0; i < 7; i++) history.remember(`N${i}`, `C${i}`);
    history.remember(' N3 ', '');
    assert.deepEqual(history.snapshot().names, ['N3', 'N6', 'N5', 'N4', 'N2']);
    assert.deepEqual(history.snapshot().contacts, ['C6', 'C5', 'C4', 'C3', 'C2']);
    assert.deepEqual(createAuthorHistory(storage).snapshot(), history.snapshot());
    const blocked = createAuthorHistory({getItem() { throw Error(); }, setItem() { throw Error(); }});
    blocked.remember('Safe', ''); assert.deepEqual(blocked.snapshot().names, ['Safe']);
});
test('contact and description links allow only requested protocols and preserve literal markup', () => {
    assert.equal(contactLink('a@example.test'), 'mailto:a@example.test');
    assert.equal(contactLink('mailto:a@example.test'), 'mailto:a@example.test');
    assert.equal(contactLink('https://example.test'), 'https://example.test/');
    for (const value of ['javascript:alert(1)', 'data:text/html,x', 'http://example.test', 'https://user:pass@example.test']) {
        assert.equal(contactLink(value), null);
    }
    const text = '<script>text</script>\nSee https://example.test/a. 次 https://example.test/b。';
    const parts = descriptionParts(text);
    assert.equal(parts.map(part => part.text).join(''), text);
    assert.deepEqual(parts.filter(part => part.href).map(part => part.href),
        ['https://example.test/a', 'https://example.test/b']);
    assert.equal(descriptionParts('(https://example.test/a_(b)).').find(part => part.href).href,
        'https://example.test/a_(b)');
});

test('a rejected export does not advance the modification date', async () => {
    const f = fixture(); await f.vm.loadProject({targets: [], [key]: data()});
    f.service.apply({author: 'Pending'}); f.failSave();
    await assert.rejects(f.vm.saveProjectSb3(), /Compression failed/);
    assert.equal(f.service.snapshot().updatedAt, data().updatedAt);
});

test('out-of-order stream completion keeps the newest successful save date', async () => {
    const f = fixture(); await f.vm.loadProject({targets: [], [key]: data()});
    f.service.apply({author: 'Pending'});
    const older = f.vm.saveProjectSb3Stream();
    f.setTime('2026-11-05T00:00:00Z');
    const newer = f.vm.saveProjectSb3Stream();
    newer.emit('end'); older.emit('end');
    assert.equal(f.service.snapshot().updatedAt, '2026-11-05T00:00:00Z');
});
