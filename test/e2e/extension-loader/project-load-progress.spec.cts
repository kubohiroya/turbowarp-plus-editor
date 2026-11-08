const {devices} = require('@playwright/test');
const {test, expect} = require('./fixtures.cts');
const {reopenSB3} = require('./catalog.cts');
const {project} = require('./project.cts');

test.use({userAgent: devices['Pixel 7'].userAgent});

for (const cancel of [false, true]) {
    test(`local SB3 shows timed progress and clears it after ${cancel ? 'cancel' : 'completion'}`, async ({page}) => {
        await page.goto('editor.html?lang=ja');
        await page.waitForFunction(() => globalThis.vm?.runtime?.targets?.length > 0);
        await page.evaluate(() => {
            // Pause at the VM boundary so the real file-open flow can be inspected before it continues.
            const deserialize = vm.deserializeProject;
            vm.deserializeProject = function (...args) {
                this.deserializeProject = deserialize;
                return new Promise(resolve => {
                    window.addEventListener('test-resume-project-load', () => resolve(deserialize.apply(this, args)), {once: true});
                });
            };
        });
        await reopenSB3(page, await project(), 'load-progress.sb3');

        const progress = page.locator('[data-project-load-progress]');
        const current = progress.getByRole('status');
        const history = progress.locator('[data-project-load-history]');
        await expect(current).toHaveText('プロジェクトを解析中…');
        await expect(history).toBeHidden();
        await progress.hover();
        await expect(history).toBeVisible();
        const phases = await history.locator('li').evaluateAll(rows => rows.map(row => row.dataset.phase));
        expect(phases[0]).toBe('opening');
        expect(phases.slice(1).sort()).toEqual(['archive', 'payloads']);
        const times = await history.locator('time').evaluateAll(elements =>
            elements.map(element => ({label: element.textContent, time: Date.parse(element.dateTime)})));
        for (let i = 0; i < times.length; i++) {
            expect(times[i].label).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/u);
            if (i > 0) expect(times[i].time).toBeGreaterThanOrEqual(times[i - 1].time);
        }
        await expect(history.locator('li').first()).toContainText('+0.00 秒');
        await page.mouse.move(0, 0);
        await expect(history).toBeHidden();
        await progress.focus();
        await expect(history).toBeVisible();
        await progress.blur();

        await page.evaluate(() => window.dispatchEvent(new Event('test-resume-project-load')));
        const review = page.getByRole('dialog').filter({has: page.locator('.twextsec-review')});
        await expect(review).toBeVisible();
        await expect(progress.locator('[data-phase="approval"]').first()).toHaveText('ユーザーの確認待ち…');
        if (cancel) {
            await review.getByRole('button', {name: 'キャンセル', exact: true}).click();
        } else {
            await review.locator('input[name="execution-plusfixture"][value="unsandboxed"]').check();
            await review.getByRole('button', {name: 'OK', exact: true}).click();
            await expect.poll(() => page.evaluate(() => vm.runtime.__plusFixtureStarted)).toBe(1);
        }
        await expect(progress).toHaveCount(0);
    });
}
