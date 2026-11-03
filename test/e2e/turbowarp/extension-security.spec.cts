const JSZip = require('@turbowarp/jszip');
const {createHash} = require('node:crypto');
const {test, expect} = require('./fixtures.cts');

/**
 * The review a project's extensions go through before any of them runs, on the real editor.
 *
 * The screen is security-dialog 0.7.0's `ExtensionReview` in its `open` mode, framed by the GUI's
 * own modal. What it guarantees: nothing runs until the person answers; an extension's own claims
 * are shown as claims; nothing starts outside the sandbox on an extension's say-so; saying no, or
 * cancelling, runs nothing; and the answer is remembered for the same project.
 */

const name = 'Security bundle fixture';
const description = 'Review the enclosing bundle metadata.';
const license = 'See the bundled extension notices below.';
const source = `// Name: ${name}\n// ID: securityfixture\n// Description: ${description}\n` +
    `// By: Fixture Author\n// License: ${license}\n// Unsandboxed: required\n` +
    '// Bundled extensions:\n// - Name: Nested fixture\n//   Description: Nested description\n' +
    '//   By: Nested author\n//   License: Nested license\n' +
    'globalThis.__securityFixtureStarted = (globalThis.__securityFixtureStarted || 0) + 1;\n' +
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
    ja:{title:'この作品は機能拡張を使います',deny:'動かさない',sandboxed:'サンドボックスの中で',
        unsandboxed:'サンドボックスなしで',cancel:'キャンセル',required:'サンドボックスなしが必要と申告しています',
        unknown:'サンドボックスについて申告がありません',creator:'製作者'},
    en:{title:'This project wants to run extensions',deny:'Do not run',sandboxed:'In the sandbox',
        unsandboxed:'Without the sandbox',cancel:'Cancel',required:'Says it needs to run without the sandbox',
        unknown:'Says nothing about the sandbox',creator:'Creator'}
};
const choice = (page, row, language, execution) =>
    row.getByRole('radio', {name: labels[language][execution], exact: true});
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
    const ok = dialog(page).getByRole('button',{name:'OK',exact:true});
    await ok.scrollIntoViewIfNeeded();
    const button = await ok.boundingBox();
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
        // The extension says it needs to run outside the sandbox. That is shown as its claim, and it
        // still starts in the sandbox: only the catalog, or the person, puts it outside.
        await expect(row.locator('.twextsec-requirement')).toHaveText(labels[language].required);
        await expect(choice(page,row,language,'sandboxed')).toBeChecked();
        await expect(dialog(page).locator('.twextsec-warning')).toHaveCount(0);
        expect(await executions(page)).toBe(0);
        await choice(page,row,language,'unsandboxed').check();
        // Choosing it outside the sandbox is the person's own decision, and the screen warns.
        await expect(dialog(page).locator('.twextsec-warning')).toBeVisible();
        const ok = dialog(page).getByRole('button',{name:'OK',exact:true});
        await expect(ok).toBeEnabled();
        await ok.click();
        await expect(dialog(page)).toHaveCount(0);
        await expect.poll(() => executions(page)).toBe(1);
        // The answer is remembered for this project, and still has to be confirmed again.
        await page.reload();
        await expect(dialog(page)).toBeVisible();
        await expect(choice(page,rows(page).first(),language,'unsandboxed')).toBeChecked();
        expect(await executions(page)).toBe(0);
        await dialog(page).getByRole('button',{name:'OK',exact:true}).click();
        await expect(dialog(page)).toHaveCount(0);
        await expect.poll(() => executions(page)).toBe(1);
    });

    test(`shared security from ${language} entry cancels without executing extensions`, async ({page,evidence}) => {
        evidence.stage('shared-security-cancel');
        await open(page,language);
        await dialog(page).getByRole('button',{name:labels[language].cancel,exact:true}).click();
        await expect(dialog(page)).toHaveCount(0);
        await expect.poll(() => new URL(page.url()).searchParams.has('project_url')).toBe(false);
        expect(new URL(page.url()).searchParams.has('extensionSecurityBatch')).toBe(false);
        await expect.poll(() => page.evaluate(() => vm.runtime.targets.length)).toBeGreaterThan(0);
        expect(await executions(page)).toBe(0);
        expect(await page.evaluate(() => vm.extensionManager.isExtensionLoaded('securityfixture'))).toBe(false);
    });

    test(`mixed extensions from ${language} entry are answered together and individually`, async ({page,evidence}) => {
        evidence.stage('shared-security-mixed-defaults');
        await open(page,language,{mixed:true});
        await expect(rows(page)).toHaveCount(2);
        await expect(rows(page).nth(1).locator('.twextsec-id')).toHaveText('securityordinary');
        await expect(rows(page).nth(1).locator('.twextsec-requirement')).toHaveText(labels[language].unknown);
        // Both start in the sandbox; nothing is chosen outside it for the person.
        for (const index of [0,1]) await expect(choice(page,rows(page).nth(index),language,'sandboxed')).toBeChecked();
        const bulk = dialog(page).locator('.twextsec-bulk');
        await bulk.getByRole('radio',{name:labels[language].unsandboxed,exact:true}).click();
        for (const index of [0,1]) await expect(choice(page,rows(page).nth(index),language,'unsandboxed')).toBeChecked();
        await choice(page,rows(page).nth(1),language,'sandboxed').check();
        await expect(choice(page,rows(page).nth(0),language,'unsandboxed')).toBeChecked();
        expect(await executions(page)).toBe(0);
        await dialog(page).getByRole('button',{name:'OK',exact:true}).click();
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
    await expect(choice(page,row,'ja','sandboxed')).toBeChecked();
    await dialog(page).getByRole('button',{name:'OK',exact:true}).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect.poll(()=>page.evaluate(()=>vm.extensionManager.isExtensionLoaded('securityfixture'))).toBe(true);
});

test('denying an extension opens the project and never executes it', async ({page,evidence}) => {
    evidence.stage('shared-security-ordinary-denial');
    await open(page,'ja',{required:false});
    await choice(page,rows(page).first(),'ja','deny').check();
    await dialog(page).getByRole('button',{name:'OK',exact:true}).click();
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
    expect(await row.locator('input[name^="execution-"]').evaluateAll(items=>items.map(item=>item.value)))
        .toEqual(['deny','sandboxed','unsandboxed']);
    await expectInside(page,390,600);
    const unsandboxed = choice(page,row,'ja','unsandboxed');
    await unsandboxed.check();
    await expect(unsandboxed).toBeChecked();
    await page.setViewportSize({width:320,height:568});
    await expectInside(page,320,568);
    expect(await executions(page)).toBe(0);
    const ok = dialog(page).getByRole('button',{name:'OK',exact:true});
    await ok.focus();await ok.press('Enter');
    await expect(dialog(page)).toHaveCount(0);
    await expect.poll(()=>executions(page)).toBe(1);
});

test('real mobile context keeps the shared review inside the visual viewport', async ({browser,baseURL}) => {
    const {devices} = require('@playwright/test');
    const context = await browser.newContext({...devices['Pixel 7'],viewport:{width:390,height:844},locale:'ja-JP'});
    try {
        const page = await context.newPage();
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
        await dialog(page).locator('.twextsec-bulk').getByRole('radio',{name:labels.ja.unsandboxed,exact:true}).click();
        await expect(dialog(page).locator('.twextsec-row input[value="unsandboxed"]:checked')).toHaveCount(2);
        await expect(dialog(page).getByRole('button',{name:'OK',exact:true})).toBeEnabled();
        expect(await executions(page)).toBe(0);
    } finally { await context.close(); }
});
