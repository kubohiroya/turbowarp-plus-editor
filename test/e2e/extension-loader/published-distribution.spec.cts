const {test, expect} = require('@playwright/test');
const {catalogURL, openExtensionLibrary} = require('./catalog.cts');

const extensionId = 'kubohiroyaexampleextension';
const references = [
    ['npm', process.env.E2E_PUBLISHED_EXTENSION_NPM],
    ['GitHub Release', process.env.E2E_PUBLISHED_EXTENSION_RELEASE]
];

for (const [provider, reference] of references) {
    test('loads a published extension from ' + provider + ' and runs its Scratch block', async ({page, context}) => {
        test.skip(!reference, 'Set the published Template reference for this provider');
        // Exercise an independent distribution, even if these same bytes are known to the Plus catalog.
        await context.route(catalogURL, route => route.fulfill({
            json: {schemaVersion: 1, extensions: []}, headers: {'access-control-allow-origin': '*'}
        }));
        await page.goto('editor.html?lang=ja');
        await page.waitForFunction(() => Boolean(vm.runtime.getTargetForStage()));
        await openExtensionLibrary(page);
        await page.getByRole('button', {name: 'TurboWarp Plus', exact: true}).click();
        const section = page.getByRole('region', {name: '公開済みの拡張機能'});
        await section.getByRole('textbox', {name: 'npm パッケージまたは GitHub Release'}).fill(reference);
        await section.getByRole('button', {name: '確認', exact: true}).click();
        await expect(section.getByText('TurboWarp-Example-Extension', {exact: true})).toBeVisible();
        await expect.poll(() => page.evaluate(id => vm.extensionManager.isExtensionLoaded(id), extensionId)).toBe(false);

        await section.getByRole('button', {name: '公開拡張を追加'}).click();
        const permission = page.getByTestId('tw-plus-permission');
        await expect(permission).toBeVisible();
        await permission.getByTestId('tw-plus-allow').click();
        await expect(section).toHaveCount(0);
        await expect(permission).toHaveCount(0);
        await expect.poll(() => page.evaluate(id => vm.extensionManager.isExtensionLoaded(id), extensionId)).toBe(true);
        await expect(page.getByTestId('tw-plus-sandbox-frame')).toHaveCount(1);
        const saved = await page.evaluate(() => JSON.parse(vm.toJSON()).turboWarpPlus.extensions[0]);
        expect(saved).toMatchObject({id: extensionId, execution: 'sandboxed', source: {type: 'embedded-file'}});
        expect(saved.version).toBe(reference.match(/\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/u)?.[0]);
        if (provider === 'GitHub Release') expect(new URL(saved.source.url).hostname).toBe('raw.githubusercontent.com');
        else expect(saved.source.url).toBeUndefined();

        await page.evaluate(id => {
            const target = vm.runtime.getTargetForStage();
            target.createVariable('web-result', 'web-result', '', false);
            const add = (id, details) => target.blocks.createBlock({
                id, next: null, parent: null, inputs: {}, fields: {}, topLevel: false, shadow: false, ...details
            });
            add('web-result-text', {opcode: 'text', parent: 'web-greeting', shadow: true,
                fields: {TEXT: {name: 'TEXT', value: 'Scratch'}}});
            add('web-greeting', {opcode: id + '_hello', parent: 'web-set-result',
                inputs: {NAME: {name: 'NAME', block: 'web-result-text', shadow: 'web-result-text'}}});
            add('web-set-result', {opcode: 'data_setvariableto', parent: 'web-run',
                fields: {VARIABLE: {name: 'VARIABLE', id: 'web-result', value: 'web-result', variableType: ''}},
                inputs: {VALUE: {name: 'VALUE', block: 'web-greeting', shadow: null}}});
            add('web-run', {opcode: 'event_whenflagclicked', next: 'web-set-result', topLevel: true, x: 40, y: 40});
            vm.greenFlag();
        }, extensionId);
        await expect.poll(() => page.evaluate(() => vm.runtime.getTargetForStage().variables['web-result'].value))
            .toBe('Hello, Scratch!');
    });
}
