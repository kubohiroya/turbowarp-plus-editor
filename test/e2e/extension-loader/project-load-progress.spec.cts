const {devices} = require('@playwright/test');
const {test, expect, review: reviewDialog, individualReview, executionChoice, completeReview} = require('./fixtures.cts');
const {reopenSB3} = require('./catalog.cts');
const {project} = require('./project.cts');

test.use({userAgent: devices['Pixel 7'].userAgent});

for (const cancel of [false, true]) {
    test(`local SB3 shows timed progress and clears it after ${cancel ? 'cancel' : 'completion'}`, async ({page, context}) => {
        await page.goto('editor.html?lang=ja');
        await page.waitForFunction(() => globalThis.vm?.runtime?.targets?.length > 0);
        const original = page;
        const before = await original.evaluate(() => vm.toJSON());
        await context.addInitScript(() => {
            const arrayBuffer = File.prototype.arrayBuffer;
            File.prototype.arrayBuffer = function (...args) {
                // Pause only the selected file in its receiving tab, after that tab's initial project is ready.
                if (new URL(location.href).searchParams.has('twPlusOpenTab') && this.name === 'load-progress.sb3') {
                    File.prototype.arrayBuffer = arrayBuffer;
                    const deserialize = vm.deserializeProject;
                    vm.deserializeProject = function (...input) {
                        this.deserializeProject = deserialize;
                        return new Promise(resolve => {
                            window.addEventListener('test-resume-project-load', () =>
                                resolve(deserialize.apply(this, input)), {once: true});
                        });
                    };
                }
                return Reflect.apply(arrayBuffer, this, args);
            };
        });
        page = await reopenSB3(original, await project(), 'load-progress.sb3');

        const progress = page.locator('[data-project-load-progress]');
        const current = progress.getByRole('status');
        await expect(current).toHaveText('プロジェクトを解析中…');
        await page.evaluate(() => window.dispatchEvent(new Event('test-resume-project-load')));
        const review = reviewDialog(page);
        await expect(review).toBeVisible();
        await expect(progress.locator('[data-phase="approval"]').first()).toHaveText('ユーザーの確認待ち…');
        if (cancel) {
            const closed = page.waitForEvent('close');
            await review.getByTestId('twextsec-cancel').click();
            await closed;
        } else {
            await individualReview(page);
            await executionChoice(review.locator('.twextsec-row[data-key="plusfixture"]'), 'unsandboxed').click();
            await completeReview(page);
            await expect.poll(() => page.evaluate(() => vm.runtime.__plusFixtureStarted)).toBe(1);
            await expect(progress).toHaveCount(0);
        }
        expect(await original.evaluate(() => vm.toJSON())).toBe(before);
        expect(await original.evaluate(() => vm.runtime.__plusFixtureStarted || 0)).toBe(0);
    });
}
