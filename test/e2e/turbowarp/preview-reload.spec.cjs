const {createHash} = require('node:crypto');
const {test, expect} = require('./fixtures.cjs');

const sb3 = 'https://github.com/kubohiroya/turbowarp-kamishibai-app/releases/download/v4.0.0-rc.34/kamishibai-4.0.0-rc.34.sb3';
const digest = '819607acffa978cee98096809f04de624fabec969cf09903cc75b44107595631';
const buttonId = 'dsl4-preview-reload-status-button';
const dialogId = 'dsl4-preview-reload-status-dialog';

async function assertExposed(page) {
    const geometry = await page.locator(`#${buttonId}`).evaluate(button => {
        const rect = button.getBoundingClientRect();
        const points = [[1,1],[rect.width - 1,1],[1,rect.height - 1],
            [rect.width - 1,rect.height - 1],[rect.width / 2,rect.height / 2]];
        return {rect:rect.toJSON(),width:innerWidth,height:innerHeight,
            exposed:points.every(([x,y]) => button.contains(document.elementFromPoint(rect.x + x,rect.y + y))),
            toolbars:[...document.querySelectorAll('[class*="menu-bar-position_"], [class*="stage-menu-wrapper_"], button[data-dsl4-title-action=close]')]
                .map(element => element.getBoundingClientRect().toJSON()).filter(r => r.width && r.height)};
    });
    expect(geometry.exposed, JSON.stringify(geometry)).toBe(true);
    expect(geometry.rect.x).toBeGreaterThanOrEqual(5);
    expect(geometry.rect.y).toBeGreaterThanOrEqual(5);
    expect(geometry.rect.right).toBeLessThanOrEqual(geometry.width - 5);
    expect(geometry.rect.bottom).toBeLessThanOrEqual(geometry.height - 5);
    for (const bar of geometry.toolbars) {
        const overlaps = geometry.rect.x < bar.right && geometry.rect.right > bar.x &&
            geometry.rect.y < bar.bottom && geometry.rect.bottom > bar.y;
        expect(overlaps, JSON.stringify({geometry,bar})).toBe(false);
    }
    return geometry;
}

async function checkReloadControls(page, capture = async () => {}) {
    const button = page.locator(`#${buttonId}`);
    const dialog = page.locator(`#${dialogId}`);
    await expect(button).toBeVisible();
    for (const height of [800,600]) {
        await page.setViewportSize({width:1280,height});
        await expect.poll(() => assertExposed(page)).toBeTruthy();
        await capture(`button-${height}`);
    }
    await button.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading',{name:'Reload status and preferences'})).toBeInViewport();
    await capture('settings');
    for (const anchor of ['top-left','top-center','top-right','bottom-right']) {
        await dialog.locator(`[data-reload-anchor="${anchor}"]`).click();
        await expect(button).toHaveAttribute('data-preferred-anchor',anchor);
        expect(await page.evaluate(() => localStorage.getItem('dsl4.preview.reload.anchor.v1'))).toBe(anchor);
        await dialog.locator('#dsl4-preview-reload-dialog-close').click();
        await expect(dialog).toBeHidden();
        await assertExposed(page);
        await button.click();
    }
    await dialog.locator('#dsl4-preview-reload-anchor-reset').click();
    await dialog.locator('#dsl4-preview-reload-dialog-close').click();
    await expect(button).toHaveAttribute('data-preferred-anchor','top-right');
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();
    await page.getByTitle('全画面表示',{exact:true}).click();
    await expect(page.locator('[class*="stage-header-wrapper-overlay_"]')).toBeVisible();
    await expect.poll(() => assertExposed(page)).toBeTruthy();
    await capture('fullscreen');
    await button.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading',{name:'Reload status and preferences'})).toBeInViewport();
    await dialog.locator('#dsl4-preview-reload-dialog-close').click();
    await page.getByTitle('全画面表示',{exact:true}).click();
    await expect(page.locator('[class*="stage-header-wrapper-overlay_"]')).toHaveCount(0);
    await expect.poll(() => assertExposed(page)).toBeTruthy();
    await capture('restored');
}

test('published rc.34 reload controls avoid host toolbars and remain operable', async ({page,baseURL,evidence}, testInfo) => {
    test.setTimeout(120_000);
    evidence.stage('rc34-reload-placement');
    const consoleErrors = [];
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    const release = await page.request.get(sb3);
    expect(release.ok()).toBeTruthy();
    const releaseBytes = await release.body();
    expect(createHash('sha256').update(releaseBytes).digest('hex')).toBe(digest);
    // Deliver the unchanged release bytes through the host's native project_url loader.
    // Keep this immutable-version regression independent of the rolling Pages download mirror.
    const loadURL = new URL('rc34-reload-fixture.sb3',baseURL).href;
    await page.route(loadURL, route => route.fulfill({body:releaseBytes,contentType:'application/octet-stream'}));
    const target = new URL('editor.html',baseURL);
    target.search = new URLSearchParams({lang:'ja',project_url:loadURL});
    const download = page.waitForResponse(response => response.url() === loadURL);
    await page.goto(target.href);
    const response = await download;
    expect(response.ok()).toBeTruthy();
    const bytes = await response.body();
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(digest);
    await testInfo.attach('rc34-artifact.json',{body:JSON.stringify({url:sb3,loadURL,method:'SHA-verified release bytes via native project_url loader',size:bytes.length,sha256:digest}),
        contentType:'application/json'});
    const security = page.locator('.twextsec-modal');
    await expect(security).toBeVisible();
    await security.getByRole('radio',{name:'Kamishibai DSL 4.0 Runtime: サンドボックスなし',exact:true}).check();
    await security.getByRole('button',{name:'OK',exact:true}).click();
    await expect(security).toHaveCount(0);
    await page.locator('img[class*=green-flag_green-flag]').click();
    await expect(page.locator('button[data-dsl4-title-action=close]')).toBeVisible();
    await checkReloadControls(page, async label => {
        const file = testInfo.outputPath(`${label}.png`);
        await page.screenshot({path:file});
        await testInfo.attach(label,{path:file,contentType:'image/png'});
    });
    await expect(page.locator('button[data-dsl4-title-action=close]')).toBeVisible();
    await page.locator('button[data-dsl4-title-action=close]').click();
    await expect(page.locator('[data-dsl4-application-menu]')).toBeVisible();
    expect(consoleErrors).toEqual([]);
});

module.exports = {assertExposed,checkReloadControls};
