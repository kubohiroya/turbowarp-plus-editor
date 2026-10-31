const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {chromium} = require('playwright');
const {spawn} = require('node:child_process');
const {execFileSync} = require('node:child_process');
const Zip = require('@turbowarp/jszip');

const root = path.resolve(__dirname, '../../..');
const appPath = process.env.TW_PLUS_DESKTOP_APP || '/Applications/TurboWarp.app/Contents/MacOS/TurboWarp';
const output = path.join(root, '.host/issue-4-artifacts/desktop-result.json');
const runtimeHTML = process.env.TW_PLUS_DESKTOP_HTML || path.join(root, '.host/issue-4-artifacts/plus-offline.html');

async function main() {
    const profiles = path.join(root, '.host/desktop-issue4-profile');
    await fs.mkdir(profiles, {recursive: true});
    const profile = await fs.mkdtemp(path.join(profiles, 'run-'));
    // The application reads only this isolated profile; updates are disabled for the probe.
    await fs.writeFile(path.join(profile, 'tw_config.json'), JSON.stringify({v2: {updateChecker: 'never', locale: 'en'}}));
    const result: {profile: string; appPath: string; stock: Record<string, any>; packagedRuntime: Record<string, any>; assertions: string[]; [key: string]: any} = {profile, appPath, stock: {}, packagedRuntime: {}, assertions: []};
    let browser, child;
    try {
        const framework = path.resolve(appPath, '../../Frameworks/Electron Framework.framework/Electron Framework');
        const binary = await fs.readFile(framework);
        const sentinel = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');
        const at = binary.indexOf(sentinel);
        if (at >= 0) {
            const start = at + sentinel.length;
            result.electronFuses = {version: binary[start], count: binary[start + 1],
                nodeCLIInspectAllowed: binary[start + 2 + 3] === 49};
        }
        result.transport = 'Chromium CDP (packaged app disables the Node inspector required by _electron.launch)';
        const websocket = new Promise((resolve, reject) => {
            child = spawn(appPath, [`--user-data-dir=${profile}`, '--remote-debugging-port=0',
                '--no-first-run', '--use-mock-keychain', '--password-store=basic'], {stdio: ['ignore', 'ignore', 'pipe']});
            let stderr = '';
            const timer = setTimeout(() => reject(new Error('Desktop CDP endpoint was not available')), 30000);
            child.on('error', (error: Error & {code?: string; status?: number; errors?: Error[]}) => { clearTimeout(timer); reject(error); });
            child.on('exit', code => { clearTimeout(timer); reject(new Error(`Desktop exited before CDP attachment: ${code}`)); });
            child.stderr.on('data', chunk => {
                stderr = (stderr + chunk.toString()).slice(-16000);
                const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
                if (match) { clearTimeout(timer); resolve(match[1]); }
            });
        });
        browser = await chromium.connectOverCDP(await websocket);
        console.log('Desktop launched with an isolated profile');
        const context = browser.contexts()[0];
        const page = context.pages()[0] || await context.waitForEvent('page', {timeout: 30000});
        const cdp = await browser.newBrowserCDPSession();
        const protocolVersion = await cdp.send('Browser.getVersion');
        const appBundle = path.resolve(appPath, '../..');
        const desktop = execFileSync('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', path.join(appBundle, 'Info.plist')], {encoding: 'utf8'}).trim();
        result.versions = {desktop, chromium: protocolVersion.product, userAgent: protocolVersion.userAgent};
        result.versions.electron = (protocolVersion.userAgent.match(/Electron\/([\d.]+)/) || [])[1] || null;
        result.profileEvidence = {directory: profile, commandLineSwitch: '--user-data-dir',
            source: 'https://github.com/electron/electron/blob/main/shell/app/electron_main_delegate.cc#L271'};
        result.assertions.push('dedicated-profile');
        console.log('Desktop profile isolation verified');
        await page.waitForFunction(() => window.vm && window.vm.runtime && window.vm.runtime.targets.length,
            null, {timeout: 45000});
        result.stock.url = page.url();
        result.stock.runtime = await page.evaluate(() => ({platform: window.vm.runtime.platform,
            serializedVM: JSON.parse(window.vm.toJSON()).meta.vm,
            plusBootstrapAvailable: Boolean(window.TurboWarpPlusLoader || window.TurboWarpPlusExtensionHost)}));
        const original = await page.evaluate(async () => Array.from(await window.vm.saveProjectSb3('uint8array')));
        const zip = await Zip.loadAsync(new Uint8Array(original));
        const project = JSON.parse(await zip.file('project.json').async('string'));
        const code = 'globalThis.__issue4DesktopExecution=true;';
        const sha256 = createHash('sha256').update(code).digest('hex');
        project.turboWarpPlus = {schemaVersion: 1, extensions: [{id: 'desktopfixture', execution: 'unsandboxed',
            source: {type: 'embedded', path: 'extensions/desktopfixture.js'}, sha256}]};
        project.plusManifestSentinel = 'issue-4-stock-desktop';
        zip.file('project.json', JSON.stringify(project));
        zip.file('extensions/desktopfixture.js', code);
        const input = await zip.generateAsync({type: 'uint8array'});
        await page.evaluate(async bytes => window.vm.loadProject(new Uint8Array(bytes)), Array.from(input));
        const saved = await page.evaluate(async () => ({bytes: Array.from(await window.vm.saveProjectSb3('uint8array')),
            executed: globalThis.__issue4DesktopExecution === true}));
        const reopened = await Zip.loadAsync(new Uint8Array(saved.bytes));
        const savedProject = JSON.parse(await reopened.file('project.json').async('string'));
        result.stock.unknownFieldRetained = savedProject.plusManifestSentinel === project.plusManifestSentinel;
        result.stock.manifestRetained = Boolean(savedProject.turboWarpPlus);
        result.stock.embeddedEntryRetained = Boolean(reopened.file('extensions/desktopfixture.js'));
        result.stock.codeExecuted = saved.executed;
        assert.equal(saved.executed, false, 'A project declaration cannot bootstrap privileged code');
        assert.equal(result.stock.runtime.plusBootstrapAvailable, false);
        result.assertions.push('stock-no-privileged-auto-execution');
        result.stock.status = 'passed';
        console.log('Stock Desktop round-trip and execution boundary verified');
        await fs.writeFile(output, JSON.stringify(result, null, 2));
        await page.screenshot({path: path.join(root, '.host/issue-4-artifacts/desktop-stock.png')});

        try {
            await fs.access(runtimeHTML);
            // This disposable test window has its own profile and no user project.
            // Navigate to the explicit trusted artifact without changing the signed application.
            const runtimePage = page;
            result.packagedRuntime.remoteRequests = [];
            runtimePage.on('request', request => {
                if (/^https?:/.test(request.url())) result.packagedRuntime.remoteRequests.push(request.url());
            });
            await runtimePage.goto(require('node:url').pathToFileURL(runtimeHTML).href,
                {waitUntil: 'domcontentloaded', timeout: 15000});
            await runtimePage.locator('[data-testid="tw-plus-permission"]').waitFor({timeout: 20000});
            result.packagedRuntime.configuration = 'Disposable isolated Desktop window navigated to bundled HTML; not stock Desktop Editor integration';
            result.packagedRuntime.beforeApproval = await runtimePage.evaluate(() => {
                const vm = globalThis.vm || (globalThis.scaffolding && globalThis.scaffolding.vm);
                return {registered: vm ? vm.extensionManager._loadedExtensions.size : null};
            });
            assert.equal(result.packagedRuntime.beforeApproval.registered, 0);
            await runtimePage.locator('[data-testid="tw-plus-allow"]').click();
            await runtimePage.waitForFunction(() => {
                const vm = globalThis.vm || (globalThis.scaffolding && globalThis.scaffolding.vm);
                return vm && vm.extensionManager._loadedExtensions.size > 0;
            }, null, {timeout: 45000});
            result.packagedRuntime.afterApproval = await runtimePage.evaluate(() => {
                const vm = globalThis.vm || (globalThis.scaffolding && globalThis.scaffolding.vm);
                return {ids: [...vm.extensionManager._loadedExtensions.keys()],
                    executions: vm.__plusPackageExecutions, primitiveType: typeof vm.runtime._primitives.sample_value,
                    primitiveKeys: Object.keys(vm.runtime._primitives).filter(key => key.startsWith('sample_')),
                    value: typeof vm.runtime._primitives.sample_value === 'function' ? vm.runtime._primitives.sample_value({}, {}) : null,
                    diagnostics: document.querySelector<HTMLElement>('[data-testid="tw-plus-extension-status"]')?.textContent};
            });
            assert.equal(result.packagedRuntime.afterApproval.executions, 1);
            assert.equal(result.packagedRuntime.afterApproval.value, 42);
            assert.deepEqual(result.packagedRuntime.remoteRequests, []);
            result.assertions.push('packaged-electron-explicit-consent');
            result.packagedRuntime.status = 'passed';
            await runtimePage.screenshot({path: path.join(root, '.host/issue-4-artifacts/desktop-packaged.png')});
            await runtimePage.close();
        } catch (error) {
            result.packagedRuntime.status = 'failed';
            result.packagedRuntime.error = error.message;
        }
        result.status = result.packagedRuntime.status === 'passed' ? 'passed' : 'partial';
        if (result.status !== 'passed') process.exitCode = 1;
    } catch (error) {
        result.status = 'failed';
        result.error = error.message;
        process.exitCode = 1;
    } finally {
        await fs.mkdir(path.dirname(output), {recursive: true});
        await fs.writeFile(output, JSON.stringify(result, null, 2));
        console.log(JSON.stringify(result, null, 2));
        if (browser) await browser.close().catch(() => {});
        if (child && child.exitCode === null) child.kill('SIGTERM');
    }
}
main().catch((error: Error & {code?: string; status?: number; errors?: Error[]}) => {console.error(error); process.exitCode = 1;});
