const path = require('node:path');
const {defineConfig, devices} = require('@playwright/test');
const root = path.resolve(__dirname, '../../..');
const native = process.env.E2E_NATIVE === '1';
const fixedInputs = process.env.E2E_FIXED_INPUTS === '1';
if (native && process.platform !== 'darwin') throw new Error('Native picker tests require macOS.');

const port = process.env.E2E_PORT || '8732';
const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${port}${process.env.E2E_PATH_PREFIX || '/turbowarp-plus-editor/'}`;
const parsed = new URL(baseURL);
if (process.env.E2E_BASE_URL && !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) &&
    (!/^[a-f0-9]{40}$/.test(process.env.E2E_EXPECT_GUI_REVISION || '') ||
     !/^[a-f0-9]{40}$/.test(process.env.E2E_EXPECT_CORE_REVISION || '') ||
     !/^[a-f0-9]{40}$/.test(process.env.E2E_EXPECT_SITE_REVISION || '') ||
     !/^\d+\.\d+\.\d+/.test(process.env.E2E_EXPECT_SECURITY_VERSION || ''))) {
    throw new Error('Published TurboWarp-Plus-Editor checks require full GUI/core/site revisions and a security version.');
}
if (!['http:', 'https:'].includes(parsed.protocol) || !baseURL.endsWith('/') || parsed.search || parsed.hash) {
    throw new Error('E2E_BASE_URL must be an HTTP(S) application root ending with /.');
}

module.exports = defineConfig({
    testDir: __dirname,
    testMatch: '*.spec.cts',
    outputDir: path.join(root, 'test-results/block-editor'),
    timeout: native ? 120_000 : 90_000,
    expect: {timeout: 15_000},
    workers: 1,
    retries: 0,
    forbidOnly: Boolean(process.env.CI),
    reporter: [
        [path.join(__dirname, 'reporter.cts')],
        ['list'],
        ['html', {outputFolder: path.join(root, 'playwright-report/block-editor'), open: 'never'}],
        ['json', {outputFile: path.join(root, 'test-results/block-editor/results.json')}]
    ],
    use: {
        baseURL,
        viewport: {width: 1280, height: 900},
        locale: 'ja-JP',
        acceptDownloads: true,
        actionTimeout: 15_000,
        launchOptions: {timeout: 30_000},
        headless: !native && process.env.E2E_HEADED !== '1',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    },
    projects: native ? [{name: 'chrome-macos-native',
        testMatch: 'editor.spec.cts',
        use: {browserName: 'chromium', channel: 'chrome'}}] : [
        {name: 'chromium-file-input',
            testMatch: 'editor.spec.cts',
            use: {
                browserName: 'chromium', userAgent: devices['Pixel 7'].userAgent
            }},
        {name: 'chromium-project-url',
            testMatch: fixedInputs ? '*.spec.cts' : ['editor.spec.cts', 'invalid-theme.spec.cts', 'extension-security.spec.cts', 'landing.spec.cts'],
            use: {browserName: 'chromium'}}
    ],
    ...(process.env.E2E_BASE_URL ? {} : {webServer: {
        command: 'node test/e2e/turbowarp/serve.cts',
        cwd: root,
        url: `${baseURL}build-info.json`,
        timeout: 15_000,
        reuseExistingServer: false,
        env: {E2E_PORT: port, E2E_PATH_PREFIX: parsed.pathname}
    }})
});
