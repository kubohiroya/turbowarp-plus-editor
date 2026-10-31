import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const evidence=process.env.TW_SOURCE_EVIDENCE;
const source=(wait=1)=>`# preserved comment\nkamishibai: '4.0'\ncontrols:\n  keymaps:\n    production:\n      Space: navigation.nextAction\nscenes:\n  opening:\n    - wait: ${wait}\n`;
async function fixture() {
    const appRoot=path.dirname(fileURLToPath(import.meta.resolve('@kubohiroya/turbowarp-kamishibai-app/package.json')));
    const module=name=>import(pathToFileURL(path.join(appRoot,'dist/dsl4',name+'.js')).href);
    const [{createDsl4ProductionSourceFrontend},{createDsl4EmbeddedAssetBundle},{createEmbeddedYamlSourceGraphRecord,composeGraphComponent},{installDsl4EmbeddedYamlRoot},{installEmbeddedYamlMarker}]=await Promise.all([module('production-source-frontend'),module('asset-bundle-descriptor'),module('embedded-yaml-source-graph'),module('embedded-yaml-hat'),import('@kubohiroya/turbowarp-document-source')]);
    const schema=JSON.parse(await fs.readFile(path.join(appRoot,'schema/dsl-4.schema.json'),'utf8'));
    const frontend=createDsl4ProductionSourceFrontend(schema),parsed=frontend.parse(source(),{sourceId:'story'});
    assert.equal(parsed.ok,true);
    const assets=await createDsl4EmbeddedAssetBundle(parsed.storyDocument,{manifest:{formatVersion:1,assets:[]},getFile:()=>new Uint8Array()},{maxFiles:10,maxTotalBytes:4096});
    const graph=await createEmbeddedYamlSourceGraphRecord({entryPath:'main.k4.yml',files:{'main.k4.yml':source()}});
    const component=await composeGraphComponent({source:{sourceId:'story',displayName:'main.k4.yml'},artifact:{controlProfile:'production'},application:{mode:'story'},assets},graph,frontend);
    const project={targets:[{isStage:true,name:'Stage',blocks:{},comments:{}}],extensionStorage:{kubohiroyakamishibai4:{components:{kubohiroyakamishibairuntime4:structuredClone(component)}},unrelated:{keep:'unchanged'}},extensions:['kubohiroyakamishibai4'],extensionURLs:{kubohiroyakamishibai4:'data:unchanged'}};
    installEmbeddedYamlMarker(project,{opcode:'kubohiroyakamishibai4_kubohiroyakamishibairuntime4__embeddedYaml',reference:{providerId:'kamishibai-dsl4',documentId:'file:main.k4.yml'}});
    installDsl4EmbeddedYamlRoot(project,{channel:'bundled'});
    return project;
}

const fixtureCode=`
import {mountDocumentEditor} from '@kubohiroya/turbowarp-document-editor';
import {registerKamishibaiDocumentSourceProvider} from '@kubohiroya/turbowarp-kamishibai-app/document-source';
const project=await (await fetch('/fixture.json')).json();
const listeners=new Map();const on=(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);};const off=(name,fn)=>listeners.get(name)?.delete(fn);
const emit=name=>[...(listeners.get(name)||[])].forEach(fn=>fn());
const targetData=project.targets[0],blockData=targetData.blocks;
const blocks={getBlock:id=>blockData[id],createBlock:block=>{blockData[block.id]=block},deleteBlock:id=>delete blockData[id],resetCache(){},_blocks:blockData};
const target={id:'stage',isStage:true,isOriginal:true,name:'Stage',getName:()=>targetData.name,blocks,comments:targetData.comments};
const calls={save:0,load:0,stop:0};
const vm={runtime:{targets:[target],extensionStorage:project.extensionStorage,on,off,emitProjectChanged(){emit('PROJECT_CHANGED')}},editingTarget:target,toJSON:()=>JSON.stringify(project),on,off,emit,stopAll(){calls.stop++},saveProjectSb3(){calls.save++;throw Error('Archive save forbidden')},loadProject(){calls.load++;throw Error('Archive reload forbidden')}};
class FieldImage {constructor(element){this.fieldGroup_=element;this.imageElement_={};}setTooltip(){}}
const id=Object.keys(blockData).find(id=>blockData[id].opcode.endsWith('__embeddedYaml'));
const block={id,type:blockData[id].opcode,isInFlyout:false,isShadow:()=>false,isEditable:()=>true,getFieldValue:name=>blockData[id].fields[name]?.[0],inputList:[{fieldRow:[new FieldImage(document.getElementById('hat'))]}]};
const workspace={options:{readOnly:false},getAllBlocks:()=>[block],getBlockById:other=>other===id?block:null,isDragging:()=>false,addChangeListener(){},removeChangeListener(){}};
const blockly={FieldImage,getMainWorkspace:()=>workspace,Extensions:{register(){}}};
window.Scratch={vm,gui:{getBlockly:async()=>blockly}};
registerKamishibaiDocumentSourceProvider(vm,{documentViewsEnabled:true,sourceFetch:window.fetch.bind(window)});
window.fixture={vm,project,calls,ui:mountDocumentEditor({vm,document,documentSources:true,language:new URLSearchParams(location.search).get('lang')||'ja'})};
`;

test('real App owner: URL preview/cancel/save, fresh reload and embedded import are local differential transactions',async()=>{
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'document-source-browser-'));
    let server,browser;
    try {
        const project=await fixture();
        await fs.writeFile(path.join(directory,'fixture.json'),JSON.stringify(project));
        await build({stdin:{contents:fixtureCode,resolveDir:process.cwd(),loader:'js'},outfile:path.join(directory,'fixture.js'),bundle:true,platform:'browser',format:'esm',logLevel:'silent'});
        server=http.createServer(async(req,res)=>{
            if(req.url.startsWith('/__twpe_yaml')){res.writeHead(404);res.end('{}');return;}
            const filename=new URL(req.url,'http://localhost').pathname.slice(1);
            if(!filename){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="ja"><head><meta charset="utf-8"></head><body><h1>データソースのローカル操作検証</h1><svg width="500" height="80"><g id="hat"><rect x="10" y="10" width="300" height="60" rx="15" fill="#8a6230"/><text x="30" y="45" fill="white">YAML　台本データ main.k4.yml</text></g></svg><script type="module" src="/fixture.js"></script></body></html>');return;}
            try{res.setHeader('Content-Type',filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':'application/json');res.end(await fs.readFile(path.join(directory,filename)));}catch{res.writeHead(404);res.end();}
        });
        await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
        const url='http://127.0.0.1:'+server.address().port+'/?twPlusDocumentSource=1';
        browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
        const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        let remote=source(2),requests=0;
        await page.route('https://story.example.test/**',route=>{requests++;return route.fulfill({status:200,contentType:'text/yaml',headers:{'Access-Control-Allow-Origin':'*'},body:remote});});
        await page.goto(url);await page.waitForFunction(()=>Boolean(window.fixture));
        const initial=await page.evaluate(()=>JSON.stringify(window.fixture.project));
        const open=async()=>{await page.locator('#hat').click();await page.getByRole('dialog',{name:'紙芝居台本データ'}).waitFor();await page.waitForFunction(()=>!document.querySelector('.twpe-yaml-save').disabled);};
        await open();
        assert.equal(await page.getByRole('tab').count(),3);
        await page.getByLabel('参照元',{exact:true}).selectOption('url');
        await page.getByRole('textbox',{name:'HTTPS URL',exact:true}).fill('https://story.example.test/main.k4.yml');
        assert.equal(await page.locator('.twpe-yaml-save').isDisabled(),true);
        await page.getByRole('button',{name:'取得してプレビュー'}).click();
        await page.waitForFunction(()=>!document.querySelector('.twpe-yaml-save').disabled);
        assert.equal(await page.getByRole('textbox',{name:'YAMLテキスト',exact:true}).inputValue(),remote);
        assert.equal(await page.evaluate(()=>JSON.stringify(window.fixture.project)),initial);
        await page.getByRole('button',{name:'キャンセル',exact:true}).click();
        assert.equal(await page.evaluate(()=>JSON.stringify(window.fixture.project)),initial);

        await open();
        await page.getByLabel('参照元',{exact:true}).selectOption('url');
        await page.getByRole('textbox',{name:'HTTPS URL',exact:true}).fill('https://story.example.test/main.k4.yml');
        await page.getByRole('button',{name:'取得してプレビュー'}).click();
        await page.waitForFunction(()=>!document.querySelector('.twpe-yaml-save').disabled);
        const beforeSaveRequests=requests;
        await page.locator('.twpe-yaml-save').click();
        await page.getByRole('dialog').waitFor({state:'hidden'});
        assert.equal(requests,beforeSaveRequests,'Save must reuse its exact fetched and validated preview');
        assert.equal(await page.evaluate(()=>Object.values(window.fixture.project.extensionStorage.kubohiroyakamishibai4.documentSourceLocations.urls)[0].url),'https://story.example.test/main.k4.yml');
        remote=source(3);
        await open();
        assert.equal(await page.getByRole('textbox',{name:'YAMLテキスト',exact:true}).inputValue(),remote);
        assert.equal(await page.getByRole('tab',{name:'YAMLブロック',exact:true}).isDisabled(),true);
        assert.equal(await page.getByRole('button',{name:'外部エディタで編集'}).isDisabled(),true);
        if(evidence){await fs.mkdir(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,'url-source-preview.png')});}

        await page.getByLabel('参照元',{exact:true}).selectOption('embedded-file');
        await page.getByRole('button',{name:'取得してプレビュー'}).click();
        await page.waitForFunction(()=>!document.querySelector('.twpe-yaml-save').disabled);
        await page.locator('.twpe-yaml-save').click();await page.getByRole('dialog').waitFor({state:'hidden'});
        const saved=await page.evaluate(()=>({project:window.fixture.project,calls:window.fixture.calls}));
        assert.equal(saved.project.extensionStorage.kubohiroyakamishibai4.documentSourceLocations,undefined);
        assert.equal(saved.project.extensionStorage.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4.sourceDocuments.files['main.k4.yml'].source,remote);
        assert.deepEqual(saved.project.extensionStorage.unrelated,{keep:'unchanged'});
        assert.deepEqual(saved.project.targets,project.targets);
        assert.deepEqual(saved.calls,{save:0,load:0,stop:0});
        await open();assert.equal(await page.getByRole('tab',{name:'YAMLブロック',exact:true}).isEnabled(),true);
        await page.getByLabel('参照元',{exact:true}).selectOption('url');
        await page.getByRole('textbox',{name:'HTTPS URL',exact:true}).fill('https://story.example.test/invalid.k4.yml');remote='not a script';
        const beforeInvalid=await page.evaluate(()=>JSON.stringify(window.fixture.project));
        await page.getByRole('button',{name:'取得してプレビュー'}).click();await page.locator('.twpe-yaml-error').filter({hasText:/./}).waitFor();
        assert.equal(await page.locator('.twpe-yaml-save').isDisabled(),true);
        assert.equal(await page.evaluate(()=>JSON.stringify(window.fixture.project)),beforeInvalid);
        await page.getByRole('button',{name:'キャンセル',exact:true}).click();
        assert.deepEqual(errors,[]);
        if(evidence)await fs.writeFile(path.join(evidence,'browser-result.json'),JSON.stringify({passed:true,requests,errors,calls:saved.calls,originalProjectRetainedOnCancel:true,saveReusedPreview:true,urlReplacedWithEmbeddedFile:true},null,2));
        await page.close();
    } finally {await browser?.close();await new Promise(resolve=>server?server.close(resolve):resolve());await fs.rm(directory,{recursive:true,force:true});}
});
