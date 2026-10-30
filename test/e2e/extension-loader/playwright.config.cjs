const path = require('node:path');
const {defineConfig} = require('@playwright/test');
const root = path.resolve(__dirname, '../../..');
module.exports = defineConfig({
    testDir: __dirname,
    testMatch: '*.spec.cjs',
    timeout: 90_000,
    expect: {timeout: 20_000},
    workers: 1,
    retries: 0,
    forbidOnly: Boolean(process.env.CI),
    outputDir: path.join(root, 'test-results/extension-loader'),
    reporter: [['list'], ['json', {outputFile: path.join(root, 'test-results/extension-loader/results.json')}]],
    use: {baseURL: 'http://127.0.0.1:8744/turbowarp-plus-editor/',
        headless: true, ignoreHTTPSErrors: true, viewport: {width: 1280, height: 900}, locale: 'ja-JP', trace: 'retain-on-failure'},
    webServer: {command: 'node test/e2e/turbowarp/serve.cjs', cwd: root,
        url: 'http://127.0.0.1:8744/turbowarp-plus-editor/build-info.json', reuseExistingServer: false,
        env: {E2E_PORT: '8744', E2E_PATH_PREFIX: '/turbowarp-plus-editor/'}}
});
