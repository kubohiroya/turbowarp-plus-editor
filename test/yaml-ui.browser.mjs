import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { chromium } from "@playwright/test";
import { build } from "esbuild";

let browser, server, directory, base;
const requests = [];
const harness = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>html,body{height:100%;margin:0}#app{height:100%;background:#eee}.fixture-gui-screen{position:absolute;inset:0;background:#eee}svg{position:absolute;top:100px;left:50px}</style><link rel="stylesheet" href="yaml-editor/ui.css"></head><body><div id="app"><div class="fixture-gui-screen">Editor fixture<svg width="600" height="120"><g id="hat-icon"><rect width="50" height="40" fill="purple"/><text y="25" fill="white">One</text></g><g id="hat-two" transform="translate(100,0)"><rect width="50" height="40" fill="purple"/></g><g id="hat-pref" transform="translate(200,0)"><rect width="50" height="40" fill="blue"/></g><g id="flyout-icon" transform="translate(300,0)"><rect width="50" height="40" fill="gray"/></g><g id="other-icon" transform="translate(400,0)"><rect width="50" height="40" fill="green"/></g></svg></div></div><script type="module">
import {mountYamlEditor} from './yaml-editor/client.js';
import {getSourceDocumentRegistry as getProviderRegistry, encodeSourceDocumentReference as encodeReference} from './fixture-document.js';
const state=window.fixture={docs:{'notes:one':'theme: light','notes:two':'# user comment\\r\\ntitle: second\\r\\n','preferences:one':'{\"mode\":\"compact\"}\\r\\n'},sessions:{},calls:[],available:true,delayed:false,generation:0};
const listeners={},vmListeners={};const on=(map,name,fn)=>(map[name]??=new Set()).add(fn);const off=(map,name,fn)=>map[name]?.delete(fn);const emit=(map,name)=>[...(map[name]||[])].forEach(fn=>fn());
class FieldImage{constructor(element){this.fieldGroup_=element;this.imageElement_={tooltip:null}}setTooltip(value){this.imageElement_.tooltip=value}}
const references={'hat-one':{providerId:'notes',documentId:'one'},'hat-two':{providerId:'notes',documentId:'two'},'hat-pref':{providerId:'preferences',documentId:'one'}};
const makeBlock=(id,element,type,isInFlyout=false)=>({id,type,isInFlyout,isShadow:()=>false,isEditable:()=>true,getFieldValue:name=>name==='DOCUMENT'?encodeReference(references[id]||references['hat-one']):null,inputList:[{fieldRow:[new FieldImage(document.getElementById(element))]}]});
const blocks=[makeBlock('hat-one','hat-icon','notes_embeddedYaml'),makeBlock('hat-two','hat-two','notes_embeddedYaml'),makeBlock('hat-pref','hat-pref','preferences_embeddedYaml'),makeBlock('hat-flyout','flyout-icon','notes_embeddedYaml',true),makeBlock('other','other-icon','unrelated_extension')];
const workspaceListeners=new Set();const workspace={options:{readOnly:false},isFlyout:false,isDragging:()=>false,getAllBlocks:()=>blocks,getBlockById:id=>blocks.find(b=>b.id===id),addChangeListener:fn=>workspaceListeners.add(fn),removeChangeListener:fn=>workspaceListeners.delete(fn)};
const vm={editingTarget:{id:'stage',blocks:{getBlock:id=>{const b=blocks.find(b=>b.id===id);return b?{opcode:b.type,fields:{DOCUMENT:{value:encodeReference(references[id]||references['hat-one'])}}}:null}}},runtime:{on:(name,fn)=>on(listeners,name,fn),off:(name,fn)=>off(listeners,name,fn)},on:(name,fn)=>on(vmListeners,name,fn),off:(name,fn)=>off(vmListeners,name,fn),stopAll(){state.calls.push('stop')},async saveProjectSb3(){state.calls.push('save');return new Blob([JSON.stringify(state.docs)])}};
const blockly={FieldImage,Extensions:{register(name,callback){(state.shapeRegistrations??=[]).push(name);state.shapeCallback=callback}},getMainWorkspace:()=>workspace};
window.Scratch={vm,gui:{getBlockly:()=>new URLSearchParams(location.search).has('late')?new Promise(resolve=>{state.resolveBlocks=()=>resolve(blockly)}):Promise.resolve(blockly)}};
const registry=getProviderRegistry(vm);const openDocument=(providerId,documentId)=>{const documentKey=providerId+':'+documentId;let disposed=false;const candidates=new WeakMap();return{inspect(){return{available:!disposed&&state.available,reason:'This test document is unavailable.'}},capture(){if(disposed)throw new Error('Document disposed');return Object.freeze({source:state.docs[documentKey],sourceName:'settings.yml',generation:state.generation})},...(state.noPreview?{}:{async previewRepresentation(snapshot,request){(state.previewCalls??=[]).push(request.kind);if(state.recordPreviewPaint){const loading=[...document.querySelectorAll('.twpe-yaml-dialog [role=status]')].find(node=>node.textContent==='プレビューを表示しています…');(state.previewObservations??=[]).push({kind:request.kind,frame:state.previewPaintFrame||0,selected:document.querySelector('[role=tab][aria-selected=true]')?.dataset.kind,loading:!!loading&&!loading.hidden&&loading.getClientRects().length>0,saveDisabled:document.querySelector('.twpe-yaml-save').disabled})}if(state.delayPreviewKind===request.kind)await new Promise(resolve=>(state.previewResolvers??={})[request.kind]=resolve);if(state.failPreviewKind===request.kind)throw Error('Preview unavailable');return{kind:request.kind,source:state.previewSource||state.docs[documentKey],blocks:{preview:{opcode:'fixture_preview',topLevel:true,parent:null,next:null,inputs:{},fields:{}}},rootIds:['preview'],blockDefinitions:[]}}}),async prepare(snapshot,source){state.calls.push('prepare:'+documentKey);if(state.delayPrepare)await new Promise(resolve=>state.resolvePrepare=resolve);if(source==='bad yaml')throw new Error('Invalid YAML at line 1');if(snapshot.generation!==state.generation)throw new Error('Project changed');return{source}},async commit(snapshot,prepared){state.commitStarted=true;if(state.delayCommit)await new Promise(resolve=>state.resolveCommit=resolve);vm.stopAll();state.calls.push('commit:'+documentKey);if(state.pendingOwnerMetadata){state.ownerMetadata=structuredClone(state.pendingOwnerMetadata);delete state.pendingOwnerMetadata;}state.docs[documentKey]=prepared.source;return{source:prepared.source}},async prepareRepresentation(snapshot,request){state.lastRepresentationRequest=request;state.calls.push('prepare-representation:'+documentKey);if(state.delayRepresentationPrepare)await new Promise(resolve=>state.resolveRepresentationPrepare=resolve);if(state.failRepresentationPrepare)throw Error('Invalid block structure');if(snapshot.generation!==state.generation)throw new Error('Project changed');const candidate=Object.freeze({summary:'YAML block view: '+request.direction});candidates.set(candidate,{snapshot,request});return candidate},async commitRepresentation(snapshot,candidate){const owned=candidates.get(candidate);if(!owned||owned.snapshot!==snapshot||snapshot.generation!==state.generation)throw new Error('Project changed before conversion');if(state.failRepresentation){candidates.delete(candidate);state.calls.push('failed-representation:'+documentKey);throw Object.assign(Error('Load failed and rolled back'),{rollbackSucceeded:state.rollbackSucceeded===true});}state.commitDialogOpen=document.querySelector('.twpe-yaml-dialog').open;if(state.requireSecurity)await new Promise(resolve=>{const button=document.createElement('button');button.textContent='Approve fixture extension';button.id='fixture-security-approval';button.onclick=()=>{button.remove();resolve()};document.body.append(button)});if(state.failAfterSecurity)throw Error('Extension approval failed');if(state.transientAvailability){state.available=false;window.ui.refresh();state.statusDuringCommit=document.querySelector('.twpe-yaml-dialog [role=status]').textContent;state.available=true;}state.calls.push('commit-representation:'+documentKey);if(owned.request.direction==='from-source'&&owned.request.kind===state.activeKind&&state.blocksSource!==undefined)state.docs[documentKey]=state.blocksSource;state.activeKind=owned.request.direction==='from-source'?owned.request.kind:'source';if(state.moveTargetOnCommit)vm.editingTarget=vm.runtime.targets.find(t=>t.id==='sprite');state.generation++;emit(listeners,'RUNTIME_DISPOSED');emit(listeners,'PROJECT_LOADED');return{source:state.docs[documentKey]}},dispose(){disposed=true}}};
state.unregisterNotes=registry.register({id:'notes',hatOpcodes:['notes_embeddedYaml'],list:()=>[{documentId:'one',filename:'settings.yml',format:'yaml',docsURL:'https://example.test/dsl/notes',activeRepresentation:state.activeKind||'source',representations:state.withoutRepresentations?[]:[{kind:'yaml-blocks',label:'共通YAMLブロック',fromSource:true,toSource:true,fromRepresentations:state.allowCross?['yaml-blocks','schema-blocks']:['yaml-blocks']},{kind:'schema-blocks',label:'Owner schema label',fromSource:!state.crossOnly,toSource:true,fromRepresentations:state.allowCross?['schema-blocks','yaml-blocks']:['schema-blocks']}],schema:{id:'urn:test:notes-schema',schema:{type:'object',properties:{theme:{type:'string'}}}}},{documentId:'two',filename:'settings.yml',format:'yaml'}],open:id=>openDocument('notes',id)});
registry.register({id:'preferences',hatOpcodes:['preferences_embeddedYaml'],list:()=>[{documentId:'one',filename:'settings.yml',format:'json'}],open:id=>openDocument('preferences',id)});
let nextId=0;
const fetcher=async(route,options)=>{state.calls.push({route,method:options.method||'GET',headers:options.headers,...(options.body?{body:JSON.parse(options.body)}:{})});const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});if(route.endsWith('/config'))return json({available:true,token:'fixture-token',maxSourceBytes:4194304});if(options.method==='POST'&&!route.endsWith('/sessions')){const id=route.split('/').at(-1);if(state.failReopen)throw Error('VSCode launch failed');return json({id,opened:true})}if(options.method==='POST'){const id='session-'+(++nextId);state.sessions[id]={source:JSON.parse(options.body).source,closed:false};if(state.delayPost)return new Promise(resolve=>state.resolvePost=()=>resolve(json({id,revision:1,opened:true})));return json({id,revision:1,opened:true})}const id=route.split('/').at(-1);if(options.method==='DELETE'){state.sessions[id].closed=true;return json({closed:true})}if(state.delayed)return new Promise(resolve=>state.resolveSaved=()=>resolve(json({id,revision:2,source:state.sessions[id].source})));return json({id,revision:2,source:state.sessions[id].source})};
window.ui=mountYamlEditor({vm,fetch:fetcher,download:async(blob,name)=>{state.download={source:await blob.text(),name}}});state.setRemote=source=>{state.sessions[window.ui.getState().session.id].source=source};state.setReference=(id,reference)=>{references[id]=reference;window.ui.refresh()};window.replaceProject=()=>{state.generation++;emit(listeners,'RUNTIME_DISPOSED');emit(listeners,'PROJECT_LOADED');emit(vmListeners,'PROJECT_LOADED')};await window.ui.ready;window.fixtureReady=true;
</script></body></html>`;

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "twpe-yaml-ui-"));
  await fs.writeFile(
    path.join(directory, "editor.html"),
    '<html><head></head><body><div id="app"></div></body></html>',
  );
  await fs.mkdir(path.join(directory, "yaml-editor"));
  for (const name of ["ui.css", "bootstrap.js", "feature-flags.js"])
    await fs.copyFile(
      new URL("../site/yaml-editor/" + name, import.meta.url),
      path.join(directory, "yaml-editor", name),
    );
  // Boundary tests replace only rendering; real ScratchBlocks rendering is checked separately.
  await build({
    entryPoints: [
      "site/yaml-editor/client.js",
      "site/yaml-editor/root-shape-bootstrap.js",
    ],
    bundle: true,
    platform: "browser",
    format: "esm",
    outdir: path.join(directory, "yaml-editor"),
    plugins: [
      {
        name: "fixture-preview-port",
        setup(builder) {
          builder.onResolve({ filter: /\/block-preview\.js$/ }, () => ({
            path: "fixture-preview",
            namespace: "fixture",
          }));
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: `export async function renderBlockPreview({container,model,signal}){signal?.addEventListener('abort',()=>{(window.fixture.abortedPreviews??=[]).push(model.kind)},{once:true});const node=document.createElement('div');node.dataset.fixturePreviewKind=model.kind;node.textContent=model.kind;container.append(node);(window.fixture.renderedPreviews??=[]).push(model.kind);if(window.fixture.delayRenderKind===model.kind)await new Promise(resolve=>(window.fixture.renderResolvers??={})[model.kind]=resolve);return{dispose(){node.remove();(window.fixture.disposedPreviews??=[]).push(model.kind)}}}`,
            loader: "js",
          }));
        },
      },
    ],
  });

  // An independently bundled canonical registry is shared with the product bundle through the VM.
  await build({
    entryPoints: [
      import.meta
        .resolve("@kubohiroya/turbowarp-document-data/composition")
        .replace(/^file:\/\//u, ""),
    ],
    bundle: true,
    platform: "browser",
    format: "esm",
    outfile: path.join(directory, "fixture-document.js"),
  });
  server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    requests.push(url.pathname);
    const file = url.pathname.replace("/turbowarp-plus-editor/", "");
    if (file === "fixture.html") {
      response.setHeader("Content-Type", "text/html");
      response.end(harness);
      return;
    }
    if (file === "off.html") {
      response.setHeader("Content-Type", "text/html");
      response.end(
        `<html><head><script>
         const state=window.shapeFixture={eagerCalls:0,lazyCalls:0,registered:[]};
         const blockly={Extensions:{register(name,callback){state.registered.push(name);callback.call({setPreviousStatement(value){state.previous=value},setNextStatement(value){state.next=value}})}}};
         window.Scratch={gui:{getBlocklyEagerly:async()=>{state.eagerCalls++;return blockly},getBlockly:async()=>{state.lazyCalls++;throw Error('The eager block API should be used')}}};
         </script><script type="module" src="yaml-editor/bootstrap.js"></script></head><body><div id="app"></div></body></html>`,
      );
      return;
    }
    try {
      if (
        (!file.startsWith("yaml-editor/") && file !== "fixture-document.js") ||
        file.includes("..")
      )
        throw new Error();
      response.setHeader(
        "Content-Type",
        file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".svg")
            ? "image/svg+xml"
            : "text/javascript",
      );
      response.end(await fs.readFile(path.join(directory, file)));
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}/turbowarp-plus-editor/`;
  browser = await chromium.launch({
    headless: true,
    ...(process.env.TWPE_CHROME_EXECUTABLE
      ? { executablePath: process.env.TWPE_CHROME_EXECUTABLE }
      : {}),
  });
});
after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});
const icon = (page, id = "hat-icon") =>
  page.locator("#" + id + "[data-twpe-yaml-hat-icon]");
async function readyPage(page, language = "ja") {
  await page.goto(`${base}fixture.html?lang=${language}`);
  await page.waitForFunction(() => window.fixtureReady);
  await icon(page).waitFor();
}
async function startSelected(page) {
  await page
    .getByRole("button", { name: /^(VSCodeで編集|Edit in VSCode)$/u })
    .click();
  await page.waitForFunction(() => window.ui.getState().session);
}
async function startFromIcon(page, id = "hat-icon") {
  await icon(page, id).click();
  await startSelected(page);
}

test("VSCode can reopen an unchanged session and retry without losing a saved draft", async () => {
  const page = await browser.newPage();
  await readyPage(page);
  await startFromIcon(page);
  await page.waitForFunction(() => !window.ui.getState().pending);
  const id = await page.evaluate(() => window.ui.getState().session.id);
  const edit = page.getByRole("button", {name: "VSCodeで編集", exact: true});
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => !window.ui.getState().pending);
  assert.equal(await edit.isEnabled(), true);
  await edit.click();
  await page.waitForFunction(() => !window.ui.getState().pending);
  assert.equal(await page.evaluate(() => window.ui.getState().session.id), id);
  assert.equal(await page.evaluate(() => Object.keys(window.fixture.sessions).length), 1);
  await page.evaluate(() => {
    window.fixture.setRemote("# retained comment\\ntheme: dark");
    window.dispatchEvent(new Event("focus"));
  });
  await page.waitForFunction(() => !window.ui.getState().pending);
  const draft = await page.locator("#twpe-yaml-preview").inputValue();
  await page.evaluate(() => window.fixture.failReopen = true);
  await edit.click();
  await page.waitForFunction(() => !window.ui.getState().pending);
  assert.equal(await edit.isEnabled(), true);
  assert.equal(await page.evaluate(() => window.ui.getState().session.id), id);
  assert.equal(await page.locator("#twpe-yaml-preview").inputValue(), draft);
  await page.evaluate(() => window.fixture.failReopen = false);
  await edit.click();
  await page.waitForFunction(() => !window.ui.getState().pending);
  assert.equal(await page.locator("#twpe-yaml-preview").inputValue(), draft);
  assert.equal(await page.evaluate(() => window.fixture.docs['notes:one']), 'theme: light');
  assert.equal(await page.evaluate(() => window.fixture.calls.filter(c => c.route?.endsWith('/sessions') && c.method === 'POST').length), 1);
  await page.close();
});

async function drag(page, locator, dx, dy) {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, {steps: 6});
  await page.mouse.up();
}
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 2, `${actual} should equal ${expected}`); }

test("the title moves the dialog, all borders resize it, and maximize restores its geometry", async () => {
  const page = await browser.newPage({viewport: {width: 1440, height: 1100}});
  await readyPage(page);
  await open(page);
  const initial = await dialog(page).boundingBox();
  await drag(page, dialog(page).getByRole('heading'), 60, 45);
  let rect = await dialog(page).boundingBox();
  near(rect.x, initial.x + 60); near(rect.y, initial.y + 45);
  near(rect.width, initial.width); near(rect.height, initial.height);
  for (const edge of ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw']) {
    const before = await dialog(page).boundingBox();
    const dx = edge.includes('e') ? 12 : edge.includes('w') ? -12 : 0;
    const dy = edge.includes('s') ? 12 : edge.includes('n') ? -12 : 0;
    await drag(page, dialog(page).locator(`[data-edge="${edge}"]`), dx, dy);
    rect = await dialog(page).boundingBox();
    near(rect.width, before.width + (dx ? 12 : 0));
    near(rect.height, before.height + (dy ? 12 : 0));
    near(rect.x, before.x + (edge.includes('w') ? -12 : 0));
    near(rect.y, before.y + (edge.includes('n') ? -12 : 0));
  }
  const restored = rect;
  await dialog(page).getByRole('button', {name: '全画面化', exact: true}).click();
  rect = await dialog(page).boundingBox();
  assert.deepEqual(rect, {x: 0, y: 0, width: 1440, height: 1100});
  await drag(page, dialog(page).getByRole('heading'), 60, 30);
  assert.deepEqual(await dialog(page).boundingBox(), rect);
  await dialog(page).getByRole('button', {name: '元のサイズに戻す', exact: true}).click();
  assert.deepEqual(await dialog(page).boundingBox(), restored);
  assert.equal(await page.evaluate(() => window.fixture.calls.some(c => c.method === 'POST' || typeof c === 'string' && /prepare|commit/.test(c))), false);
  await page.close();
});

test("window controls stay reachable at minimum size, on narrow screens and after viewport changes", async () => {
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});
  await readyPage(page);
  await open(page);
  await drag(page, dialog(page).locator('[data-edge="se"]'), -1000, -1000);
  let rect = await dialog(page).boundingBox();
  near(rect.width, 360); near(rect.height, 280);
  await drag(page, dialog(page).getByRole('heading'), -1000, -1000);
  rect = await dialog(page).boundingBox();
  near(rect.x, 0); near(rect.y, 0);
  await page.setViewportSize({width: 390, height: 720});
  const maximize = dialog(page).getByRole('button', {name: '全画面化', exact: true});
  await maximize.click();
  assert.deepEqual(await dialog(page).boundingBox(), {x: 0, y: 0, width: 390, height: 720});
  await page.setViewportSize({width: 320, height: 500});
  assert.deepEqual(await dialog(page).boundingBox(), {x: 0, y: 0, width: 320, height: 500});
  await dialog(page).getByRole('button', {name: '元のサイズに戻す', exact: true}).click();
  rect = await dialog(page).boundingBox();
  assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 320 && rect.y + rect.height <= 500);
  const close = dialog(page).getByRole('button', {name: '閉じる', exact: true});
  for (const control of [close, maximize, cancel(page), footerSave(page)]) {
    const box = await control.boundingBox();
    assert.ok(box.x >= rect.x && box.y >= rect.y && box.x + box.width <= rect.x + rect.width && box.y + box.height <= rect.y + rect.height);
  }
  await close.click();
  await closed(page);
  await open(page);
  await page.keyboard.press('Escape');
  await closed(page);
  await page.close();
});

const dialog = (page) =>
  page.getByRole("dialog", { name: "組み込み文書", exact: true });
const footerSave = (page) =>
  dialog(page).getByRole("button", {
    name: "表示されている形式に変換して検証・保存",
    exact: true,
  });
const cancel = (page) =>
  dialog(page).getByRole("button", { name: "キャンセル", exact: true });
async function open(page) {
  await icon(page).click();
  await dialog(page).waitFor();
}
async function closed(page) {
  await dialog(page).waitFor({ state: "hidden" });
}
async function assertNoDownload(page) {
  assert.equal(
    await page.evaluate(
      () => window.fixture.calls.filter((c) => c === "save").length,
    ),
    0,
  );
  assert.equal(await page.evaluate(() => window.fixture.download), undefined);
}
async function selectConversion(page) {
  await page
    .getByRole("tab", { name: "共通YAMLブロック", exact: true })
    .click();
}
const confirmation = (page) =>
  page.getByRole("dialog", { name: /形式に変換しますか？$/u });
async function confirmConversion(page) {
  await confirmation(page)
    .getByRole("button", { name: "OK", exact: true })
    .click();
}
async function saveConversion(page) {
  await footerSave(page).click();
  await confirmConversion(page);
}

test("flag OFF initializes the stored root shape without importing the optional client, stylesheet or API", async () => {
  const page = await browser.newPage(),
    start = requests.length;
  await page.goto(base + "off.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => window.shapeFixture.registered.length === 1);
  assert.deepEqual(
    await page.evaluate(() => ({
      previous: window.shapeFixture.previous,
      next: window.shapeFixture.next,
      eagerCalls: window.shapeFixture.eagerCalls,
      lazyCalls: window.shapeFixture.lazyCalls,
    })),
    { previous: false, next: false, eagerCalls: 1, lazyCalls: 0 },
  );
  assert(
    requests
      .slice(start)
      .some((url) => url.endsWith("/root-shape-bootstrap.js")),
  );
  assert(
    !requests
      .slice(start)
      .some((url) => /client\.js|ui\.css|__twpe_yaml/u.test(url)),
  );
  await page.close();
});
test("the chooser has accessible X and bottom-right Cancel/Save, with no legacy download/import/end/apply controls", async () => {
  const page = await browser.newPage();
  await readyPage(page);
  await open(page);
  assert.equal(
    await dialog(page)
      .getByRole("button", { name: "閉じる", exact: true })
      .textContent(),
    "×",
  );
  assert.equal(
    await dialog(page)
      .locator(".twpe-yaml-footer")
      .getByRole("button")
      .allTextContents()
      .then((labels) => labels.join(",")),
    "キャンセル,表示されている形式に変換して検証・保存",
  );
  assert.equal(
    await dialog(page)
      .getByRole("button", {
        name: /SB3|変更を取り込む|外部編集を終了|変換を適用|変換候補|候補を取り消す|^JSON Schemaで検証$|^文書を検証$/u,
      })
      .count(),
    0,
  );
  assert.equal(
    await page.evaluate(
      () => window.fixture.calls.filter((c) => c.method === "POST").length,
    ),
    0,
  );
  await page.evaluate(() => {
    window.fixture.pendingOwnerMetadata = {
      entryPath: "selected-root.k4.yml",
      version: "4.0",
    };
  });
  await footerSave(page).click();
  await closed(page);
  assert.deepEqual(
    await page.evaluate(() =>
      window.fixture.calls.filter((c) => typeof c === "string"),
    ),
    ["prepare:notes:one", "stop", "commit:notes:one"],
  );
  assert.deepEqual(await page.evaluate(() => window.fixture.ownerMetadata), {
    entryPath: "selected-root.k4.yml",
    version: "4.0",
  });
  assert.equal(
    await page.evaluate(() => window.fixture.docs["notes:one"]),
    "theme: light",
  );
  assert.equal(
    await page.evaluate(() => Object.keys(window.fixture.sessions).length),
    0,
  );
  assert.equal(
    await page.evaluate(() => Boolean(window.ui.getState().session)),
    false,
  );
  assert.equal(
    await page.evaluate(
      () => window.fixture.calls.filter((c) => c.method === "POST").length,
    ),
    0,
  );
  await assertNoDownload(page);
  await page.close();
});
test("selecting a conversion only stages a request and Cancel/X discard without preparing or changing the VM", async () => {
  for (const button of ["キャンセル", "閉じる"]) {
    const page = await browser.newPage();
    await readyPage(page);
    await open(page);
    const original = await page.evaluate(() =>
      JSON.stringify(window.fixture.docs),
    );
    await selectConversion(page);
    assert.equal(
      await page.getByLabel("文書:", { exact: true }).isDisabled(),
      true,
    );
    await dialog(page)
      .getByRole("button", { name: button, exact: true })
      .click();
    await closed(page);
    assert.equal(
      await page.evaluate(() => JSON.stringify(window.fixture.docs)),
      original,
    );
    assert.equal(
      await page.evaluate(() => window.ui.getState().hasConversionRequest),
      false,
    );
    assert.equal(
      await page.evaluate(
        () =>
          window.fixture.calls.filter(
            (c) => typeof c === "string" && /prepare|commit/.test(c),
          ).length,
      ),
      0,
    );
    await open(page);
    assert.equal(
      await page
        .getByRole("tab", { name: "💽 原文YAML", exact: true })
        .getAttribute("aria-selected"),
      "true",
    );
    await assertNoDownload(page);
    await page.close();
  }
});
test("external Save reads the latest workcopy, commits once to the Editor and closes without downloading", async () => {
  const page = await browser.newPage();
  await readyPage(page);
  await startFromIcon(page);
  const id = await page.evaluate(() => window.ui.getState().session.id);
  assert.equal(
    await page.evaluate(() => window.fixture.docs["notes:one"]),
    "theme: light",
  );
  assert.equal(
    await page
      .getByRole("tab", { name: "共通YAMLブロック", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    await page
      .getByText(
        "VSCodeの内容を先にエディターへ反映してから形式を切り替えてください。",
        {
          exact: true,
        },
      )
      .isVisible(),
    true,
  );
  await page.evaluate(() => window.fixture.setRemote("theme: latest"));
  await footerSave(page).click();
  await closed(page);
  assert.equal(
    await page.evaluate(() => window.fixture.docs["notes:one"]),
    "theme: latest",
  );
  assert.equal(
    await page.evaluate(
      () => window.fixture.calls.filter((c) => c === "commit:notes:one").length,
    ),
    1,
  );
  await page.waitForFunction((id) => window.fixture.sessions[id].closed, id);
  await assertNoDownload(page);
  await page.close();
});
test("an unchanged external workcopy delegates commit so the owner can synchronize document metadata", async () => {
  const page = await browser.newPage();
  await readyPage(page);
  await startFromIcon(page);
  await page.evaluate(
    () =>
      (window.fixture.pendingOwnerMetadata = {
        entryPath: "second.k4.yml",
        version: "4.0",
      }),
  );
  await footerSave(page).click();
  await closed(page);
  assert.equal(
    await page.evaluate(
      () => window.fixture.calls.filter((c) => c === "commit:notes:one").length,
    ),
    1,
  );
  assert.deepEqual(await page.evaluate(() => window.fixture.ownerMetadata), {
    entryPath: "second.k4.yml",
    version: "4.0",
  });
  assert.equal(
    await page.evaluate(() => window.fixture.docs["notes:one"]),
    "theme: light",
  );
  await assertNoDownload(page);
  await page.close();
});
test("invalid external Save keeps the dialog, session and workfile for correction and retry", async () => {
  const page = await browser.newPage();
  await readyPage(page);
  await startFromIcon(page);
  const id = await page.evaluate(() => window.ui.getState().session.id);
  await page.evaluate(() => window.fixture.setRemote("bad yaml"));
  await footerSave(page).click();
  await dialog(page)
    .getByRole("alert")
    .filter({ hasText: "Invalid YAML" })
    .waitFor();
  assert.equal(await dialog(page).isVisible(), true);
  assert.equal(await page.evaluate(() => window.ui.getState().session.id), id);
  assert.equal(
    await page.evaluate((id) => window.fixture.sessions[id].closed, id),
    false,
  );
  assert.equal(
    await page.evaluate(() => window.fixture.docs["notes:one"]),
    "theme: light",
  );
  assert.equal(await page.locator("textarea").inputValue(), "bad yaml");
  await page.evaluate(() => window.fixture.setRemote("theme: corrected"));
  await footerSave(page).click();
  await closed(page);
  assert.equal(
    await page.evaluate(() => window.fixture.docs["notes:one"]),
    "theme: corrected",
  );
  await assertNoDownload(page);
  await page.close();
});
test("X ends the private session and retains its physical content without leaking it into the next document", async () => {
  const page = await browser.newPage();
  await readyPage(page);
  await startFromIcon(page);
  const id = await page.evaluate(() => window.ui.getState().session.id);
  await page.evaluate(() => window.fixture.setRemote("private: uncommitted"));
  await dialog(page)
    .getByRole("button", { name: "閉じる", exact: true })
    .click();
  await closed(page);
  await page.waitForFunction((id) => window.fixture.sessions[id].closed, id);
  assert.equal(
    await page.evaluate((id) => window.fixture.sessions[id].source, id),
    "private: uncommitted",
  );
  assert.equal(
    await page.evaluate(() => window.fixture.docs["notes:one"]),
    "theme: light",
  );
  await open(page);
  await page
    .getByLabel("文書:", { exact: true })
    .selectOption({ label: "settings.yml (preferences / one)" });
  await startSelected(page);
  const post = await page.evaluate(
    () => window.fixture.calls.filter((c) => c.method === "POST").at(-1).body,
  );
  assert.equal(post.source, '{"mode":"compact"}\r\n');
  assert.equal(post.format, "json");
  assert.equal(post.schema, undefined);
  assert.notEqual(
    await page.evaluate(() => window.ui.getState().session.id),
    id,
  );
  await assertNoDownload(page);
  await page.close();
});
test("Cancel during an external GET or pure prepare invalidates the epoch and prevents a later commit", async () => {
  for (const phase of ["get", "prepare"]) {
    const page = await browser.newPage();
    await readyPage(page);
    await startFromIcon(page);
    await page.evaluate((phase) => {
      window.fixture.setRemote("theme: later");
      window.fixture.delayed = phase === "get";
      window.fixture.delayPrepare = phase === "prepare";
    }, phase);
    await footerSave(page).click();
    await page.waitForFunction(
      (phase) =>
        Boolean(
          phase === "get"
            ? window.fixture.resolveSaved
            : window.fixture.resolvePrepare,
        ),
      phase,
    );
    await cancel(page).click();
    await closed(page);
    await page.evaluate((phase) => {
      if (phase === "get") window.fixture.resolveSaved();
      else window.fixture.resolvePrepare();
    }, phase);
    await page.waitForTimeout(50);
    assert.equal(
      await page.evaluate(() => window.fixture.docs["notes:one"]),
      "theme: light",
    );
    assert.equal(
      await page.evaluate(
        () =>
          window.fixture.calls.filter(
            (c) => typeof c === "string" && c.includes("commit"),
          ).length,
      ),
      0,
    );
    await assertNoDownload(page);
    await page.close();
  }
});
test("a delayed workcopy POST is closed on arrival after cancellation", async () => {
  const page = await browser.newPage();
  await readyPage(page);
  await open(page);
  await page.evaluate(() => (window.fixture.delayPost = true));
  await page.getByRole("button", { name: "VSCodeで編集", exact: true }).click();
  await page.waitForFunction(() => window.fixture.resolvePost);
  await dialog(page)
    .getByRole("button", { name: "閉じる", exact: true })
    .click();
  await closed(page);
  await page.evaluate(() => window.fixture.resolvePost());
  await page.waitForFunction(() =>
    Object.values(window.fixture.sessions).every((s) => s.closed),
  );
  assert.equal(await page.evaluate(() => window.ui.getState().session), null);
  assert.equal(
    await page.evaluate(() => window.fixture.docs["notes:one"]),
    "theme: light",
  );
  await page.close();
});
test("once owner commit starts X/Cancel/Escape cannot abandon an in-flight mutation", async () => {
  const page = await browser.newPage();
  await readyPage(page);
  await startFromIcon(page);
  await page.evaluate(() => {
    window.fixture.setRemote("theme: committed");
    window.fixture.delayCommit = true;
  });
  await footerSave(page).click();
  await page.waitForFunction(() => window.fixture.resolveCommit);
  assert.equal(await cancel(page).isDisabled(), true);
  assert.equal(
    await dialog(page)
      .getByRole("button", { name: "閉じる", exact: true })
      .isDisabled(),
    true,
  );
  await page.keyboard.press("Escape");
  assert.equal(await dialog(page).isVisible(), true);
  await page.evaluate(() => window.fixture.resolveCommit());
  await closed(page);
  assert.equal(
    await page.evaluate(() => window.fixture.docs["notes:one"]),
    "theme: committed",
  );
  await assertNoDownload(page);
  await page.close();
});
test("footer Save prepares and applies the selected conversion once, permits extension approval and stays closed on success", async () => {
  const page = await browser.newPage();
  await readyPage(page);
  await open(page);
  await selectConversion(page);
  await page.evaluate(() => (window.fixture.requireSecurity = true));
  await saveConversion(page);
  await page
    .getByRole("button", { name: "Approve fixture extension", exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(() => window.fixture.commitDialogOpen),
    false,
  );
  await page
    .getByRole("button", { name: "Approve fixture extension", exact: true })
    .click();
  await page.waitForFunction(() => !window.ui.getState().pending);
  await closed(page);
  assert.equal(
    await page.evaluate(
      () =>
        window.fixture.calls.filter(
          (c) => c === "commit-representation:notes:one",
        ).length,
    ),
    1,
  );
  assert.equal(
    await page.evaluate(() => window.ui.getState().hasConversionRequest),
    false,
  );
  await open(page);
  assert.equal(
    await page
      .getByRole("button", { name: "VSCodeで編集", exact: true })
      .isDisabled(),
    true,
  );
  const commits = await page.evaluate(
    () =>
      window.fixture.calls.filter(
        (c) => typeof c === "string" && c.includes("commit-representation"),
      ).length,
  );
  await footerSave(page).click();
  await closed(page);
  assert.equal(
    await page.evaluate(() => window.fixture.activeKind),
    "yaml-blocks",
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.fixture.calls.filter(
          (c) => typeof c === "string" && c.includes("commit-representation"),
        ).length,
    ),
    commits,
  );
  await assertNoDownload(page);
  await page.close();
});
test("a confirmed rollback retains the request and a second Save prepares a fresh candidate before succeeding", async () => {
  const page = await browser.newPage();
  await readyPage(page);
  await open(page);
  await selectConversion(page);
  await page.evaluate(() => {
    window.fixture.failRepresentation = true;
    window.fixture.rollbackSucceeded = true;
  });
  await saveConversion(page);
  await dialog(page)
    .getByRole("alert")
    .filter({ hasText: "Load failed and rolled back" })
    .waitFor();
  assert.equal(await dialog(page).isVisible(), true);
  assert.equal(
    await page.evaluate(() => window.ui.getState().hasConversionRequest),
    true,
  );
  await page.waitForFunction(
    () => window.ui.getState().previewKind === "yaml-blocks",
  );
  assert.equal(await footerSave(page).isEnabled(), true);
  assert.equal(
    await page.evaluate(() => window.fixture.docs["notes:one"]),
    "theme: light",
  );
  await page.evaluate(() => (window.fixture.failRepresentation = false));
  await saveConversion(page);
  await closed(page);
  assert.equal(
    await page.evaluate(() => window.fixture.activeKind),
    "yaml-blocks",
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.fixture.calls.filter(
          (c) => c === "prepare-representation:notes:one",
        ).length,
    ),
    2,
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.fixture.calls.filter(
          (c) => c === "commit-representation:notes:one",
        ).length,
    ),
    1,
  );
  await assertNoDownload(page);
  await page.close();
});
test("an unconfirmed conversion failure clears the request and does not silently retry", async () => {
  const page = await browser.newPage();
  await readyPage(page);
  await open(page);
  await selectConversion(page);
  await page.evaluate(() => (window.fixture.failRepresentation = true));
  await saveConversion(page);
  await dialog(page)
    .getByRole("alert")
    .filter({ hasText: "Load failed and rolled back" })
    .waitFor();
  assert.equal(
    await page.evaluate(() => window.ui.getState().hasConversionRequest),
    false,
  );
  assert.equal(await footerSave(page).isDisabled(), true);
  await cancel(page).click();
  await closed(page);
  await assertNoDownload(page);
  await page.close();
});
test("current block-format Save commits edited canonical text and retains its format without conversion confirmation", async () => {
  for (const kind of ["yaml-blocks", "schema-blocks"]) {
    const page = await browser.newPage();
    await readyPage(page);
    await page.evaluate((kind) => {
      window.fixture.activeKind = kind;
      window.fixture.blocksSource = "theme: edited blocks";
      window.fixture.previewSource = window.fixture.blocksSource;
      window.ui.refresh();
    }, kind);
    await open(page);
    await page.waitForFunction(() => !document.querySelector(".twpe-yaml-save").disabled);
    assert.equal(await page.evaluate(() => window.fixture.docs["notes:one"]), "theme: light");
    await footerSave(page).click();
    await closed(page);
    assert.equal(await confirmation(page).isVisible(), false);
    assert.deepEqual(await page.evaluate(() => window.fixture.lastRepresentationRequest), {kind, direction: "from-source"});
    assert.equal(await page.evaluate(() => window.fixture.docs["notes:one"]), "theme: edited blocks");
    assert.equal(await page.evaluate(() => window.fixture.activeKind), kind);
    assert.deepEqual(await page.evaluate(() => window.fixture.calls.filter(call => typeof call === "string")), ["prepare-representation:notes:one", "commit-representation:notes:one"]);
    assert.deepEqual(await page.evaluate(() => window.fixture.previewCalls), [kind]);
    await assertNoDownload(page);
    await page.close();
  }
});

test("same-format Save releases its modal for extension approval and restores it after approval failure", async () => {
  for (const reject of [false, true]) {
    const page = await browser.newPage();
    await readyPage(page);
    await page.evaluate((reject) => {
      window.fixture.activeKind = "yaml-blocks";
      window.fixture.blocksSource = "theme: edited blocks";
      window.fixture.previewSource = window.fixture.blocksSource;
      window.fixture.requireSecurity = true;
      window.fixture.failAfterSecurity = reject;
      window.ui.refresh();
    }, reject);
    await open(page);
    await page.waitForFunction(() => !document.querySelector(".twpe-yaml-save").disabled);
    await footerSave(page).click();
    const approval = page.getByRole("button", {name: "Approve fixture extension", exact: true});
    await approval.waitFor();
    assert.equal(await page.evaluate(() => window.fixture.commitDialogOpen), false);
    assert.equal(await dialog(page).isVisible(), false);
    await approval.click();
    if (reject) {
      await dialog(page).getByRole("alert").filter({hasText: "Extension approval failed"}).waitFor();
      assert.equal(await dialog(page).isVisible(), true);
      assert.equal(await cancel(page).isEnabled(), true);
      assert.equal(await page.evaluate(() => window.fixture.docs["notes:one"]), "theme: light");
      assert.equal(await page.evaluate(() => window.fixture.calls.includes("commit-representation:notes:one")), false);
      await cancel(page).click();
    } else {
      await closed(page);
      assert.equal(await page.evaluate(() => window.fixture.docs["notes:one"]), "theme: edited blocks");
      assert.equal(await page.evaluate(() => window.fixture.activeKind), "yaml-blocks");
    }
    assert.equal(await page.evaluate(() => window.fixture.calls.includes("stop")), false);
    await assertNoDownload(page);
    await page.close();
  }
});

test("same-format Save rejects invalid blocks and Cancel or project replacement during prepare prevents a commit", async () => {
  for (const mode of ["failure", "cancel", "replaced"]) {
    const page = await browser.newPage();
    await readyPage(page);
    await page.evaluate((mode) => {
      window.fixture.activeKind = "yaml-blocks";
      window.fixture.blocksSource = "theme: edited blocks";
      window.fixture.delayRepresentationPrepare = mode !== "failure";
      window.fixture.failRepresentationPrepare = mode === "failure";
      window.ui.refresh();
    }, mode);
    await open(page);
    await page.waitForFunction(() => !document.querySelector(".twpe-yaml-save").disabled);
    await footerSave(page).click();
    if (mode === "failure") {
      await dialog(page).getByRole("alert").filter({hasText: "Invalid block structure"}).waitFor();
      assert.equal(await dialog(page).isVisible(), true);
      await cancel(page).click();
    } else {
      await page.waitForFunction(() => typeof window.fixture.resolveRepresentationPrepare === "function");
      if (mode === "cancel") await cancel(page).click();
      else await page.evaluate(() => window.replaceProject());
      await page.evaluate(() => window.fixture.resolveRepresentationPrepare());
    }
    await page.waitForTimeout(30);
    assert.equal(await page.evaluate(() => window.fixture.docs["notes:one"]), "theme: light");
    assert.equal(await page.evaluate(() => window.fixture.calls.some(call => typeof call === "string" && call.includes("commit"))), false);
    await assertNoDownload(page);
    await page.close();
  }
});

test("Save preparation failure retains the selection and Cancel during preparation prevents any owner commit", async () => {
  for (const mode of ["failure", "cancel"]) {
    const page = await browser.newPage();
    await readyPage(page);
    await open(page);
    await selectConversion(page);
    await page.evaluate((mode) => {
      window.fixture.failRepresentationPrepare = mode === "failure";
      window.fixture.delayRepresentationPrepare = mode === "cancel";
    }, mode);
    await saveConversion(page);
    if (mode === "failure") {
      await dialog(page)
        .getByRole("alert")
        .filter({ hasText: "Invalid block structure" })
        .waitFor();
      assert.equal(await dialog(page).isVisible(), true);
      assert.equal(
        await page.evaluate(() => window.ui.getState().hasConversionRequest),
        true,
      );
      assert.equal(await footerSave(page).isEnabled(), true);
      await cancel(page).click();
    } else {
      await page.waitForFunction(
        () => typeof window.fixture.resolveRepresentationPrepare === "function",
      );
      assert.equal(
        await dialog(page)
          .getByRole("button", { name: "閉じる", exact: true })
          .isEnabled(),
        true,
      );
      await cancel(page).click();
      await page.evaluate(() => window.fixture.resolveRepresentationPrepare());
    }
    await closed(page);
    await page.waitForTimeout(30);
    assert.equal(
      await page.evaluate(
        () =>
          window.fixture.calls.filter(
            (c) => typeof c === "string" && c.includes("commit-representation"),
          ).length,
      ),
      0,
    );
    assert.equal(
      await page.evaluate(() => window.fixture.docs["notes:one"]),
      "theme: light",
    );
    await assertNoDownload(page);
    await page.close();
  }
});

test("a conversion capability removed before or during Save cannot execute a hidden stale request", async () => {
  for (const phase of ["refresh", "before-save", "during-prepare"]) {
    const page = await browser.newPage();
    await readyPage(page);
    await open(page);
    await selectConversion(page);
    await page.waitForFunction(
      () => window.ui.getState().previewKind === "yaml-blocks",
    );
    if (phase === "during-prepare") {
      await page.evaluate(
        () => (window.fixture.delayRepresentationPrepare = true),
      );
      await saveConversion(page);
      await page.waitForFunction(
        () => typeof window.fixture.resolveRepresentationPrepare === "function",
      );
    }
    await page.evaluate((phase) => {
      window.fixture.withoutRepresentations = true;
      if (phase !== "before-save") window.ui.refresh();
    }, phase);
    if (phase === "before-save") await footerSave(page).click();
    if (phase === "during-prepare")
      await page.evaluate(() => window.fixture.resolveRepresentationPrepare());
    await dialog(page)
      .getByRole("alert")
      .filter({ hasText: "選択した変換は利用できなくなりました" })
      .waitFor();
    await page.waitForFunction(() => !window.ui.getState().pending);
    assert.equal(
      await page.evaluate(() => window.ui.getState().hasConversionRequest),
      false,
    );
    assert.equal(await footerSave(page).isDisabled(), true);
    assert.equal(
      await page.evaluate(
        () =>
          window.fixture.calls.filter(
            (c) => typeof c === "string" && c.includes("commit"),
          ).length,
      ),
      0,
    );
    if (phase !== "during-prepare")
      assert.equal(
        await page.evaluate(
          () =>
            window.fixture.calls.filter(
              (c) => typeof c === "string" && c.includes("prepare"),
            ).length,
        ),
        0,
      );
    await cancel(page).click();
    await closed(page);
    await assertNoDownload(page);
    await page.close();
  }
});

test("three accessible tabs mark the saved format, select by keyboard and confirm only on Save", async () => {
  const page = await browser.newPage();
  await readyPage(page);
  await open(page);
  assert.deepEqual(await dialog(page).getByRole("tab").allTextContents(), [
    "💽 原文YAML",
    "共通YAMLブロック",
    "台本ブロック",
  ]);
  assert.equal(
    await dialog(page)
      .getByRole("tab", { name: "💽 原文YAML", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  assert.equal(
    await dialog(page).locator("[role=status]").first().isVisible(),
    false,
  );
  const raw = page.getByRole("tab", { name: "💽 原文YAML", exact: true });
  await raw.focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await page
      .getByRole("tab", { name: "共通YAMLブロック", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await page.keyboard.press("End");
  assert.equal(
    await page
      .getByRole("tab", { name: "台本ブロック", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await page.keyboard.press("Home");
  assert.equal(await raw.getAttribute("aria-selected"), "true");
  await selectConversion(page);
  assert.equal(
    await page
      .getByRole("button", { name: "VSCodeで編集", exact: true })
      .isDisabled(),
    true,
  );
  await page.locator("[data-fixture-preview-kind=yaml-blocks]").waitFor();
  assert.equal(
    await page.locator("[data-fixture-preview-kind=yaml-blocks]").isVisible(),
    true,
  );
  await footerSave(page).click();
  await confirmation(page).waitFor();
  assert.equal(
    await page.evaluate(
      () => window.fixture.calls.filter((c) => typeof c === "string").length,
    ),
    0,
  );
  await confirmation(page)
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  assert.equal(await dialog(page).isVisible(), true);
  assert.equal(
    await page
      .getByRole("tab", { name: "共通YAMLブロック", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await footerSave(page).click();
  await confirmation(page).waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await dialog(page).isVisible(), true);
  assert.equal(await confirmation(page).isVisible(), false);
  assert.equal(
    await page.evaluate(
      () => window.fixture.calls.filter((c) => typeof c === "string").length,
    ),
    0,
  );
  await saveConversion(page);
  await closed(page);
  await open(page);
  assert.equal(
    await page
      .getByRole("tab", { name: "💽 共通YAMLブロック", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  assert.equal(
    await page
      .getByRole("tab", { name: "台本ブロック", exact: true })
      .isDisabled(),
    true,
  );
  await cancel(page).click();
  await closed(page);
  await page.evaluate(() => {
    window.fixture.allowCross = true;
    window.fixture.crossOnly = true;
    window.ui.refresh();
  });
  await open(page);
  assert.equal(
    await page
      .getByRole("tab", { name: "台本ブロック", exact: true })
      .isEnabled(),
    true,
  );
  await page.getByRole("tab", { name: "台本ブロック", exact: true }).click();
  await saveConversion(page);
  await page.waitForFunction(() => !window.ui.getState().pending);
  assert.equal(
    await dialog(page).isVisible(),
    false,
    await page
      .locator(".twpe-yaml-dialog")
      .first()
      .locator("[role=alert]")
      .textContent(),
  );
  await closed(page);
  assert.deepEqual(
    await page.evaluate(() => window.fixture.lastRepresentationRequest),
    { kind: "schema-blocks", direction: "from-source" },
  );
  await open(page);
  assert.equal(
    await page
      .getByRole("tab", { name: "💽 台本ブロック", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await footerSave(page).click();
  await closed(page);
  assert.equal(await confirmation(page).isVisible(), false);
  await assertNoDownload(page);
  await page.close();
});
test("a cancelled older preparation cannot reset the conversion guard of a newer Save", async () => {
  const page = await browser.newPage();
  await readyPage(page);
  await open(page);
  await selectConversion(page);
  await page.evaluate(() => (window.fixture.delayRepresentationPrepare = true));
  await saveConversion(page);
  await page.waitForFunction(
    () => typeof window.fixture.resolveRepresentationPrepare === "function",
  );
  await page.evaluate(
    () => (window.oldPreparation = window.fixture.resolveRepresentationPrepare),
  );
  await cancel(page).click();
  await closed(page);
  await open(page);
  await selectConversion(page);
  await page.evaluate(() => {
    window.fixture.delayRepresentationPrepare = false;
    window.fixture.requireSecurity = true;
  });
  await saveConversion(page);
  await page
    .getByRole("button", { name: "Approve fixture extension", exact: true })
    .waitFor();
  await page.evaluate(() => window.oldPreparation());
  await page.waitForTimeout(30);
  await page
    .getByRole("button", { name: "Approve fixture extension", exact: true })
    .click();
  await page.waitForFunction(() => !window.ui.getState().pending);
  assert.equal(
    await page
      .locator(".twpe-yaml-dialog")
      .first()
      .locator("[role=status]")
      .first()
      .textContent(),
    "エディターへ反映しました。",
  );
  assert.equal(
    await page.evaluate(() => window.fixture.activeKind),
    "yaml-blocks",
  );
  await closed(page);
  await assertNoDownload(page);
  await page.close();
});

test("tab previews display only the selected owner model and ignore an older asynchronous result", async () => {
  const page = await browser.newPage();
  await readyPage(page);
  await open(page);
  await page.waitForFunction(
    () => window.ui.getState().previewKind === "source",
  );
  assert.equal(
    await page
      .getByLabel("保存されている原文（プレビュー）", { exact: true })
      .inputValue(),
    "theme: light",
  );
  assert.equal(
    await page
      .getByText("💽=現在保存されている形式", { exact: true })
      .isVisible(),
    true,
  );
  await page.evaluate(() => (window.fixture.delayPreviewKind = "yaml-blocks"));
  await page
    .getByRole("tab", { name: "共通YAMLブロック", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      typeof window.fixture.previewResolvers?.["yaml-blocks"] === "function",
  );
  assert.equal(await footerSave(page).isDisabled(), true);
  assert.equal(await page.locator("#twpe-yaml-preview").isVisible(), false);
  await page.getByRole("tab", { name: "台本ブロック", exact: true }).click();
  await page.waitForFunction(
    () => window.ui.getState().previewKind === "schema-blocks",
  );
  assert.equal(
    await page.locator("[data-fixture-preview-kind=schema-blocks]").isVisible(),
    true,
  );
  await page.evaluate(() => window.fixture.previewResolvers["yaml-blocks"]());
  await page.waitForTimeout(30);
  assert.equal(
    await page.evaluate(() => window.ui.getState().previewKind),
    "schema-blocks",
  );
  assert.equal(
    await page.locator("[data-fixture-preview-kind=yaml-blocks]").count(),
    0,
  );
  assert.equal(
    await page.evaluate(
      () => window.fixture.calls.filter((c) => typeof c === "string").length,
    ),
    0,
  );
  await cancel(page).click();
  await closed(page);
  await assertNoDownload(page);
  await page.close();
});
test("an obsolete block rendering is disposed without deleting the new tab preview", async () => {
  const page = await browser.newPage();
  await readyPage(page);
  await open(page);
  await page.evaluate(() => (window.fixture.delayRenderKind = "yaml-blocks"));
  await page
    .getByRole("tab", { name: "共通YAMLブロック", exact: true })
    .click();
  await page.waitForFunction(
    () => typeof window.fixture.renderResolvers?.["yaml-blocks"] === "function",
  );
  await page.getByRole("tab", { name: "台本ブロック", exact: true }).click();
  await page.waitForFunction(
    () => window.ui.getState().previewKind === "schema-blocks",
  );
  assert.equal(
    await page.evaluate(() =>
      window.fixture.abortedPreviews?.includes("yaml-blocks"),
    ),
    true,
  );
  await page.evaluate(() => window.fixture.renderResolvers["yaml-blocks"]());
  await page.waitForTimeout(30);
  assert.equal(
    await page.locator("[data-fixture-preview-kind=schema-blocks]").count(),
    1,
  );
  assert.equal(
    await page.locator("[data-fixture-preview-kind=yaml-blocks]").count(),
    0,
  );
  assert.equal(
    await page.evaluate(() =>
      window.fixture.disposedPreviews.includes("yaml-blocks"),
    ),
    true,
  );
  assert.equal(await footerSave(page).isEnabled(), true);
  await cancel(page).click();
  await closed(page);
  await page.close();
});
test("preview errors disable Save while Cancel works and returning from VSCode refreshes the visible raw workcopy", async () => {
  const page = await browser.newPage();
  await readyPage(page);
  await open(page);
  await page.evaluate(() => (window.fixture.failPreviewKind = "yaml-blocks"));
  await page
    .getByRole("tab", { name: "共通YAMLブロック", exact: true })
    .click();
  await dialog(page)
    .getByRole("alert")
    .filter({ hasText: "Preview unavailable" })
    .waitFor();
  assert.equal(await footerSave(page).isDisabled(), true);
  assert.equal(await cancel(page).isEnabled(), true);
  await cancel(page).click();
  await closed(page);
  await startFromIcon(page);
  await page.evaluate(() => {
    window.fixture.setRemote("theme: returned-from-vscode");
    window.dispatchEvent(new Event("focus"));
  });
  await page.waitForFunction(
    () =>
      !window.ui.getState().pending &&
      document.querySelector("#twpe-yaml-preview").value ===
        "theme: returned-from-vscode",
  );
  assert.equal(
    await page
      .getByLabel("VSCodeの保存内容（エディターへは未反映）", { exact: true })
      .inputValue(),
    "theme: returned-from-vscode",
  );
  assert.equal(
    await page.evaluate(() => window.fixture.docs["notes:one"]),
    "theme: light",
  );
  await footerSave(page).click();
  await closed(page);
  assert.equal(
    await page.evaluate(() => window.fixture.docs["notes:one"]),
    "theme: returned-from-vscode",
  );
  await assertNoDownload(page);
  await page.close();
});

test("legacy owners may preview current raw source but cannot show stale canonical text for active blocks", async () => {
  for (const active of ["source", "yaml-blocks"]) {
    const page = await browser.newPage();
    await readyPage(page);
    await page.evaluate((active) => {
      window.fixture.noPreview = true;
      window.fixture.activeKind = active;
      window.ui.refresh();
    }, active);
    await open(page);
    if (active === "source") {
      await page.waitForFunction(
        () => window.ui.getState().previewKind === "source",
      );
      assert.equal(
        await page.locator("#twpe-yaml-preview").inputValue(),
        "theme: light",
      );
      assert.equal(await footerSave(page).isEnabled(), true);
    } else {
      await dialog(page)
        .getByRole("alert")
        .filter({ hasText: "did not provide a preview" })
        .waitFor();
      await page.getByRole("tab", { name: "原文YAML", exact: true }).click();
      await dialog(page)
        .getByRole("alert")
        .filter({ hasText: "did not provide a preview" })
        .waitFor();
      assert.equal(await page.locator("#twpe-yaml-preview").inputValue(), "");
      assert.equal(await footerSave(page).isDisabled(), true);
      assert.equal(
        await page.evaluate(() => window.ui.getState().previewKind),
        null,
      );
    }
    assert.equal(
      await page.evaluate(
        () => window.fixture.calls.filter((c) => typeof c === "string").length,
      ),
      0,
    );
    await cancel(page).click();
    await closed(page);
    await page.close();
  }
});

test("the selected tab and loading state reach a rendering frame before owner conversion starts", async () => {
  const page = await browser.newPage();
  await readyPage(page);
  await open(page);
  await page.waitForFunction(
    () => window.ui.getState().previewKind === "source",
  );
  await page.evaluate(() => {
    window.fixture.recordPreviewPaint = true;
    document.addEventListener(
      "click",
      (event) => {
        if (event.target.closest("[role=tab]")?.dataset.kind === "yaml-blocks")
          requestAnimationFrame(() => (window.fixture.previewPaintFrame = 1));
      },
      { capture: true, once: true },
    );
  });
  await selectConversion(page);
  await page.waitForFunction(
    () => window.ui.getState().previewKind === "yaml-blocks",
  );
  assert.deepEqual(
    await page.evaluate(() => window.fixture.previewObservations),
    [
      {
        kind: "yaml-blocks",
        frame: 1,
        selected: "yaml-blocks",
        loading: true,
        saveDisabled: true,
      },
    ],
  );
  assert.equal(await footerSave(page).isEnabled(), true);
  await cancel(page).click();
  await closed(page);
  assert.equal(
    await page.evaluate(() =>
      window.fixture.calls.some(
        (call) => typeof call === "string" && /prepare|commit/.test(call),
      ),
    ),
    false,
  );
  await assertNoDownload(page);
  await page.close();
});

test("rapid tab changes skip obsolete owner work before the next frame and cancellation cannot apply a late preview", async () => {
  const page = await browser.newPage();
  await readyPage(page);
  await open(page);
  await page.waitForFunction(
    () => window.ui.getState().previewKind === "source",
  );
  await page.evaluate(() => {
    window.fixture.previewCalls = [];
    window.fixture.delayPreviewKind = "schema-blocks";
    document.querySelector('[role=tab][data-kind="yaml-blocks"]').click();
    document.querySelector('[role=tab][data-kind="schema-blocks"]').click();
  });
  await page.waitForFunction(
    () =>
      typeof window.fixture.previewResolvers?.["schema-blocks"] === "function",
  );
  assert.deepEqual(await page.evaluate(() => window.fixture.previewCalls), [
    "schema-blocks",
  ]);
  assert.equal(await footerSave(page).isDisabled(), true);
  await cancel(page).click();
  await closed(page);
  await page.evaluate(() => window.fixture.previewResolvers["schema-blocks"]());
  await page.waitForTimeout(30);
  assert.equal(await page.locator("[data-fixture-preview-kind]").count(), 0);
  assert.equal(
    await page.evaluate(() => window.ui.getState().previewKind),
    null,
  );
  assert.equal(
    await page.evaluate(() =>
      window.fixture.calls.some(
        (call) => typeof call === "string" && /prepare|commit/.test(call),
      ),
    ),
    false,
  );
  await assertNoDownload(page);
  await page.close();
});
