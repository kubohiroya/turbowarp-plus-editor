import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createProjectIO} from '@kubohiroya/turbowarp-extension-loader/project-codec';
import {confirmLargeProject} from '@kubohiroya/turbowarp-plus-editor-ui/project-size-approval';
import {confirmedProjectArchiveOptions, extensionProjectArchiveOptions} from '../../site/extension-host/config.ts';
import {installPlusExtensionHost} from '../../site/extension-host/host.ts';
import {gateProjectSize, measureOversizedProject} from '../../site/extension-host/project-size-gate.ts';

import {guiRequire, vmModules} from './pinned-host.ts';

const VM = guiRequire('scratch-vm');
const Zip = guiRequire('@turbowarp/jszip');
const MiB = 1024 * 1024;
const project = {targets: [{isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {},
    comments: {}, currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0, tempo: 60,
    videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null}], monitors: [], extensions: [],
    meta: {semver: '3.0.0', vm: '0.2.0', agent: 'size gate test'}};
// The bulk is a stage variable, which the VM keeps, so a test can tell which project is open.
const json = (bulkBytes: number) => JSON.stringify({...project,
    targets: [{...project.targets[0], variables: {bulk: ['bulk', 'x'.repeat(bulkBytes)]}}]});
const bulk = vm => vm.runtime.getTargetForStage().variables.bulk.value.length;
const stored = (text: string) => new Zip().file('project.json', text).generateAsync({type: 'uint8array', compression: 'STORE'});

// Small limits keep the unit cases cheap; the real ones are exercised through the host below.
const standard = {maxArchiveBytes: MiB, maxTotalBytes: MiB, maxProjectBytes: MiB, maxEntryBytes: MiB};
const ceiling = {maxArchiveBytes: 4 * MiB, maxTotalBytes: 4 * MiB, maxProjectBytes: 4 * MiB, maxEntryBytes: 4 * MiB};

test('only a project between the standard and ceiling limits is put to the person', async () => {
    assert.equal(await measureOversizedProject(json(1000), standard, ceiling), null);
    assert.equal(await measureOversizedProject(await stored(json(1000)), standard, ceiling), null);

    const legacy = json(2 * MiB);
    assert.deepEqual(await measureOversizedProject(legacy, standard, ceiling), {bytes: legacy.length, limit: MiB});
    const bytes = new TextEncoder().encode(legacy);
    assert.deepEqual(await measureOversizedProject(bytes, standard, ceiling), {bytes: bytes.length, limit: MiB});
    const archive = await stored(legacy);
    const measured = await measureOversizedProject(archive, standard, ceiling);
    assert.ok(measured && measured.bytes >= legacy.length && measured.limit === MiB);
    assert.deepEqual(await measureOversizedProject(new Blob([archive]), standard, ceiling), measured);

    // Over the ceiling, or over the compression ratio, is refused by prepare without a question.
    assert.equal(await measureOversizedProject(json(5 * MiB), standard, ceiling), null);
    assert.equal(await measureOversizedProject(await stored(json(5 * MiB)), standard, ceiling), null);
    const bomb = await new Zip().file('project.json', json(10)).file('zeros.bin', new Uint8Array(2 * MiB))
        .generateAsync({type: 'uint8array', compression: 'DEFLATE'});
    assert.equal(await measureOversizedProject(bomb, standard, ceiling), null);
});

test('the gate opens an oversized project only when the person agrees, and keeps the ratio check', async () => {
    const asked = [];
    let answer = false;
    const io = gateProjectSize(createProjectIO({zip: Zip, ...ceiling}), {standard, ceiling,
        confirm: async question => { asked.push(question); return answer; }});
    const archive = await stored(json(2 * MiB));
    await assert.rejects(io.prepare(archive), {code: 'INVALID_ARCHIVE'});
    assert.equal(asked.length, 1);
    answer = true;
    assert.equal((await io.prepare(archive)).manifest, null);
    assert.equal(asked.length, 2);
    // The agreement was for that load only.
    answer = false;
    await assert.rejects(io.prepare(archive), {code: 'INVALID_ARCHIVE'});
    assert.equal(asked.length, 3);

    const bomb = await new Zip().file('project.json', json(10)).file('zeros.bin', new Uint8Array(2 * MiB))
        .generateAsync({type: 'uint8array', compression: 'DEFLATE'});
    answer = true;
    await assert.rejects(io.prepare(bomb), {code: 'INVALID_ARCHIVE'});
    await assert.rejects(io.prepare(await stored(json(5 * MiB))), {code: 'INVALID_ARCHIVE'});
    assert.equal(asked.length, 3);
    assert.equal((await io.prepare(json(1000))).manifest, null);
    assert.equal(asked.length, 3);

    // A question that fails, or a load cancelled while it is open, does not open the project.
    const failing = gateProjectSize(createProjectIO({zip: Zip, ...ceiling}), {standard, ceiling,
        confirm: async () => { throw new Error('no dialog'); }});
    await assert.rejects(failing.prepare(archive), {code: 'INVALID_ARCHIVE'});
    const controller = new AbortController();
    const cancelled = gateProjectSize(createProjectIO({zip: Zip, ...ceiling}), {standard, ceiling,
        confirm: async () => { controller.abort(); return true; }});
    await assert.rejects(cancelled.prepare(archive, {signal: controller.signal}), {code: 'CANCELLED'});
});

test('the Editor host asks before opening a project over 64 MiB and opens it on agreement', async () => {
    const vm = new VM();
    const asked = [];
    let answer = false;
    const host = installPlusExtensionHost(vm, {enabled: true, document: undefined, vmModules,
        requestApproval: async () => false, archiveOptions: confirmedProjectArchiveOptions,
        gateProjectIO: io => gateProjectSize(io, {standard: extensionProjectArchiveOptions,
            ceiling: confirmedProjectArchiveOptions,
            confirm: async question => { asked.push(question); return answer; }})});
    try {
        const archive = await stored(json(70 * MiB));
        await vm.loadProject(json(10));
        await assert.rejects(vm.loadProject(archive), {code: 'INVALID_ARCHIVE'});
        assert.equal(bulk(vm), 10);
        assert.equal(asked.length, 1);
        assert.equal(asked[0].limit, 64 * MiB);
        assert.ok(asked[0].bytes > 70 * MiB);
        answer = true;
        await vm.loadProject(archive);
        assert.equal(bulk(vm), 70 * MiB);
        assert.equal(asked.length, 2);
    } finally { await host.dispose(); vm.runtime.dispose(); }
});

test('the size question names the size, defaults to not opening, and answers no without a dialog', async () => {
    const dom = new JSDOM('<!doctype html><body></body>');
    const {document} = dom.window;
    const proto = dom.window.HTMLDialogElement.prototype;
    proto.showModal = function () { this.open = true; };
    proto.close = function () { this.open = false; };
    try {
        const question = {bytes: 100 * MiB, limit: 64 * MiB};
        const declined = confirmLargeProject(document, 'ja', question);
        const dialog = document.querySelector('dialog[data-project-size-approval]');
        assert.match(dialog.textContent, /約 100 MiB/);
        assert.match(dialog.textContent, /64 MiB/);
        const [no] = dialog.querySelectorAll('button');
        assert.equal(document.activeElement, no);
        no.click();
        assert.equal(await declined, false);
        assert.equal(document.querySelector('dialog'), null);

        const agreed = confirmLargeProject(document, 'en', question);
        assert.match(document.querySelector('dialog').textContent, /about 100 MiB/);
        document.querySelectorAll('button')[1].click();
        assert.equal(await agreed, true);

        const controller = new AbortController();
        const aborted = confirmLargeProject(document, 'en', question, {signal: controller.signal});
        controller.abort();
        assert.equal(await aborted, false);
        assert.equal(document.querySelector('dialog'), null);

        assert.equal(await confirmLargeProject(undefined, 'ja', question), false);
    } finally {
        dom.window.close();
    }
});
