const {test, expect, approveProjectExtensions} = require('./fixtures.cts');
const {settingsProject, extensionSource} = require('./settings-project.cts');
const selectBackdrop = require('../../fixtures/select-backdrop.ts').default;

test('find and replace uses workspace edits, keeps references and stages YAML for validation', async ({page, baseURL}) => {
    const bytes = await settingsProject(project => {
        const [stage, sprite] = project.targets;
        const root = {next: null, parent: null, fields: {}, shadow: false, topLevel: true, x: 460, y: 460};
        stage.variables['score-id'] = ['old score', 0];
        stage.broadcasts['signal-id'] = 'old signal';
        stage.blocks.receiveSignal = {...root, opcode: 'event_whenbroadcastreceived', inputs: {},
            fields: {BROADCAST_OPTION: ['old signal', 'signal-id']}};
        sprite.blocks.searchSay = {...root, opcode: 'looks_say', inputs: {MESSAGE: [1, [10, 'old dialogue']]}};
        sprite.blocks.scoreSet = {...root, opcode: 'data_setvariableto', inputs: {VALUE: [1, [10, '1']]},
            fields: {VARIABLE: ['old score', 'score-id']}};
        sprite.blocks.sendSignal = {...root, opcode: 'event_broadcast', inputs: {BROADCAST_INPUT: [1, [11, 'old signal', 'signal-id']]}};
        const signature = {tagName: 'mutation', children: [], proccode: 'old action %s',
            argumentids: '["arg1"]', argumentnames: '["value"]', argumentdefaults: '[""]', warp: 'false'};
        sprite.blocks.procedureDefine = {...root, opcode: 'procedures_definition', inputs: {custom_block: [1, 'procedurePrototype']}};
        sprite.blocks.procedurePrototype = {...root, opcode: 'procedures_prototype', parent: 'procedureDefine',
            shadow: true, topLevel: false, inputs: {arg1: [1, 'procedureParameter']}, mutation: signature};
        sprite.blocks.procedureParameter = {...root, opcode: 'argument_reporter_string_number', parent: 'procedurePrototype',
            shadow: true, topLevel: false, inputs: {}, fields: {VALUE: ['value', null]}};
        sprite.blocks.procedureCall = {...root, opcode: 'procedures_call', inputs: {arg1: [1, [10, 'parameter']]},
            mutation: signature};
        sprite.comments.note = {blockId: null, x: 500, y: 500, width: 150, height: 90, minimized: false, text: 'old note'};
    });
    const projectURL = new URL('static/project-replace.sb3', baseURL).href;
    await page.route(projectURL, route => route.fulfill({contentType: 'application/octet-stream', body: bytes}));
    const url = new URL('editor.html', baseURL);
    url.search = new URLSearchParams({lang: 'ja', project_url: projectURL}).toString();
    await page.goto(url.href);
    await approveProjectExtensions(page, [await extensionSource(bytes)], 'ja');
    await selectBackdrop(page);
    const search = page.getByRole('combobox', {name: '作品全体を検索'});
    const options = page.getByRole('listbox', {name: '検索結果'}).getByRole('option');
    const replacement = page.getByRole('textbox', {name: '置換後の文字列'});
    const mac = await page.evaluate(() => navigator.platform.startsWith('Mac'));
    await page.keyboard.press(mac ? 'Meta+f' : 'Control+f');
    await expect(search).toBeFocused();
    await expect(replacement).toBeHidden();
    await search.press('Escape');

    await page.getByText('編集', {exact: true}).click();
    const menuCommand = page.getByRole('button', {name: '検索と置換', exact: true});
    await expect(menuCommand).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+F');
    await expect(menuCommand.locator('kbd')).toHaveText(mac ? '⌃⇧F' : 'Ctrl+Shift+F');
    await menuCommand.click();
    await expect(replacement).toBeVisible();
    await search.press('Escape');
    await expect(replacement).toBeHidden();
    await page.keyboard.press('Control+Shift+f');
    await expect(search).toBeFocused();
    await expect(replacement).toBeVisible();

    const edit = async (query, result, value, button = '選択箇所を置換') => {
        await search.click();
        await search.fill(query);
        await options.filter({hasText: result}).first().click();
        await replacement.fill(value);
        await page.getByRole('button', {name: button, exact: true}).click();
        if (button === '選択箇所を置換') await expect(page.getByText('置換しました。', {exact: true})).toBeVisible();
    };
    const dialog = () => page.evaluate(() => {
        const blocks = window.vm.runtime.targets.find(target => !target.isStage && target.isOriginal).blocks;
        return blocks.getBlock(blocks.getBlock('searchSay').inputs.MESSAGE.block).fields.TEXT.value;
    });
    await edit('old dialogue', 'old dialogue', 'new dialogue');
    await expect.poll(dialog).toBe('new dialogue');
    await page.getByText('編集', {exact: true}).click();
    await page.getByRole('button', {name: '元に戻す'}).click();
    await expect.poll(dialog).toBe('old dialogue');
    await edit('old note', 'old note', 'new note');
    await expect.poll(() => page.evaluate(() => window.vm.editingTarget.comments.note.text)).toBe('new note');
    await edit('old score', 'old score', 'new score');
    await expect.poll(() => page.evaluate(() => {
        const stage = window.vm.runtime.getTargetForStage();
        const field = window.vm.editingTarget.blocks.getBlock('scoreSet').fields.VARIABLE;
        return [stage.variables['score-id'].name, field.id, field.value];
    })).toEqual(['new score', 'score-id', 'new score']);
    await edit('old action', 'old action', 'new action');
    await expect.poll(() => page.evaluate(() => {
        const blocks = window.vm.editingTarget.blocks;
        const definition = blocks.getBlock('procedurePrototype');
        const call = blocks.getBlock('procedureCall');
        return [definition.mutation.proccode, call.mutation.proccode, blocks.getBlock(call.inputs.arg1.block).fields.TEXT.value];
    })).toEqual(['new action %s', 'new action %s', 'parameter']);
    await edit('old signal', 'old signal', 'new signal');
    const broadcast = () => page.evaluate(() => {
        const stage = window.vm.runtime.getTargetForStage();
        const sprite = window.vm.runtime.targets.find(target => !target.isStage && target.isOriginal);
        const send = sprite.blocks.getBlock('sendSignal').inputs.BROADCAST_INPUT.block;
        const receive = stage.blocks.getBlock('receiveSignal').fields.BROADCAST_OPTION;
        return [stage.variables['signal-id'].value, receive.id, receive.value, sprite.blocks.getBlock(send).fields.BROADCAST_OPTION.value];
    });
    await expect.poll(broadcast).toEqual(['new signal', 'signal-id', 'new signal', 'new signal']);
    await page.getByText('編集', {exact: true}).click();
    await page.getByRole('button', {name: '元に戻す'}).click();
    await expect.poll(broadcast).toEqual(['old signal', 'signal-id', 'old signal', 'old signal']);

    await edit('rehearsal', 'rehearsal', 'production', 'プレビューで置換');
    const preview = page.locator('.twpe-yaml-source-preview textarea:visible');
    await expect(preview).toHaveValue('volume: 50\nmode: production\n');
    const savedSource = () => page.evaluate(() => window.vm.runtime.extensionStorage.twpeyamlsettings.documents.settings);
    await expect.poll(savedSource).toContain('mode: rehearsal');
    await page.locator('.twpe-yaml-save:visible').click();
    await expect.poll(savedSource).toContain('mode: production');
});
