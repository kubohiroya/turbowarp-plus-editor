const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {sha} = require('./public-target.cts');

test('integration pins require exact GUI/core identities and an exact security version', async () => {
    const {validatePins} = await import('../../../scripts/site/source.ts');
    const pins = require('../../../site/source.json');
    assert.deepEqual(validatePins({...pins}), pins);
    for (const patch of [{guiRevision:'main'}, {coreRevision:'abc123'}, {coreVersion:'^0.6.0'},
        {coreVersion:undefined}, {securityVersion:'^0.3.3'},
        {guiRepository:'other/host'}, {coreRepository:'other/core'}, {securityPackage:'other-package'}]) {
        assert.throws(() => validatePins({...pins,...patch}));
    }
    assert.equal(sha('a'.repeat(40)), true);
    assert.equal(sha(`${'a'.repeat(40)}\n`), false);
});

test('invalid deployment selection preserves evidence without starting a browser', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'twpe-target-test-'));
    try {
        const result = spawnSync(process.execPath,[path.join(__dirname,'public-target.cts')], {
            cwd:directory,env:{...process.env,GITHUB_REPOSITORY:'other/repository'},encoding:'utf8'});
        assert.equal(result.status,1);
        const report=JSON.parse(fs.readFileSync(path.join(directory,'test-results/block-editor-deployment/selection-error.json'),'utf8'));
        assert.equal(report.stage,'deployment-selection');assert.equal(report.browser,'not-run');
    } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

test('the migrated suite includes both SB3 routes, both themes and every security case', () => {
    const result=spawnSync(process.execPath,[require.resolve('@playwright/test/cli'),'test','--config',path.join(__dirname,'playwright.config.cts'),'--list','--reporter=json'],{
        cwd:path.resolve(__dirname,'../../..'),env:{...process.env,E2E_NATIVE:'0',E2E_FIXED_INPUTS:'0'},encoding:'utf8',timeout:15000});
    assert.equal(result.status,0,result.stderr);
    const collect=suite=>[...(suite.specs||[]),...(suite.suites||[]).flatMap(collect)];
    const cases=JSON.parse(result.stdout).suites.flatMap(collect).flatMap(spec=>spec.tests.map(entry=>({...entry,file:spec.file,title:spec.title})));
    assert.equal(cases.length,20);
    assert.equal(cases.filter(entry=>entry.file==='editor.spec.cts').length,4);
    assert.equal(cases.filter(entry=>entry.file==='invalid-theme.spec.cts').length,2);
    assert.equal(cases.filter(entry=>entry.file==='extension-security.spec.cts').length,11);
    assert.equal(cases.filter(entry=>entry.file==='preview-reload.spec.cts').length,1);
    assert.equal(cases.filter(entry=>entry.file==='landing.spec.cts').length,2);
    assert.equal(cases.filter(entry=>entry.title==='real mobile context keeps the shared review and bulk controls inside the visual viewport').length,1);
    for (const entry of cases) assert.equal(entry.expectedStatus,'passed');
});

test('a canonical site source resolves expected metadata without reading the served build', () => {
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'twpe-target-source-'));
    try {
        const output=path.join(directory,'outputs');
        const result=spawnSync(process.execPath,[path.join(__dirname,'public-target.cts')],{
            cwd:directory,env:{...process.env,GITHUB_REPOSITORY:'kubohiroya/turbowarp-plus-editor',EXPECTED_REVISION:'b'.repeat(40),GITHUB_OUTPUT:output},encoding:'utf8'});
        assert.equal(result.status,0,result.stderr);
        const identity=JSON.parse(fs.readFileSync(path.join(directory,'test-results/block-editor-deployment/deployment-target.json'),'utf8'));
        const pins=require('../../../site/source.json');
        assert.equal(identity.gui_revision,pins.guiRevision);assert.equal(identity.core_revision,pins.coreRevision);
        assert.equal(identity.security_version,pins.securityVersion);assert.equal(identity.site_revision,'b'.repeat(40));
        assert.equal(identity.base_url,'https://kubohiroya.github.io/turbowarp-plus-editor/');
    } finally {fs.rmSync(directory,{recursive:true,force:true});}
});


test('the full integration profile includes every fixed-input case without skips', () => {
    const result=spawnSync(process.execPath,[require.resolve('@playwright/test/cli'),'test','--config',path.join(__dirname,'playwright.config.cts'),'--list','--reporter=json'],{
        cwd:path.resolve(__dirname,'../../..'),env:{...process.env,E2E_NATIVE:'0',E2E_FIXED_INPUTS:'1'},encoding:'utf8',timeout:15000});
    assert.equal(result.status,0,result.stderr);
    const collect=suite=>[...(suite.specs||[]),...(suite.suites||[]).flatMap(collect)];
    const cases=JSON.parse(result.stdout).suites.flatMap(collect).flatMap(spec=>spec.tests.map(entry=>({...entry,file:spec.file,title:spec.title})));
    assert.equal(cases.length,28);
    assert.equal(cases.filter(entry=>entry.file==='fixed-inputs.spec.cts').length,5);
    assert.equal(cases.filter(entry=>entry.file==='block-icon-preview.spec.cts').length,2);
    assert.equal(cases.filter(entry=>entry.file==='preview-sample.spec.cts').length,1);
    assert.equal(cases.filter(entry=>entry.title==='real mobile context keeps the shared review and bulk controls inside the visual viewport').length,1);
    for (const entry of cases) assert.equal(entry.expectedStatus,'passed');
});
