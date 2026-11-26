import assert from 'node:assert/strict';
import {before, after, test} from 'node:test';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import JSZip from '@turbowarp/jszip';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const pins = createRequire(import.meta.url)('../scripts/site/locked-pins.cts').readPinsSync();

declare global {interface Window {__reviewFixtureStarted?: number; __originalStage?: unknown; __originalQuitCalls?: number;
    __originalSaveCalls?: number;}}

const base = process.env.E2E_SECURITY_PREVIEW_URL;
const {chromium, expect} = createRequire(process.env.TW_SECURITY_PLAYWRIGHT_PACKAGE ?? import.meta.url)('@playwright/test');
if (!base) throw new Error('Set E2E_SECURITY_PREVIEW_URL to the local security preview server');
let browser;
let archive: Buffer;
before(async () => {
    const manifest = await (await fetch(new URL('preview-manifest.json', base))).json();
    assert.equal(manifest.commit, pins.guiRevision);
    assert.equal(manifest.securityPreview.version, pins.securityVersion);
    assert.ok(['commit', 'working-tree'].includes(manifest.securityPreview.sourceState));
    assert.equal(typeof manifest.projectOpenTabsPreview.dirty, 'boolean');
    assert.match(manifest.projectOpenTabsPreview.entrySHA256, /^[a-f0-9]{64}$/);
    assert.match(manifest.projectOpenTabsPreview.entries['project-load-failure.js'], /^[a-f0-9]{64}$/);
    const info = await (await fetch(new URL('build-info.json', base))).json();
    assert.equal(info.siteRevision, manifest.hostCommit);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"></svg>';
    const id = createHash('md5').update(svg).digest('hex');
    const source = '// Name: Review fixture\n// Author: Fixture author\n' +
        'globalThis.__reviewFixtureStarted = (globalThis.__reviewFixtureStarted || 0) + 1;\n' +
        'Scratch.extensions.register({getInfo(){return {id:"reviewfixture",name:"Review fixture",blocks:[{opcode:"value",' +
        'blockType:Scratch.BlockType.REPORTER,text:"review fixture"}]};},value(){return 1;}});';
    const project = {targets: [{isStage: true, name: 'New stage', variables: {}, lists: {}, broadcasts: {}, comments: {},
        blocks: {fixture: {opcode: 'reviewfixture_value', next: null, parent: null, inputs: {}, fields: {}, shadow: false,
            topLevel: true, x: 40, y: 40}}, currentCostume: 0, costumes: [{name: 'Blank', assetId: id, dataFormat: 'svg', md5ext: `${id}.svg`,
            rotationCenterX: 240, rotationCenterY: 180}], sounds: [], volume: 100, layerOrder: 0, tempo: 60,
        videoTransparency: 50, videoState: 'off', textToSpeechLanguage: null}],
    extensions: ['reviewfixture'], extensionURLs: {reviewfixture: `data:text/javascript,${encodeURIComponent(source)}`},
    monitors: [], meta: {semver: '3.0.0'}};
    const zip = new JSZip(); zip.file('project.json', JSON.stringify(project)); zip.file(`${id}.svg`, svg);
    archive = await zip.generateAsync({type: 'nodebuffer'});
    browser = await chromium.launch({headless: true});
});
after(async () => {await browser?.close();});
const contextFor = async () => {
    const context = await browser.newContext({viewport: {width: 1280, height: 900}, locale: 'ja-JP'});
    await context.addInitScript(() => {delete window.showOpenFilePicker;});
    await context.route('https://kubohiroya.github.io/turbowarp-plus-packages/extensions-v1.json',
        route => route.fulfill({json: {schemaVersion: 1, extensions: []}}));
    return context;
};
const review = page => page.getByRole('dialog').filter({has: page.locator('.twextsec-review')});
const startupURL = () => new URL(`editor.html?${new URLSearchParams({lang: 'ja',
    project_url: `data:application/octet-stream;base64,${archive.toString('base64')}`})}`, base).href;

test('local source metadata supplies its declared banner and individual mode stays visibly selected and disabled', {timeout: 60000}, async () => {
    const context = await contextFor(); const page = await context.newPage();
    try {
        const fixture = new URL('local-security-preview/extension-security-preview.sb3', base).href;
        await page.goto(new URL(`editor.html?${new URLSearchParams({lang: 'ja', project_url: fixture})}`, base).href);
        const dialog = review(page);
        await expect(dialog).toBeVisible();
        const row = dialog.locator('.twextsec-row').filter({hasText: 'バナー表示の確認'});
        await expect(row).toHaveCount(1);
        await expect(row.locator('.twextsec-preview-fallback')).toHaveCount(0);
        await expect.poll(() => row.locator('.twextsec-preview').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
        await expect(row).toContainText('ローカル確認用サンプル');
        await expect(dialog.locator('.twextsec-row input, .twextsec-row button')).toHaveCount(0);
        const individual = dialog.getByTestId('twextsec-individual');
        await expect(individual).toBeEnabled();
        await expect(individual).toHaveAttribute('aria-pressed', 'false');
        await individual.click();
        await expect(dialog.getByTestId('twextsec-cancel')).toBeEnabled();
        await expect(dialog.getByTestId('twextsec-enable-all')).toBeEnabled();
        await page.screenshot({path: join(tmpdir(), 'tw-review-individual-banner.png')});
        await dialog.getByTestId('twextsec-cancel').click();
        const outcome = page.getByTestId('project-load-failure');
        await expect(outcome).toBeVisible();
        await outcome.getByRole('button', {name: '確認画面に戻る', exact: true}).click();
        await expect(review(page)).toBeVisible();
        await expect(review(page)).toHaveAccessibleName('確認: この作品は機能拡張を使います');
        assert.equal(new URL(page.url()).searchParams.get('project_url'), fixture);
        assert.equal(await page.evaluate(() => window.vm.extensionManager.isExtensionLoaded('previewbanner')), false);
    } finally {await context.close();}
});

test('refusing a project entered by navigation goes back to the previous page without running it', {timeout: 90000}, async () => {
    const context = await contextFor(); const page = await context.newPage();
    try {
        await page.goto(new URL('editor.html?lang=ja', base).href);
        await page.waitForFunction(() => window.ReduxStore?.getState().scratchGui.projectState.loadingState.startsWith('SHOWING_'));
        const previous = page.url();
        await page.goto(startupURL());
        await expect(review(page)).toBeVisible();
        await expect(review(page).locator('.twextsec-row input, .twextsec-row button')).toHaveCount(0);
        assert.equal(await page.evaluate(() => window.__reviewFixtureStarted || 0), 0);
        await review(page).getByTestId('twextsec-cancel').click();
        await expect(page).toHaveURL(previous);
        await page.waitForFunction(() => window.vm?.runtime.targets.length > 0);
        assert.equal(await page.evaluate(() => window.vm.extensionManager.isExtensionLoaded('reviewfixture')), false);
    } finally {await context.close();}
});

for (const approve of [false, true]) test(`another local file opens in a new tab; ${approve ? 'approval' : 'cancellation'} preserves the original without saving or reloading it`, {timeout: 90000}, async () => {
    const context = await contextFor(); const page = await context.newPage();
    page.on('dialog', dialog => dialog.accept());
    try {
        await page.goto(new URL('editor.html?lang=ja', base).href);
        await page.waitForFunction(() => window.ReduxStore?.getState().scratchGui.projectState.loadingState.startsWith('SHOWING_'));
        const previous = await page.evaluate(() => {
            const stage = window.vm.runtime.getTargetForStage();
            window.__originalStage = stage;
            window.__originalQuitCalls = 0; window.__originalSaveCalls = 0;
            const quit = window.vm.quit.bind(window.vm);
            window.vm.quit = (...args) => {window.__originalQuitCalls++; return quit(...args);};
            const save = window.vm.saveProjectSb3DontZip.bind(window.vm);
            window.vm.saveProjectSb3DontZip = (...args) => {window.__originalSaveCalls++; return save(...args);};
            stage.createVariable('keep', 'Unsaved value', ''); stage.variables.keep.value = 'keep me';
            window.ReduxStore.dispatch({type: 'projectTitle/SET_PROJECT_TITLE', title: 'Original unsaved project'});
            return {url: location.href, length: history.length, state: window.ReduxStore.getState().scratchGui.projectState};
        });
        await page.getByText('ファイル', {exact: true}).click();
        const choosing = page.waitForEvent('filechooser');
        await page.getByText('SB3ファイルを開く…', {exact: true}).click();
        const opened = context.waitForEvent('page');
        await (await choosing).setFiles({name: 'review.sb3', mimeType: 'application/octet-stream', buffer: archive});
        const next = await opened;
        await expect(review(next)).toBeVisible({timeout: 30000});
        assert.equal(await next.evaluate(() => window.opener === null), true);
        assert.equal(await page.evaluate(() => history.length), previous.length);
        if (approve) {
            await review(next).getByTestId('twextsec-enable-all').click();
            await expect(review(next)).toHaveCount(0);
            await expect.poll(() => next.evaluate(() => window.vm.extensionManager.isExtensionLoaded('reviewfixture'))).toBe(true);
            await expect.poll(() => next.evaluate(() => window.ReduxStore.getState().scratchGui.projectTitle)).toBe('review');
        } else {
            const closed = next.waitForEvent('close');
            await review(next).getByTestId('twextsec-cancel').click();
            await closed;
        }
        await page.waitForFunction(() => window.ReduxStore.getState().scratchGui.projectState.loadingState.startsWith('SHOWING_'));
        assert.equal(page.url(), previous.url);
        assert.equal(await page.evaluate(() => window.vm.runtime.getTargetForStage().variables.keep?.value), 'keep me');
        assert.equal(await page.evaluate(() => window.ReduxStore.getState().scratchGui.projectTitle), 'Original unsaved project');
        assert.equal(await page.evaluate(() => window.__reviewFixtureStarted || 0), 0);
        assert.equal(await page.evaluate(() => window.vm.runtime.getTargetForStage() === window.__originalStage), true);
        assert.equal(await page.evaluate(() => window.__originalQuitCalls), 0);
        assert.equal(await page.evaluate(() => window.__originalSaveCalls), 0);
        assert.deepEqual(await page.evaluate(() => window.ReduxStore.getState().scratchGui.projectState), previous.state);
    } finally {await context.close();}
});

test('a transferred file returns to confirmation after failure without depending on its closed transfer channel', {timeout: 90000}, async () => {
    const context = await contextFor(); const page = await context.newPage();
    page.on('dialog', dialog => dialog.accept());
    let unavailable = true;
    await context.route('https://retry-file.test/extension.js', route => route.fulfill({
        status: unavailable ? 503 : 200, contentType: 'application/javascript',
        body: unavailable ? 'Unavailable fixture' : 'globalThis.__reviewFixtureStarted=1;' +
            'Scratch.extensions.register({getInfo(){return {id:"reviewfixture",name:"Review fixture",blocks:[]};}});'
    }));
    try {
        const zip = await JSZip.loadAsync(archive);
        const project = JSON.parse(await zip.file('project.json').async('string'));
        project.extensionURLs.reviewfixture = 'https://retry-file.test/extension.js';
        zip.file('project.json', JSON.stringify(project));
        await page.goto(new URL('editor.html?lang=ja', base).href);
        await page.waitForFunction(() => window.ReduxStore?.getState().scratchGui.projectState.loadingState.startsWith('SHOWING_'));
        await page.evaluate(() => {window.__originalStage = window.vm.runtime.getTargetForStage();});
        await page.getByText('ファイル', {exact: true}).click();
        const choosing = page.waitForEvent('filechooser');
        await page.getByText('SB3ファイルを開く…', {exact: true}).click();
        const opened = context.waitForEvent('page');
        await (await choosing).setFiles({name: 'retry.sb3', mimeType: 'application/octet-stream',
            buffer: await zip.generateAsync({type: 'nodebuffer'})});
        const next = await opened;
        await expect(review(next)).toBeVisible();
        await review(next).getByTestId('twextsec-enable-all').click();
        const outcome = next.getByTestId('project-load-failure');
        await expect(outcome).toBeVisible();
        unavailable = false;
        await outcome.getByRole('button', {name: '確認画面に戻る', exact: true}).click();
        await expect(review(next)).toBeVisible();
        await expect(review(next)).toHaveAccessibleName('確認: この作品は機能拡張を使います');
        assert.equal(await next.evaluate(() => window.__reviewFixtureStarted || 0), 0);
        await review(next).getByTestId('twextsec-enable-all').click();
        await expect.poll(() => next.evaluate(() => window.__reviewFixtureStarted || 0)).toBe(1);
        await expect(outcome).toHaveCount(0);
        assert.equal(await page.evaluate(() => window.vm.runtime.getTargetForStage() === window.__originalStage), true);
    } finally {await context.close();}
});

test('a directly opened URL returns from its stopped result to confirmation before anything can run', {timeout: 90000}, async () => {
    const context = await contextFor(); const page = await context.newPage();
    try {
        const opening = startupURL();
        await page.goto(opening);
        await expect(review(page)).toBeVisible();
        await expect(review(page)).toHaveAccessibleName('確認: この作品は機能拡張を使います');
        await review(page).getByTestId('twextsec-cancel').click();
        const outcome = page.getByTestId('project-load-failure');
        await expect(outcome).toBeVisible();
        await expect(outcome.getByRole('button', {name: '前の画面に戻る', exact: true})).toBeDisabled();
        const confirm = outcome.getByRole('button', {name: '確認画面に戻る', exact: true});
        await expect(confirm).toBeEnabled();
        assert.equal(new URL(page.url()).searchParams.has('project_url'), true);
        await page.screenshot({path: join(tmpdir(), 'tw-direct-open-stopped.png')});
        await confirm.click();
        await expect(review(page)).toBeVisible();
        await expect(review(page)).toHaveAccessibleName('確認: この作品は機能拡張を使います');
        assert.deepEqual([...new URL(page.url()).searchParams], [...new URL(opening).searchParams]);
        await expect(outcome).toHaveCount(0);
        assert.equal(await page.evaluate(() => window.__reviewFixtureStarted || 0), 0);
        await review(page).getByTestId('twextsec-enable-all').click();
        await page.waitForFunction(() => window.vm?.runtime.targets.length > 0 &&
            window.ReduxStore?.getState().scratchGui.projectState.loadingState.startsWith('SHOWING_'));
        assert.equal(new URL(page.url()).searchParams.get('lang'), 'ja');
        await expect(outcome).toHaveCount(0);
        await expect(review(page)).toHaveCount(0);
        assert.equal(await page.evaluate(() => window.__reviewFixtureStarted || 0), 1);
    } finally {await context.close();}
});

test('the real editor shows individual buttons and waits for an explicit final approval', {timeout: 90000}, async () => {
    const context = await contextFor(); const page = await context.newPage();
    try {
        await page.goto(startupURL());
        await expect(review(page)).toBeVisible();
        await page.screenshot({path: join(tmpdir(), 'tw-editor-review-overview.png')});
        await review(page).getByTestId('twextsec-individual').click();
        const group = review(page).locator('.twextsec-execution');
        await expect(group.getByRole('button')).toHaveCount(3);
        await expect(group.locator('input, .twextsec-choice-icon')).toHaveCount(0);
        await group.locator('[data-execution="unsandboxed"]').click();
        await expect(group.locator('[aria-pressed="true"]')).toHaveCount(1);
        assert.equal(await page.evaluate(() => window.__reviewFixtureStarted || 0), 0);
        const warning = review(page).locator('.twextsec-warning');
        await warning.getByRole('button', {name: '閉じる', exact: true}).click();
        await page.screenshot({path: join(tmpdir(), 'tw-editor-review-individual.png')});
        await review(page).getByTestId('twextsec-complete').click();
        await expect(review(page)).toHaveCount(0);
        await expect.poll(() => page.evaluate(() => window.__reviewFixtureStarted || 0)).toBe(1);
    } finally {await context.close();}
});

test('the project list opens in another tab and leaves the original project intact', {timeout: 90000}, async () => {
    const context = await contextFor(); const page = await context.newPage();
    try {
        await page.goto(new URL('editor.html?lang=ja', base).href);
        await page.waitForFunction(() => window.ReduxStore?.getState().scratchGui.projectState.loadingState.startsWith('SHOWING_'));
        const before = await page.evaluate(() => {
            window.__originalStage = window.vm.runtime.getTargetForStage();
            return location.href;
        });
        await page.getByText('ファイル', {exact: true}).click();
        const opening = context.waitForEvent('page');
        await page.getByText('プロジェクト一覧…', {exact: true}).click();
        const next = await opening;
        await expect(next.getByRole('dialog', {name: 'プロジェクト一覧', exact: true})).toBeVisible({timeout: 30000});
        await next.locator('[data-catalog-action="create"]').click();
        await expect(next.locator('[data-new-project-dialog]')).toBeVisible();
        await expect(next.locator('[data-new-project-dialog] input[name="destination"][value="browser"]')).toHaveCount(1);
        await next.locator('[data-new-project-cancel]').click();
        assert.equal(page.url(), before);
        assert.equal(await page.evaluate(() => window.vm.runtime.getTargetForStage() === window.__originalStage), true);
    } finally {await context.close();}
});

test('refusal with blocked history replaces the loader with a main stopped screen and explicit exit actions', {timeout: 90000}, async () => {
    const context = await contextFor(); const page = await context.newPage();
    await context.addInitScript(() => {history.back = () => {};});
    try {
        await page.goto(startupURL());
        await expect(review(page)).toBeVisible();
        await review(page).getByTestId('twextsec-cancel').click();
        const outcome = page.getByTestId('project-load-failure');
        await expect(outcome).toBeVisible();
        await expect(outcome.getByRole('heading', {name: '作品を開けませんでした'})).toBeVisible();
        await expect(outcome).toHaveAttribute('data-outcome', 'cancelled');
        await expect(outcome.getByRole('button', {name: '前の画面に戻る', exact: true})).toBeDisabled();
        await expect(outcome).toContainText('作品の読み込みを中止しました');
        await expect(page.getByTestId('project-diagnostics-snackbar')).toHaveCount(0);
        await expect(page.getByText('プロジェクトを作る', {exact: true})).toHaveCount(0);
        await expect(page.getByText(/プロジェクトをダウンロード中/)).toHaveCount(0);
        assert.equal(await page.evaluate(() => window.ReduxStore.getState().scratchGui.projectState.loadingState), 'NOT_LOADED');
        assert.equal(await page.evaluate(() => window.__reviewFixtureStarted || 0), 0);
        const bounds = await outcome.boundingBox();
        assert.equal(bounds.width, 1280); assert.equal(bounds.height, 900);
        await page.keyboard.press('Escape'); await expect(outcome).toBeVisible();
        await page.screenshot({path: join(tmpdir(), 'tw-editor-open-cancelled-main.png')});
        await outcome.getByRole('button', {name: '確認画面に戻る', exact: true}).click();
        await expect(review(page)).toBeVisible();
        await expect(review(page)).toHaveAccessibleName('確認: この作品は機能拡張を使います');
        assert.equal(new URL(page.url()).searchParams.has('project_url'), true);
        assert.equal(await page.evaluate(() => window.__reviewFixtureStarted || 0), 0);
        await expect(outcome).toHaveCount(0);
    } finally {await context.close();}
});

test('an extension load failure is the main outcome with a detailed-log action and no busy overlay', {timeout: 90000}, async () => {
    const context = await contextFor(); const page = await context.newPage();
    try {
        const zip = await JSZip.loadAsync(archive);
        const project = JSON.parse(await zip.file('project.json').async('string'));
        project.extensionURLs.reviewfixture = 'https://failed-extension.test/extension.js';
        await context.route('https://failed-extension.test/**', route => route.fulfill({status: 503,
            contentType: 'application/javascript', body: 'Unavailable extension fixture'}));
        zip.file('project.json', JSON.stringify(project));
        const url = new URL('editor.html', base);
        url.search = new URLSearchParams({lang: 'ja', project_url:
            `data:application/octet-stream;base64,${await zip.generateAsync({type: 'base64'})}`}).toString();
        await page.goto(url.href); await expect(review(page)).toBeVisible();
        await review(page).getByTestId('twextsec-enable-all').click();
        const outcome = page.getByTestId('project-load-failure');
        await expect(outcome).toBeVisible(); await expect(outcome).toHaveAttribute('data-outcome', 'failed');
        await expect(outcome.getByRole('button', {name: '前の画面に戻る', exact: true})).toBeDisabled();
        await expect(page.getByTestId('project-diagnostics-snackbar')).toHaveCount(0);
        await expect(page.getByText('プロジェクトを作る', {exact: true})).toHaveCount(0);
        assert.equal(await page.evaluate(() => window.ReduxStore.getState().scratchGui.projectState.loadingState), 'NOT_LOADED');
        await outcome.getByRole('button', {name: '詳細ログを表示', exact: true}).click();
        await expect(page.getByTestId('project-diagnostics')).toBeVisible();
        await expect(page.getByTestId('project-diagnostics')).toContainText('failed-extension.test');
        await page.getByTestId('project-diagnostics').getByRole('button', {name: '閉じる', exact: true}).click();
        await outcome.getByRole('button', {name: '確認画面に戻る', exact: true}).click();
        await expect(review(page)).toBeVisible();
        await expect(review(page)).toHaveAccessibleName('確認: この作品は機能拡張を使います');
        assert.equal(new URL(page.url()).searchParams.has('project_url'), true);
        await expect(outcome).toHaveCount(0);
    } finally {await context.close();}
});
