const path = require('node:path');
const {defineConfig} = require('@playwright/test');
const root = path.resolve(__dirname, '../../..');
const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:8744/turbowarp-plus-editor/';
const target = new URL(baseURL);
if (!['http:', 'https:'].includes(target.protocol) || !baseURL.endsWith('/') || target.search || target.hash) {
    throw new Error('E2E_BASE_URL must be an HTTP(S) application root ending with /.');
}
if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) {
    for (const name of ['E2E_EXPECT_GUI_REVISION', 'E2E_EXPECT_CORE_REVISION', 'E2E_EXPECT_SITE_REVISION']) {
        if (!/^[a-f0-9]{40}$/.test(process.env[name] || '')) throw new Error(`Published checks require ${name}`);
    }
}
module.exports = defineConfig({
    testDir: __dirname,
    testMatch: '*.spec.cts',
    timeout: 90_000,
    expect: {timeout: 20_000},
    workers: 1,
    retries: 0,
    forbidOnly: Boolean(process.env.CI),
    outputDir: path.join(root, 'test-results/extension-loader'),
    reporter: [['list'], ['json', {outputFile: path.join(root, 'test-results/extension-loader/results.json')}]],
    use: {baseURL,
        headless: true, ignoreHTTPSErrors: !process.env.E2E_BASE_URL,
        viewport: {width: 1280, height: 900}, locale: 'ja-JP', trace: 'retain-on-failure'},
    ...(process.env.E2E_BASE_URL ? {} : {webServer: {command: 'node test/e2e/turbowarp/serve.cts', cwd: root,
        url: 'http://127.0.0.1:8744/turbowarp-plus-editor/build-info.json', reuseExistingServer: false,
        env: {E2E_PORT: '8744', E2E_PATH_PREFIX: '/turbowarp-plus-editor/'}}})
});
