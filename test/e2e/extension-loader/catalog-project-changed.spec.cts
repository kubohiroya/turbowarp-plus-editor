const {test, expect, provideReviewMetadata} = require('./fixtures.cts');
const {fixture, installFixtures, openCatalog, row, form, selection} = require('./catalog.cts');

const extension = fixture('catalogprojectprobe', 'embedded-file');
const projectState = page => page.evaluate(() => {
    const project = JSON.parse(vm.toJSON());
    return {
        targets: project.targets.map(({name, blocks, variables}) => ({name, blocks, variables})),
        monitors: project.monitors,
        extensions: (project.turboWarpPlus?.extensions || []).map(({id}) => id)
    };
});

async function openEditor(page) {
    await page.goto('editor.html?lang=en&twPlusStandardLayout=1');
    await page.waitForFunction(() => vm?.editingTarget && globalThis.ScratchBlocks?.getMainWorkspace());
}

async function selectExtension(page) {
    await openCatalog(page, 1, 'File', 'Add Extension');
    await row(page, extension).getByRole('checkbox').check();
    await form(page, extension).check();
}

const add = page => selection(page).getByRole('button', {name: 'Add', exact: true}).click();

for (const hasBlocks of [false, true]) {
    test(`adding a catalog extension preserves a project ${hasBlocks ? 'with' : 'without'} blocks`, async ({page, context}) => {
        await installFixtures(context, [extension]);
        await openEditor(page);
        if (hasBlocks) {
            await page.evaluate(() => {
                const id = 'catalogProbeVariable';
                const name = 'Catalog probe';
                const stage = vm.runtime.getTargetForStage();
                stage.createVariable(id, name, '');
                stage.variables[id].value = 27;
                const fields = {VARIABLE: {name: 'VARIABLE', id, value: name}};
                const monitors = vm.runtime.monitorBlocks;
                monitors.createBlock({id, opcode: 'data_variable', fields, inputs: {}, topLevel: true, shadow: false});
                monitors.changeBlock({id, element: 'checkbox', value: true});
                vm.emitWorkspaceUpdate();
            });
            await page.locator('.blocklyToolboxDiv .scratchCategoryId-motion:visible').first().click();
            const move = page.locator('.blocklyFlyout:visible .blocklyDraggable')
                .filter({has: page.getByText('move', {exact: true})}).first();
            await expect(move).toBeVisible();
            const from = await move.boundingBox();
            const workspace = await page.evaluate(() =>
                globalThis.ScratchBlocks.getMainWorkspace().getParentSvg().getBoundingClientRect().toJSON());
            await page.mouse.move(from.x + 12, from.y + 12);
            await page.mouse.down();
            await page.mouse.move(from.x + 12, from.y + 34, {steps: 4});
            await page.mouse.move(workspace.x + workspace.width * 0.65, workspace.y + 250, {steps: 16});
            await page.mouse.up();
            await expect.poll(() => page.evaluate(() => {
                const blocks = vm.editingTarget.blocks;
                return blocks.getScripts().map(id => blocks.getBlock(id).opcode);
            })).toContain('motion_movesteps');
        }
        const before = await projectState(page);
        if (hasBlocks) {
            expect(before.targets.flatMap(target => Object.values(target.variables))).toContainEqual(['Catalog probe', 27]);
            expect(before.monitors).toContainEqual(expect.objectContaining({
                opcode: 'data_variable', params: {VARIABLE: 'Catalog probe'}, visible: true
            }));
        }

        await selectExtension(page);
        await add(page);
        await expect(selection(page)).toHaveCount(0);
        expect(await projectState(page)).toEqual({...before, extensions: [extension.id]});
        expect(await page.evaluate(id => ({
            loaded: vm.extensionManager.isExtensionLoaded(id),
            runs: globalThis.__catalogAuthoringRuns?.[id]
        }), extension.id)).toEqual({loaded: true, runs: 1});
    });
}

for (const replace of [false, true]) {
    test(`catalog addition cancels after a concurrent project ${replace ? 'replacement' : 'edit'}`, async ({page, context}) => {
        await installFixtures(context, [extension]);
        await provideReviewMetadata(page, extension.url, extension.bytes.toString());
        // Hold the verified source fetch after the initial project snapshot has been taken.
        let releaseFetch: () => void;
        const fetchGate = new Promise<void>(resolve => {
            releaseFetch = resolve;
        });
        await context.route(extension.url, async route => {
            await fetchGate;
            await route.fallback();
        });
        await openEditor(page);
        await selectExtension(page);

        const newName = 'Keep this sprite name';
        try {
            await Promise.all([page.waitForRequest(extension.url, {timeout: 10_000}), add(page)]);
            await page.evaluate(async ({replace, newName}) => {
                if (replace) {
                    const project = JSON.parse(vm.toJSON());
                    project.targets.find(target => !target.isStage).name = newName;
                    await vm.loadProject(project);
                } else {
                    vm.renameSprite(vm.editingTarget.id, newName);
                }
            }, {replace, newName});
        } finally {
            releaseFetch();
        }

        const failure = selection(page).locator('.twextsec-failed');
        await expect.poll(async () => await selection(page).count() === 0 || await failure.isVisible()).toBe(true);
        if (await failure.isVisible()) await expect(failure).toContainText(/CANCELLED|PROJECT_CHANGED/);
        await expect(page.getByTestId('twextsec-wait')).toBeHidden();
        const project = await projectState(page);
        expect(project.targets.map(target => target.name)).toContain(newName);
        expect(project.extensions).not.toContain(extension.id);
        expect(await page.evaluate(id => vm.extensionManager.isExtensionLoaded(id), extension.id)).toBe(false);
    });
}
