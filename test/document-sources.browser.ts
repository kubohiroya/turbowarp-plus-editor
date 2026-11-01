import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {installDocumentSourceMarker} from '@kubohiroya/turbowarp-document-source';

const evidence=process.env.TW_SOURCE_EVIDENCE;
const owner='twpesourcefixture';
const source=(volume=10)=>`# preserved comment\nvolume: ${volume}\nmode: rehearsal\n`;
// Test-only owner: the shared registry supplies source locations to any provider, not one App.
async function fixture() {
    const project={targets:[{isStage:true,name:'Stage',blocks:{},comments:{}}],extensionStorage:{[owner]:{documents:{settings:source()}},unrelated:{keep:'unchanged'}},extensions:[owner],extensionURLs:{[owner]:'data:unchanged'}};
    installDocumentSourceMarker(project,{opcode:`${owner}_sourceDocument`,reference:{providerId:owner,documentId:'settings'}});
    return project;
}

const fixtureCode=`
import {mountDocumentEditor} from '@kubohiroya/turbowarp-document-editor';
import {getDocumentSourceRegistry} from '@kubohiroya/turbowarp-document-source';
import YAML from 'yaml';
const owner=${JSON.stringify(owner)};
const project=await (await fetch('/fixture.json')).json();
const listeners=new Map();const on=(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);};const off=(name,fn)=>listeners.get(name)?.delete(fn);
const emit=name=>[...(listeners.get(name)||[])].forEach(fn=>fn());
const targetData=project.targets[0],blockData=targetData.blocks;
const blocks={getBlock:id=>blockData[id],createBlock:block=>{blockData[block.id]=block},deleteBlock:id=>delete blockData[id],resetCache(){},_blocks:blockData};
const target={id:'stage',isStage:true,isOriginal:true,name:'Stage',getName:()=>targetData.name,blocks,comments:targetData.comments};
const calls={save:0,load:0,stop:0};
const vm={runtime:{targets:[target],extensionStorage:project.extensionStorage,on,off,emitProjectChanged(){emit('PROJECT_CHANGED')}},editingTarget:target,toJSON:()=>JSON.stringify(project),on,off,emit,stopAll(){calls.stop++},saveProjectSb3(){calls.save++;throw Error('Archive save forbidden')},loadProject(){calls.load++;throw Error('Archive reload forbidden')}};
const documents=()=>vm.runtime.extensionStorage[owner].documents;
const check=text=>{const value=YAML.parse(text);if(value===null||typeof value!=='object'||!Number.isInteger(value.volume))throw new Error('Settings must define an integer volume.');};
const provider={id:owner,hatOpcodes:[owner+'_sourceDocument'],
    list:()=>[{documentId:'settings',filename:'settings.yml',format:'yaml',representations:[{kind:'yaml-blocks',label:'YAML blocks',fromSource:true,toSource:true}]}],
    open(){const prepared=new WeakSet();return {
        inspect:()=>({available:true}),
        capture:()=>Object.freeze({source:documents().settings,sourceName:'settings.yml'}),
        async prepare(snapshot,text){check(text);const value=Object.freeze({source:text});prepared.add(value);return value;},
        async commit(snapshot,value){if(!prepared.has(value))throw new Error('Unknown prepared edit.');documents().settings=value.source;vm.runtime.emitProjectChanged();return {source:value.source};},
        dispose(){}
    };}};
getDocumentSourceRegistry(vm).register(provider,{sourceStorageId:owner,dialogTitle:{ja:'設定データ',en:'Settings data'},fetch:window.fetch.bind(window),
    buildSourceCandidate({project:copy,reference,source:text}){check(text);copy.extensionStorage[owner].documents[reference.documentId]=text;return {project:copy,source:text};}});
class FieldImage {constructor(element){this.fieldGroup_=element;this.imageElement_={};}setTooltip(){}}
const id=Object.keys(blockData).find(id=>blockData[id].opcode===owner+'_sourceDocument');
const block={id,type:blockData[id].opcode,isInFlyout:false,isShadow:()=>false,isEditable:()=>true,getFieldValue:name=>blockData[id].fields[name]?.[0],inputList:[{fieldRow:[new FieldImage(document.getElementById('hat'))]}]};
const workspace={options:{readOnly:false},getAllBlocks:()=>[block],getBlockById:other=>other===id?block:null,isDragging:()=>false,addChangeListener(){},removeChangeListener(){}};
const blockly={FieldImage,getMainWorkspace:()=>workspace,Extensions:{register(){}}};
window.Scratch={vm,gui:{getBlockly:async()=>blockly}};
window.fixture={vm,project,calls,ui:mountDocumentEditor({vm,document,documentSources:true,language:new URLSearchParams(location.search).get('lang')||'ja'})};
`;

test('test-only owner: URL preview/cancel/save, fresh reload and embedded import are local differential transactions',async()=>{
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'document-source-browser-'));
    let server,browser;
    try {
        const project=await fixture();
        await fs.writeFile(path.join(directory,'fixture.json'),JSON.stringify(project));
        await build({stdin:{contents:fixtureCode,resolveDir:process.cwd(),loader:'js'},outfile:path.join(directory,'fixture.js'),bundle:true,platform:'browser',format:'esm',logLevel:'silent'});
        server=http.createServer(async(req,res)=>{
            if(req.url.startsWith('/__twpe_yaml')){res.writeHead(404);res.end('{}');return;}
            const filename=new URL(req.url,'http://localhost').pathname.slice(1);
            if(!filename){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="ja"><head><meta charset="utf-8"></head><body><h1>データソースのローカル操作検証</h1><svg width="500" height="80"><g id="hat"><rect x="10" y="10" width="300" height="60" rx="15" fill="#8a6230"/><text x="30" y="45" fill="white">データソース settings.yml</text></g></svg><script type="module" src="/fixture.js"></script></body></html>');return;}
            try{res.setHeader('Content-Type',filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':'application/json');res.end(await fs.readFile(path.join(directory,filename)));}catch{res.writeHead(404);res.end();}
        });
        await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
        const url='http://127.0.0.1:'+server.address().port+'/?twPlusDocumentSource=1';
        const executablePath=process.env.TWPE_CHROME_EXECUTABLE||process.env.CHROME_PATH;
        browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
        const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        let remote=source(20),requests=0;
        await page.route('https://settings.example.test/**',route=>{requests++;return route.fulfill({status:200,contentType:'text/yaml',headers:{'Access-Control-Allow-Origin':'*'},body:remote});});
        await page.goto(url);await page.waitForFunction(()=>Boolean(window.fixture));
        const initial=await page.evaluate(()=>JSON.stringify(window.fixture.project));
        const open=async()=>{await page.locator('#hat').click();await page.getByRole('dialog',{name:'設定データ'}).waitFor();await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('.twpe-yaml-save').disabled);};
        await open();
        assert.equal(await page.getByRole('tab').count(),2);
        await page.getByLabel('参照元',{exact:true}).selectOption('url');
        await page.getByRole('textbox',{name:'HTTPS URL',exact:true}).fill('https://settings.example.test/settings.yml');
        assert.equal(await page.locator('.twpe-yaml-save').isDisabled(),true);
        await page.getByRole('button',{name:'取得してプレビュー'}).click();
        await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('.twpe-yaml-save').disabled);
        assert.equal(await page.getByRole('textbox',{name:'YAMLテキスト',exact:true}).inputValue(),remote);
        assert.equal(await page.evaluate(()=>JSON.stringify(window.fixture.project)),initial);
        await page.getByRole('button',{name:'キャンセル',exact:true}).click();
        assert.equal(await page.evaluate(()=>JSON.stringify(window.fixture.project)),initial);

        await open();
        await page.getByLabel('参照元',{exact:true}).selectOption('url');
        await page.getByRole('textbox',{name:'HTTPS URL',exact:true}).fill('https://settings.example.test/settings.yml');
        await page.getByRole('button',{name:'取得してプレビュー'}).click();
        await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('.twpe-yaml-save').disabled);
        const beforeSaveRequests=requests;
        await page.locator('.twpe-yaml-save').click();
        await page.getByRole('dialog').waitFor({state:'hidden'});
        assert.equal(requests,beforeSaveRequests,'Save must reuse its exact fetched and validated preview');
        assert.equal(await page.evaluate(()=>Object.values<{url: string}>(window.fixture.project.extensionStorage.twpesourcefixture.documentSourceLocations.urls)[0].url),'https://settings.example.test/settings.yml');
        remote=source(30);
        await open();
        assert.equal(await page.getByRole('textbox',{name:'YAMLテキスト',exact:true}).inputValue(),remote);
        assert.equal(await page.getByRole('tab',{name:'YAMLブロック',exact:true}).isDisabled(),true);
        assert.equal(await page.getByRole('button',{name:'外部エディタで編集'}).isDisabled(),true);
        if(evidence){await fs.mkdir(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,'url-source-preview.png')});}

        await page.getByLabel('参照元',{exact:true}).selectOption('embedded-file');
        await page.getByRole('button',{name:'取得してプレビュー'}).click();
        await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('.twpe-yaml-save').disabled);
        await page.locator('.twpe-yaml-save').click();await page.getByRole('dialog').waitFor({state:'hidden'});
        const saved=await page.evaluate(()=>({project:window.fixture.project,calls:window.fixture.calls}));
        assert.equal(saved.project.extensionStorage.twpesourcefixture.documentSourceLocations,undefined);
        assert.equal(saved.project.extensionStorage.twpesourcefixture.documents.settings,remote);
        assert.deepEqual(saved.project.extensionStorage.unrelated,{keep:'unchanged'});
        assert.deepEqual(saved.project.targets,project.targets);
        assert.deepEqual(saved.calls,{save:0,load:0,stop:0});
        await open();assert.equal(await page.getByRole('tab',{name:'YAMLブロック',exact:true}).isEnabled(),true);
        await page.getByLabel('参照元',{exact:true}).selectOption('url');
        await page.getByRole('textbox',{name:'HTTPS URL',exact:true}).fill('https://settings.example.test/invalid.yml');remote='not settings';
        const beforeInvalid=await page.evaluate(()=>JSON.stringify(window.fixture.project));
        await page.getByRole('button',{name:'取得してプレビュー'}).click();await page.locator('.twpe-yaml-error').filter({hasText:/./}).waitFor();
        assert.equal(await page.locator('.twpe-yaml-save').isDisabled(),true);
        assert.equal(await page.evaluate(()=>JSON.stringify(window.fixture.project)),beforeInvalid);
        await page.getByRole('button',{name:'キャンセル',exact:true}).click();
        assert.deepEqual(errors,[]);
        if(evidence)await fs.writeFile(path.join(evidence,'browser-result.json'),JSON.stringify({passed:true,requests,errors,calls:saved.calls,originalProjectRetainedOnCancel:true,saveReusedPreview:true,urlReplacedWithEmbeddedFile:true},null,2));
        await page.close();
    } finally {await browser?.close();await new Promise<void>(resolve=>server?server.close(resolve):resolve());await fs.rm(directory,{recursive:true,force:true});}
});
