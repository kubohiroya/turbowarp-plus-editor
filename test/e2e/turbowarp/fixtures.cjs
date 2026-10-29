const os = require('node:os');
const {test: base, expect} = require('@playwright/test');

const buildInfo = async (request, baseURL, onRead) => {
    const url = new URL('build-info.json', baseURL);
    url.searchParams.set('e2e_time', String(Date.now()));
    const response = await request.get(url.href, {
        headers: {'Cache-Control': 'no-cache'}
    });
    expect(response.ok(), 'build-info.json must identify the tested deployment').toBeTruthy();
    const info = await response.json();
    if (onRead) onRead(info);
    expect(info.revision).toMatch(/^[a-f0-9]{40}$/);
    expect(info.coreRevision).toMatch(/^[a-f0-9]{40}$/);
    expect(info.siteRevision).toMatch(/^[a-f0-9]{40}$/);
    expect(info.siteRepository).toBe('https://github.com/kubohiroya/turbowarp-plus-editor');
    expect(info.securityPackage).toBe('@kubohiroya/turbowarp-extension-security-dialog');
    if (process.env.E2E_EXPECT_SECURITY_VERSION) expect(info.securityVersion).toBe(process.env.E2E_EXPECT_SECURITY_VERSION);
    if (process.env.E2E_EXPECT_GUI_REVISION) expect(info.revision).toBe(process.env.E2E_EXPECT_GUI_REVISION);
    if (process.env.E2E_EXPECT_CORE_REVISION) expect(info.coreRevision).toBe(process.env.E2E_EXPECT_CORE_REVISION);
    if (process.env.E2E_EXPECT_SITE_REVISION) expect(info.siteRevision).toBe(process.env.E2E_EXPECT_SITE_REVISION);
    return info;
};

const test = base.extend({
    evidence: [async ({page, request, baseURL, browser}, use, testInfo) => {
        const logs = [];
        const native = testInfo.project.name === 'chrome-macos-native';
        const theme = testInfo.annotations.find(annotation => annotation.type === 'theme')?.description;
        const execution = {
            ...(theme ? {theme, scenario: 'invalid-theme'} : {}),
            baseURL,
            browser: browser.version(),
            platform: `${process.platform} ${os.release()}`,
            project: testInfo.project.name,
            nativeOSPicker: 'not-run',
            stage: 'deployment-start',
            expectedGUI: process.env.E2E_EXPECT_GUI_REVISION || null,
            expectedCore: process.env.E2E_EXPECT_CORE_REVISION || null,
            configuredReloadRoute: native ? 'native-macos-open' :
                (testInfo.project.name === 'chromium-file-input' ? 'file-input/filechooser' : 'project_url'),
            userAgent: testInfo.project.use.userAgent || 'browser-default'
        };
        const observe = observedPage => {
            observedPage.on('console', message => {
                if (message.type() === 'error') logs.push({type: 'console', message: message.text()});
            });
            observedPage.on('pageerror', error => logs.push({type: 'pageerror', message: error.message}));
            observedPage.on('requestfailed', failedRequest => logs.push({
                type: 'requestfailed', url: failedRequest.url(), failure: failedRequest.failure()
            }));
            observedPage.on('response', response => {
                if (response.status() >= 400) logs.push({type: 'http', url: response.url(), status: response.status()});
            });
        };
        observe(page);
        try {
            execution.before = await buildInfo(request, baseURL, info => {
                execution.before = info;
            });
            await use({observe,
                deployment: () => ({expectedGUI: execution.expectedGUI,
                    expectedCore: execution.expectedCore,
                    observed: execution.before,
                    browser: execution.browser,
                    platform: execution.platform}),
                currentStage: () => execution.stage,
                stage: value => {
                    execution.stage = value;
                },
                nativeSelected: () => {
                    execution.nativeOSPicker = 'selected-file';
                },
                nativePassed: () => {
                    execution.nativeOSPicker = 'passed';
                }});
            try {
                execution.after = await buildInfo(request, baseURL, info => {
                    execution.after = info;
                });
                const message = 'Deployment changed during the test; do not combine results from different builds';
                expect(execution.after, message)
                    .toEqual(execution.before);
            } catch (error) {
                execution.stage = 'deployment-end';
                execution.failureCategory = 'deployment-or-environment';
                throw error;
            }
            if (logs.some(log => log.type === 'pageerror')) execution.failureCategory = 'application-error';
            expect(logs.filter(log => log.type === 'pageerror'), 'Uncaught application errors').toEqual([]);
        } catch (error) {
            execution.failureCategory = execution.failureCategory ||
                (execution.stage.startsWith('deployment') ? 'deployment-or-environment' : 'assertion-or-environment');
            throw error;
        } finally {
            const passed = testInfo.status === 'passed';
            execution.failureCategory = execution.failureCategory || (passed ? null :
                (execution.stage.startsWith('deployment') ? 'deployment-or-environment' : 'assertion-or-environment'));
            await testInfo.attach('execution.json', {body: JSON.stringify(execution, null, 2),
                contentType: 'application/json'});
            await testInfo.attach('browser-errors.json', {
                body: JSON.stringify(logs, null, 2), contentType: 'application/json'
            });
        }
    }, {auto: true}]
});

// The accessible title identifies the block and changes with its appearance metadata.
const editorDialog = page => page.getByRole('dialog').filter({has: page.locator('[data-block-editor-save]')});
const approveProjectExtensions = async (page, sources, locale = 'ja') => {
    const security = page.locator('.twextsec-modal');
    await expect(security).toBeVisible();
    const rows = security.locator('article');
    await expect(rows).toHaveCount(sources.length);
    await expect(security.locator('textarea')).toHaveCount(0);
    await expect(security.getByRole('button', {name:locale === 'ja' ? '詳細' : 'Details',exact:true})).toHaveCount(0);
    await security.getByRole('button', {name:locale === 'ja' ? 'サンドボックスなし' : 'Without sandbox',exact:true}).click();
    await security.getByRole('button', {name:'OK',exact:true}).click();
    await expect(security).toHaveCount(0);
    // Verify the actual loaded sources through project serialization after approval.
    await expect.poll(() => page.evaluate(async () => {
        const urls = Object.values(JSON.parse(vm.toJSON()).extensionURLs || {});
        return (await Promise.all(urls.map(async url => (await fetch(url)).text()))).sort();
    })).toEqual([...sources].sort());
};
module.exports = {test, expect, editorDialog, approveProjectExtensions};
