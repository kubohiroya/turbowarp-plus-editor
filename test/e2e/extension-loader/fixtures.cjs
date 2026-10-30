const {test: base, expect} = require('@playwright/test');
const pins = require('../../../site/source.json');

async function identity(request, baseURL) {
    const url = new URL('build-info.json', baseURL);
    url.searchParams.set('extension_e2e_time', Date.now());
    const response = await request.get(url.href, {headers: {'Cache-Control': 'no-cache'}});
    expect(response.ok()).toBeTruthy();
    const info = await response.json();
    expect(info.siteRepository).toBe('https://github.com/kubohiroya/turbowarp-plus-editor');
    expect(info.siteRevision).toMatch(/^[a-f0-9]{40}$/);
    expect(info.revision).toBe(process.env.E2E_EXPECT_GUI_REVISION || pins.guiRevision);
    expect(info.coreRevision).toBe(process.env.E2E_EXPECT_CORE_REVISION || pins.coreRevision);
    expect(info.securityVersion).toBe(process.env.E2E_EXPECT_SECURITY_VERSION || pins.securityVersion);
    if (process.env.E2E_EXPECT_SITE_REVISION) expect(info.siteRevision).toBe(process.env.E2E_EXPECT_SITE_REVISION);
    expect(info.extensionIntegration).toBeTruthy();
    for (const key of ['loaderRepository', 'loaderRevision', 'vmRepository', 'vmRevision', 'packagerRepository', 'packagerRevision']) {
        expect(info.extensionIntegration[key], key).toBe(pins[key]);
    }
    expect(info.extensionIntegration.featureDefault).toBe(false);
    return info;
}

const test = base.extend({
    deploymentIdentity: [async ({request, baseURL}, use, testInfo) => {
        const before = await identity(request, baseURL);
        await testInfo.attach('deployment-before.json', {body: JSON.stringify(before, null, 2), contentType: 'application/json'});
        await use(before);
        expect(await identity(request, baseURL), 'Deployment changed during the test').toEqual(before);
    }, {auto: true}]
});
module.exports = {test, expect};
