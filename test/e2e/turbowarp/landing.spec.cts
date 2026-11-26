const {test,expect}=require('./fixtures.cts');
const JSZip=require('@turbowarp/jszip');

const original='https://example.test/story.sb3?signature=a%2Bb%26c&part=1';
// Only the navigation destination is stubbed; the landing page and its assets are real.
const destination=async(page,testInfo)=>{
    await page.route('**/turbowarp-plus-editor/editor.html?**',route=>route.fulfill({
        contentType:'text/html',body:'<!doctype html><title>Editor navigation destination fixture</title><p>Navigation received</p>'}));
    await testInfo.attach('navigation-fixture.json',{body:JSON.stringify({
        editorDocument:'stubbed to inspect the browser navigation URL',
        landingPage:'real deployed or local site assets',extensionExecution:'not tested in this landing scenario'
    }),contentType:'application/json'});
};
const assertTarget=(value,project,language)=>{
    const url=new URL(value);
    expect(url.pathname).toMatch(/\/turbowarp-plus-editor\/editor\.html$/);
    expect(url.searchParams.get('project_url')).toBe(project);
    expect(url.searchParams.get('lang')).toBe(language);
    expect(url.searchParams.get('fps')).toBe('60');
};

async function signedProjectFixture(page) {
    const requests: string[] = [];
    const marker = 'signed landing fixture';
    const project = {targets: [{isStage: true, name: 'Stage', variables: {'signed-marker': ['Signed marker', marker]},
        lists: {}, broadcasts: {}, blocks: {}, comments: {}, currentCostume: 0, costumes: [], sounds: [],
        volume: 100, layerOrder: 0, tempo: 60, videoTransparency: 50, videoState: 'off'}],
        monitors: [], extensions: [], meta: {semver: '3.0.0'}};
    const bytes = await new JSZip().file('project.json', JSON.stringify(project))
        .generateAsync({type: 'nodebuffer', compression: 'DEFLATE'});
    await page.route('https://example.test/**', route => {
        const url = route.request().url();
        requests.push(url);
        if (url !== original) return route.abort();
        return route.fulfill({body: bytes, headers: {'content-type': 'application/octet-stream',
            'access-control-allow-origin': '*'}});
    });
    return {marker, requests};
}

test('branded landing preserves signed project URLs, settings and language before the edit button navigates',async({page,evidence},testInfo)=>{
    evidence.stage('landing-to-real-editor');
    const {marker, requests} = await signedProjectFixture(page);
    await page.setViewportSize({width:390,height:844});
    await page.goto(`?${new URLSearchParams({lang:'ja',project_url:original,fps:'60'})}`);
    await expect(page).toHaveTitle('TurboWarp-Plus-Editor');
    await expect(page.locator('header .brand')).toContainText('TurboWarp-Plus-Editor');
    await expect(page.locator('header .brand img')).toHaveAttribute('src','assets/icon.svg');
    const button=page.locator('a[data-editor]');
    await expect(button).toHaveText('指定された作品を開く');
    assertTarget(await button.getAttribute('href'),original,'ja');
    expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(48);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByRole('button',{name:'English',exact:true}).click();
    await expect(page.locator('html')).toHaveAttribute('lang','en');
    const languageURL=new URL(page.url());
    expect(languageURL.searchParams.get('lang')).toBe('en');
    expect(languageURL.searchParams.get('project_url')).toBe(original);
    await expect(button).toHaveText('Open the linked project');
    assertTarget(await button.getAttribute('href'),original,'en');
    expect(requests).toEqual([]);
    await button.click();
    await page.waitForURL('**/editor.html?**');
    assertTarget(page.url(),original,'en');
    await expect.poll(() => page.evaluate(() => window.vm?.runtime.getTargetForStage()?.variables['signed-marker']?.value))
        .toBe(marker);
    expect(requests).toEqual([original]);
    await testInfo.attach('navigation-fixture.json', {body: JSON.stringify({
        editorDocument: 'pinned site build', projectSource: 'extension-free SB3 intercepted locally', requests
    }), contentType: 'application/json'});
});

test('landing form rejects HTTP and navigates with the newly entered HTTPS project URL',async({page,evidence},testInfo)=>{
    evidence.stage('landing-form-navigation-fixture');
    await page.goto(`?${new URLSearchParams({lang:'ja',project_url:original,fps:'60'})}`);
    const input=page.locator('#project-url');
    await input.fill('http://example.test/blocked.sb3');
    await page.locator('form button[type="submit"]').click();
    await expect(page.getByRole('alert')).toHaveText('有効なHTTPSのSB3ファイルURLを入力してください。');
    expect(new URL(page.url()).pathname).not.toContain('editor.html');
    const replacement='https://example.test/changed.sb3?signature=other%2Bvalue&lang=project';
    await input.fill(replacement);
    await destination(page,testInfo);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL('**/editor.html?**');
    assertTarget(page.url(),replacement,'ja');
});
