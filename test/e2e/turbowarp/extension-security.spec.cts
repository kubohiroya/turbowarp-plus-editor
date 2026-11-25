const JSZip = require('@turbowarp/jszip');
const {createHash} = require('node:crypto');
const {test, expect} = require('./fixtures.cts');

// These custom fixture IDs are deliberately outside the trusted catalog. Keep that precondition
// deterministic instead of waiting for the public catalog's 15-second network timeout in CI.
const useFixtureCatalog = context => context.route(
    'https://kubohiroya.github.io/turbowarp-plus-packages/extensions-v1.json',
    route => route.fulfill({json: {schemaVersion: 1, extensions: []}})
);
test.beforeEach(async ({context}) => { await useFixtureCatalog(context); });

/**
 * The review a project's extensions go through before any of them runs, on the real editor.
 *
 * The shared review's open mode is framed by the GUI modal. No code runs before an explicit answer;
 * author metadata remains a claim; the overview can enable all, or the user can review choices
 * separately; denial and cancellation are distinct; reopening requires a fresh confirmation.
 */

const name = 'Security bundle fixture';
const description = 'Review the enclosing bundle metadata.';
const license = 'See the bundled extension notices below.';
const source = `// Name: ${name}\n// ID: securityfixture\n// Description: ${description}\n` +
    `// By: Fixture Author\n// License: ${license}\n// Unsandboxed: required\n` +
    '// Bundled extensions:\n// - Name: Nested fixture\n//   Description: Nested description\n' +
    '//   By: Nested author\n//   License: Nested license\n' +
    'globalThis.__securityFixtureStarted = (globalThis.__securityFixtureStarted || 0) + 1;\n' +
    'console.log("security-fixture:start");\n' +
    'Scratch.extensions.register({getInfo(){return {id:"securityfixture",name:"Security fixture",' +
    'color1:"#5B67A5",color2:"#4D588C",color3:"#404874",' +
    'blocks:[{opcode:"value",blockType:Scratch.BlockType.REPORTER,text:"security fixture"}]};},value(){return 1;}});';

const projectURL = async ({required = true, mixed = false} = {}) => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"></svg>';
    const assetId = createHash('md5').update(svg).digest('hex');
    const project: {targets: any[]; monitors: any[]; extensions: string[]; extensionURLs: Record<string, string>; meta: Record<string, string>} = {targets: [{isStage:true,name:'Stage',variables:{},lists:{},broadcasts:{},comments:{},
        blocks:{fixture:{opcode:'securityfixture_value',next:null,parent:null,inputs:{},fields:{},
            shadow:false,topLevel:true,x:40,y:40}},currentCostume:0,
        costumes:[{name:'Blank',assetId,dataFormat:'svg',md5ext:`${assetId}.svg`,rotationCenterX:240,rotationCenterY:180}],
        sounds:[],volume:100,tempo:60,videoTransparency:50,videoState:'off',textToSpeechLanguage:null}],
        monitors:[],extensions:['securityfixture'],extensionURLs:{securityfixture:`data:text/javascript,${encodeURIComponent(
            required ? source : source.replace('// Unsandboxed: required\n',''))}`},
        meta:{semver:'3.0.0',vm:'0.2.0',agent:'shared-security-fixture'}};
    if (mixed) {
        const ordinarySource=source.replaceAll('securityfixture','securityordinary')
            .replaceAll('__securityFixtureStarted','__securityOrdinaryStarted')
            .replace('// Unsandboxed: required\n','');
        project.extensions.push('securityordinary');
        project.extensionURLs.securityordinary=`data:text/javascript,${encodeURIComponent(ordinarySource)}`;
        project.targets[0].blocks.ordinary={...project.targets[0].blocks.fixture,opcode:'securityordinary_value',y:120};
    }
    const zip = new JSZip();
    zip.file('project.json',JSON.stringify(project));zip.file(`${assetId}.svg`,svg);
    return `data:application/octet-stream;base64,${await zip.generateAsync({type:'base64',compression:'DEFLATE'})}`;
};
const dialog = page => page.getByRole('dialog').filter({has: page.locator('.twextsec-review')});
const rows = page => dialog(page).locator('.twextsec-row');
const executions = page => page.evaluate(() => globalThis.__securityFixtureStarted || 0);
const labels = {
    ja:{title:'確認: この作品は機能拡張を使います',deny:'動かさない',sandboxed:'様子を見るためにサンドボックス内で動かす',
        unsandboxed:'信頼してサンドボックスなしで動かす',cancel:'実行しない',required:'⚠️ サンドボックスなしが必要',
        creator:'製作者（未検証の申告）', individual:'機能拡張を個別に確認', run:'選んだ内容で実行', enableAll:'すべて有効にして実行'},
    en:{title:'Confirmation: This project wants to run extensions',deny:'Do not run',sandboxed:'Run in the sandbox to try it out',
        unsandboxed:'Trust and run without the sandbox',cancel:'Do not run',required:'⚠️ Needs to run without the sandbox',
        creator:'Creator (unverified claim)', individual:'Review each extension', run:'Run with these choices', enableAll:'Enable all and run'}
};
const choice = (row, language, execution) => row.getByRole('button', {name: labels[language][execution], exact: true});
const action = (page, language, key) => dialog(page).getByRole('button', {name: labels[language][key], exact: true});
const individual = (page, language) => action(page, language, 'individual').click();
const open = async (page, language, options = undefined) => {
    await page.goto(`?lang=${language}`);
    const href = await page.locator('a[data-editor][href*="editor.html"]').first().getAttribute('href');
    const target = new URL(href,page.url());
    expect(target.searchParams.has('extensionSecurityBatch')).toBe(false);
    target.searchParams.set('project_url',await projectURL(options));
    await page.goto(target.href);
    await expect(dialog(page)).toBeVisible();
    // The name is read off the extension's own leading comment, which is how the screen knows it.
    await expect(rows(page).first().locator('strong')).toHaveText(name);
};
const expectInside = async (page, width, height) => {
    const box = await dialog(page).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    const run = action(page, 'ja', 'run');
    await run.scrollIntoViewIfNeeded();
    const button = await run.boundingBox();
    expect(button.y + button.height).toBeLessThanOrEqual(height);
};

test('direct editor URLs use shared security without adding a startup switch', async ({page,baseURL,evidence}) => {
    evidence.stage('shared-security-direct-startup');
    const target = new URL('editor.html',baseURL);
    target.search = new URLSearchParams({lang:'ja',project_url:await projectURL()}).toString();
    await page.goto(target.href);
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toHaveAccessibleName(labels.ja.title);
    expect(new URL(page.url()).searchParams.has('extensionSecurityBatch')).toBe(false);
    expect(await executions(page)).toBe(0);
});

for (const language of ['ja','en']) {
    test(`shared security from ${language} entry requires approval and retains bundle metadata`, async ({page,evidence}) => {
        evidence.stage('shared-security-approve');
        await page.setViewportSize({width:1280,height:600});
        await open(page,language);
        const row = rows(page).first();
        await expect(row.locator('.twextsec-about')).toHaveText(description);
        await expect(row.locator('.twextsec-claim')).toContainText(`${labels[language].creator}: Fixture Author`);
        await expect(row).not.toContainText('Nested description');
        await expect(dialog(page).locator('textarea')).toHaveCount(0);
        await expect(row.locator('.twextsec-requirement')).toHaveText(labels[language].required);
        // The overview must never imply that displaying the mode grants consent.
        await expect(row.locator('[data-execution]')).toHaveCount(0);
        expect(await executions(page)).toBe(0);
        await action(page, language, 'enableAll').click();
        await expect(dialog(page)).toHaveCount(0);
        await expect.poll(() => executions(page)).toBe(1);
        // A reload shows the review again. The same project still requires an explicit answer.
        await page.reload();
        await expect(dialog(page)).toBeVisible();
        await individual(page, language);
        await expect(choice(rows(page).first(), language, 'unsandboxed')).toHaveAttribute('aria-pressed', 'true');
        expect(await executions(page)).toBe(0);
        await action(page, language, 'run').click();
        await expect(dialog(page)).toHaveCount(0);
        await expect.poll(() => executions(page)).toBe(1);
    });

    test(`shared security from ${language} entry cancels without executing extensions`, async ({page,evidence}) => {
        evidence.stage('shared-security-cancel');
        const starts = [];
        page.on('console', message => {
            if (message.text() === 'security-fixture:start') starts.push(message.text());
        });
        await open(page,language);
        await action(page, language, 'cancel').click();
        await expect(dialog(page)).toHaveCount(0);
        await expect.poll(() => new URL(page.url()).searchParams.has('project_url')).toBe(false);
        expect(new URL(page.url()).searchParams.has('extensionSecurityBatch')).toBe(false);
        // Starting from the landing page returns there, rather than loading the rejected project.
        const freshEditor = page.locator('a[data-editor][href*="editor.html"]').first();
        await expect(freshEditor).toBeVisible();
        await freshEditor.click();
        await page.waitForFunction(() => globalThis.vm?.runtime?.targets?.length > 0);
        expect(starts).toEqual([]);
        expect(await executions(page)).toBe(0);
        expect(await page.evaluate(() => vm.extensionManager.isExtensionLoaded('securityfixture'))).toBe(false);
    });

    test(`mixed extensions from ${language} entry are answered together and individually`, async ({page,evidence}) => {
        evidence.stage('shared-security-mixed-defaults');
        await open(page,language,{mixed:true});
        await expect(rows(page)).toHaveCount(2);
        await expect(rows(page).nth(1).locator('.twextsec-id')).toHaveText('securityordinary');
        // An extension that says nothing about the sandbox runs inside it by default, so it carries no warning.
        await expect(rows(page).nth(1).locator('.twextsec-requirement')).toHaveCount(0);
        await individual(page, language);
        await expect(rows(page).first().locator('.twextsec-execution')).toBeVisible();
        // Mixed batches default to sandboxed and present each extension's controls separately.
        for (const index of [0, 1]) {
            await expect(choice(rows(page).nth(index), language, 'sandboxed')).toHaveAttribute('aria-pressed', 'true');
        }
        await choice(rows(page).nth(0), language, 'unsandboxed').click();
        await expect(choice(rows(page).nth(0), language, 'unsandboxed')).toHaveAttribute('aria-pressed', 'true');
        await expect(choice(rows(page).nth(1), language, 'sandboxed')).toHaveAttribute('aria-pressed', 'true');
        expect(await executions(page)).toBe(0);
        await action(page, language, 'run').click();
        await expect(dialog(page)).toHaveCount(0);
        await expect.poll(()=>executions(page)).toBe(1);
        await expect.poll(()=>page.evaluate(()=>vm.extensionManager.isExtensionLoaded('securityordinary'))).toBe(true);
    });
}

test('extensions without a required mode can still run sandboxed', async ({page,baseURL,evidence}) => {
    evidence.stage('shared-security-sandboxed');
    const target = new URL('editor.html',baseURL);
    target.search = new URLSearchParams({lang:'ja',project_url:await projectURL({required:false})}).toString();
    await page.goto(target.href);
    await expect(rows(page).first().locator('strong')).toHaveText(name);
    const row = rows(page).first();
    await individual(page, 'ja');
    await expect(choice(row, 'ja', 'sandboxed')).toHaveAttribute('aria-pressed', 'true');
    await action(page, 'ja', 'run').click();
    await expect(dialog(page)).toHaveCount(0);
    await expect.poll(()=>page.evaluate(()=>vm.extensionManager.isExtensionLoaded('securityfixture'))).toBe(true);
});

test('denying an extension opens the project and never executes it', async ({page,evidence}) => {
    evidence.stage('shared-security-ordinary-denial');
    await open(page,'ja',{required:false});
    await individual(page, 'ja');
    await choice(rows(page).first(), 'ja', 'deny').click();
    await action(page, 'ja', 'run').click();
    await expect(dialog(page)).toHaveCount(0);
    // Declining is not losing the project: it opens, with its blocks and the extension's address.
    await expect.poll(() => page.evaluate(() => {
        try { return JSON.parse(vm.toJSON()).extensionURLs?.securityfixture?.startsWith('data:'); }
        catch (error) { return null; }
    })).toBe(true);
    expect(await executions(page)).toBe(0);
    expect(await page.evaluate(()=>vm.extensionManager.isExtensionLoaded('securityfixture'))).toBe(false);
});

test('narrow security dialog keeps the choices and a reachable confirmation button', async ({page,evidence}) => {
    evidence.stage('shared-security-narrow-modes');
    await page.setViewportSize({width:390,height:600});await open(page,'ja');
    const row = rows(page).first();
    await individual(page, 'ja');
    await expect(choice(row, 'ja', 'unsandboxed')).toBeVisible();
    await expectInside(page, 390, 600);
    await choice(row, 'ja', 'unsandboxed').click();
    await expect(choice(row, 'ja', 'unsandboxed')).toHaveAttribute('aria-pressed', 'true');
    await page.setViewportSize({width:320,height:568});
    await expectInside(page,320,568);
    expect(await executions(page)).toBe(0);
    const run = action(page, 'ja', 'run');
    await run.focus();await run.press('Enter');
    await expect(dialog(page)).toHaveCount(0);
    await expect.poll(()=>executions(page)).toBe(1);
});

test('real mobile context keeps the shared review inside the visual viewport', async ({browser,baseURL,evidence}) => {
    const {devices} = require('@playwright/test');
    const context = await browser.newContext({...devices['Pixel 7'],viewport:{width:390,height:844},locale:'ja-JP'});
    try {
        await useFixtureCatalog(context);
        const page = await context.newPage();
        evidence.observe(page);
        evidence.stage('shared-security-real-mobile');
        const target = new URL('editor.html',baseURL);
        target.search = new URLSearchParams({lang:'ja',project_url:await projectURL({mixed:true})}).toString();
        await page.goto(target.href);
        await expect(dialog(page)).toBeVisible();
        const rect = await dialog(page).evaluate(node => {
            const r=node.getBoundingClientRect(),v=window.visualViewport;
            return {left:r.left-v.offsetLeft,right:r.right-v.offsetLeft,width:v.width};
        });
        expect(rect.left).toBeGreaterThanOrEqual(0);
        expect(rect.right).toBeLessThanOrEqual(rect.width);
        await individual(page, 'ja');
        for (const row of await rows(page).all()) await choice(row, 'ja', 'unsandboxed').click();
        await expect(dialog(page).locator('.twextsec-row [data-execution="unsandboxed"][aria-pressed="true"]')).toHaveCount(2);
        const warning = dialog(page).locator('.twextsec-warning');
        const notice = await warning.evaluate(node => {
            const r=node.getBoundingClientRect(),v=window.visualViewport;
            return {left:r.left-v.offsetLeft,right:r.right-v.offsetLeft,top:r.top-v.offsetTop,
                bottom:r.bottom-v.offsetTop,width:v.width,height:v.height};
        });
        expect(notice.left).toBeGreaterThanOrEqual(0);
        expect(notice.right).toBeLessThanOrEqual(notice.width);
        expect(notice.top).toBeGreaterThanOrEqual(0);
        expect(Math.abs(notice.bottom-notice.height)).toBeLessThanOrEqual(1);
        await warning.getByRole('button',{name:'閉じる',exact:true}).click();
        await expect(warning).toHaveCount(0);
        await expect(dialog(page).locator('.twextsec-row [data-execution="unsandboxed"][aria-pressed="true"]')).toHaveCount(2);
        await expect(action(page, 'ja', 'run')).toBeEnabled();
        expect(await executions(page)).toBe(0);
    } finally { await context.close(); }
});
