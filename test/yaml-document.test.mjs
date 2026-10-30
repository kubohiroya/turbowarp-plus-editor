import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {EventEmitter} from 'node:events';
import {
    computeDsl4Sha256Integrity, createDsl4EmbeddedAssetBundle, createDsl4SourceFrontend,
    dsl4StandardProductionFeatureFlags, loadDsl4RuntimeComponent
} from '@kubohiroya/turbowarp-kamishibai-app/dsl4';
import {createRuntimeExpressionComposition} from '@kubohiroya/turbowarp-runtime-expression/composition';
import schema from '../node_modules/@kubohiroya/turbowarp-kamishibai-app/schema/dsl-4.schema.json' with {type: 'json'};
import narrativeSchema from '../node_modules/@kubohiroya/turbowarp-kamishibai-app/schema/dsl-4-narrative-control.schema.json' with {type: 'json'};
import {createKamishibaiEmbeddedYamlProvider} from '@kubohiroya/turbowarp-kamishibai-app/embedded-yaml';
function createEmbeddedYamlDocument(vm) {
    const provider = createKamishibaiEmbeddedYamlProvider(vm);
    const document = provider.open('story');
    return {...document, dispose() { provider.dispose(); }};
}
const BUNDLE='kubohiroyakamishibai4', COMPONENT='kubohiroyakamishibairuntime4';
const limits={maxSourceBytes:1024*1024,maxAssetFiles:4096,maxTotalAssetBytes:128*1024*1024};
const frontend=createDsl4SourceFrontend(schema,{createRuntimeExpressionComposition,narrativeControlEnabled:dsl4StandardProductionFeatureFlags.dsl4NarrativeControl,narrativeControlSchema:narrativeSchema});
const component = project => project.extensionStorage[BUNDLE].components[COMPONENT];
let cached;
async function fixture({direct=false,alias=false}={}) {
    if(!cached){
        const project=JSON.parse(await readFile(new URL('./fixtures/yaml-editor/tutorial-project.json',import.meta.url),'utf8'));
        const c=component(project), parsed=frontend.parse(c.source.text,{sourceId:c.source.sourceId});
        assert.equal(parsed.ok,true);
        const payloads=new Map(c.assets.files.map(f=>[`${f.assetId}\0${f.path}`,new Uint8Array(Buffer.from(f.data,'base64'))]));
        for(const asset of c.assets.manifest.assets) for(const f of asset.source.files??[]) {
            const bytes=payloads.get(`${asset.id}\0${f.path}`);
            f.size=bytes.length; f.integrity=await computeDsl4Sha256Integrity(bytes);
        }
        c.assets=await createDsl4EmbeddedAssetBundle(parsed.storyDocument,{manifest:c.assets.manifest,getFile:(id,path)=>payloads.get(`${id}\0${path}`)},{maxFiles:limits.maxAssetFiles,maxTotalBytes:limits.maxTotalAssetBytes});
        assert.equal((await loadDsl4RuntimeComponent(project,frontend,limits)).ok,true);
        cached=JSON.stringify(project);
    }
    const project=JSON.parse(cached);
    if(direct){project.extensionStorage[COMPONENT]=component(project);delete project.extensionStorage[BUNDLE];project.extensions=[COMPONENT];}
    project.extensionStorage.otherExtension={retained:['other','metadata']};
    if(!direct)project.extensionStorage[BUNDLE].components.otherComponent={retained:true};
    const runtime=Object.assign(new EventEmitter(),{extensionStorage:project.extensionStorage,targets:project.targets,dirty:0});
    if(alias){const bundle=runtime.extensionStorage[BUNDLE];Object.defineProperty(runtime.extensionStorage,COMPONENT,{configurable:true,enumerable:false,get:()=>bundle.components[COMPONENT],set:value=>{bundle.components[COMPONENT]=value;}});}
    runtime.emitProjectChanged=()=>{runtime.dirty++;runtime.emit('PROJECT_CHANGED');};
    const vm={runtime,stops:0,stopAll(){this.stops++;},toJSON(){return JSON.stringify({...project,targets:runtime.targets.filter(target=>target.isOriginal!==false),extensionStorage:runtime.extensionStorage});}};
    const adapter=createEmbeddedYamlDocument(vm);
    return {project,runtime,vm,adapter,get component(){return direct?runtime.extensionStorage[COMPONENT]:runtime.extensionStorage[BUNDLE].components[COMPONENT];}};
}

test('real tutorial-derived component edits text and both descriptors while preserving every other project value',async()=>{
    const f=await fixture();const snapshot=f.adapter.capture();assert.equal(f.adapter.inspect().available,true);assert.ok(Object.isFrozen(snapshot));
    const before=JSON.parse(f.vm.toJSON());const assets=JSON.stringify(f.component.assets);
    const prepared=await f.adapter.prepare(snapshot,snapshot.source+'\n# kept user comment\n');
    await f.adapter.commit(snapshot,prepared);
    const after=JSON.parse(f.vm.toJSON());assert.equal(component(after).source.text,prepared.source);assert.match(prepared.source,/# kept user comment/);
    assert.equal(component(after).source.byteLength,new TextEncoder().encode(prepared.source).length);
    assert.equal(component(after).artifact.sourceIntegrity,component(after).source.integrity);
    assert.equal((await loadDsl4RuntimeComponent(after,frontend,limits)).ok,true);
    delete component(before).source;delete component(before).artifact;delete component(after).source;delete component(after).artifact;
    assert.deepEqual(after,before);assert.equal(JSON.stringify(f.component.assets),assets);assert.equal(f.runtime.dirty,1);assert.equal(f.vm.stops,1);f.adapter.dispose();
});

test('retains bundle/components identity and the existing nonenumerable runtime alias after replacement',async()=>{
    const f=await fixture({alias:true});const root=f.runtime.extensionStorage,bundle=root[BUNDLE],components=bundle.components,previous=components[COMPONENT];
    const s=f.adapter.capture();const p=await f.adapter.prepare(s,s.source+'\n# alias survives\n');await f.adapter.commit(s,p);
    assert.equal(f.runtime.extensionStorage,root);assert.equal(root[BUNDLE],bundle);assert.equal(bundle.components,components);assert.notEqual(root[COMPONENT],previous);assert.equal(root[COMPONENT],components[COMPONENT]);
    assert.equal(Object.getOwnPropertyDescriptor(root,COMPONENT).enumerable,false);f.adapter.dispose();
});

test('supports the unbundled storage channel without adding a bundle',async()=>{
    const f=await fixture({direct:true});const s=f.adapter.capture();await f.adapter.commit(s,await f.adapter.prepare(s,s.source+'\n# direct\n'));
    assert.equal(f.runtime.extensionStorage[BUNDLE],undefined);assert.equal(f.runtime.dirty,1);f.adapter.dispose();
});

test('unchanged source preserves descriptor bytes and produces no dirty or stop event',async()=>{
    const f=await fixture();const before=f.vm.toJSON();const s=f.adapter.capture();await f.adapter.commit(s,await f.adapter.prepare(s,s.source));assert.equal(f.vm.toJSON(),before);assert.equal(f.runtime.dirty,0);assert.equal(f.vm.stops,0);f.adapter.dispose();
});

test('invalid YAML and forged source integrity reject without changing the original component',async()=>{
    const f=await fixture();let s=f.adapter.capture();const before=f.vm.toJSON();await assert.rejects(f.adapter.prepare(s,'invalid: [yaml'),e=>Boolean(e.code));assert.equal(f.vm.toJSON(),before);assert.equal(f.runtime.dirty,0);
    f.component.source.integrity='sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';s=f.adapter.capture();await assert.rejects(f.adapter.prepare(s,s.source+'\n# invalid old hash\n'),/integrity/);assert.equal(f.runtime.dirty,0);f.adapter.dispose();
});

test('changing an asset source path cannot silently discard or replace the bundled payload',async()=>{
    const f=await fixture();const s=f.adapter.capture();const before=f.vm.toJSON();const first=f.component.assets.manifest.assets.find(a=>a.source.type==='file');
    assert.ok(s.source.includes(first.source.inputPath));const changed=s.source.replaceAll(first.source.inputPath,'missing-file.svg');
    await assert.rejects(f.adapter.prepare(s,changed),e=>Boolean(e.code));assert.equal(f.vm.toJSON(),before);assert.equal(f.runtime.dirty,0);f.adapter.dispose();
});

test('block story, menu startup stub, compiled artifact, binary entries and ambiguous channels are unavailable',async()=>{
    for(const [code,mutate]of [
        ['BLOCK_SOURCE',f=>{f.runtime.targets[0].blocks.hat={opcode:'kubohiroyakamishibaiauthoring4_kamishibai'};}],
        ['MENU_SOURCE',f=>{f.component.application.mode='menu';}],
        ['COMPILED_SOURCE',f=>{f.component.compiled={formatVersion:1};}],
        ['ASSET_FORMAT',f=>{f.component.assets.formatVersion=3;}],
        ['AMBIGUOUS_SOURCE',f=>{f.runtime.extensionStorage[COMPONENT]=structuredClone(f.component);}]
    ]) {const f=await fixture();mutate(f);assert.equal(f.adapter.inspect().code,code);assert.throws(()=>f.adapter.capture(),e=>e.code===code);assert.equal(f.runtime.dirty,0);f.adapter.dispose();}
});

test('project reload with identical data invalidates captures, including during asynchronous validation',async()=>{
    const f=await fixture();let s=f.adapter.capture();const p=f.adapter.prepare(s,s.source+'\n# pending\n');f.runtime.emit('PROJECT_LOADED');await assert.rejects(p,e=>e.code==='PROJECT_CONFLICT');
    s=f.adapter.capture();const prepared=await f.adapter.prepare(s,s.source+'\n# stale\n');f.runtime.emit('PROJECT_LOADED');await assert.rejects(f.adapter.commit(s,prepared),e=>e.code==='PROJECT_CONFLICT');assert.equal(f.runtime.dirty,0);f.adapter.dispose();
});

test('component mutation, equivalent root replacement and unrelated project edits reject stale saves',async()=>{
    for(const mutate of [f=>{f.component.source.displayName='changed.k4.yml';},f=>{f.runtime.extensionStorage=structuredClone(f.runtime.extensionStorage);},f=>{f.runtime.targets[0].name='renamed';}]){
        const f=await fixture();const s=f.adapter.capture();const p=await f.adapter.prepare(s,s.source+'\n# stale\n');mutate(f);const before=f.vm.toJSON();await assert.rejects(f.adapter.commit(s,p),e=>e.code==='PROJECT_CONFLICT');assert.equal(f.vm.toJSON(),before);assert.equal(f.runtime.dirty,0);f.adapter.dispose();
    }
});

test('prepared values cannot be forged, moved to another session or reused after commit',async()=>{
    const f=await fixture();const s=f.adapter.capture();const other=f.adapter.capture();const p=await f.adapter.prepare(s,s.source+'\n# owned candidate\n');
    await assert.rejects(f.adapter.commit(s,{source:p.source}),e=>e.code==='DOCUMENT_CONFLICT');await assert.rejects(f.adapter.commit(other,p),e=>e.code==='DOCUMENT_CONFLICT');
    await f.adapter.commit(s,p);await assert.rejects(f.adapter.commit(s,p),e=>e.code==='DOCUMENT_CONFLICT');assert.equal(f.runtime.dirty,1);f.adapter.dispose();
});

test('readonly component and disposed documents cannot be saved; disposing removes listeners',async()=>{
    const f=await fixture();const parent=f.runtime.extensionStorage[BUNDLE].components;Object.defineProperty(parent,COMPONENT,{writable:false});assert.throws(()=>f.adapter.capture(),e=>e.code==='COMPONENT_UNAVAILABLE');assert(f.runtime.listenerCount('PROJECT_LOADED')>=1);f.adapter.dispose();assert.equal(f.runtime.listenerCount('PROJECT_LOADED'),0);assert.throws(()=>f.adapter.capture(),e=>e.code==='DOCUMENT_DISPOSED');
});

test('a failed dirty observer cannot report an already committed document as rejected',async()=>{
    const f=await fixture();f.runtime.on('PROJECT_CHANGED',()=>{throw Error('observer failed');});const s=f.adapter.capture();const p=await f.adapter.prepare(s,s.source+'\n# persisted\n');assert.deepEqual(await f.adapter.commit(s,p),{source:p.source});assert.equal(f.component.source.text,p.source);assert.equal(f.runtime.dirty,1);f.adapter.dispose();
});


test('normal VM stop may replace the target array and remove clones while retaining original targets',async()=>{
    const f=await fixture();
    f.runtime.targets.push({isOriginal:false,id:'temporary-clone',name:'clone',blocks:{}});
    const original=f.runtime.targets.filter(target=>target.isOriginal!==false);
    f.vm.stopAll=function(){this.stops++;this.runtime.targets=this.runtime.targets.filter(target=>target.isOriginal!==false);};
    const oldArray=f.runtime.targets;const s=f.adapter.capture();const p=await f.adapter.prepare(s,s.source+'\n# stopping preserves project identity\n');
    await f.adapter.commit(s,p);assert.notEqual(f.runtime.targets,oldArray);assert.deepEqual(f.runtime.targets,original);assert.equal(f.component.source.text,p.source);assert.equal(f.runtime.dirty,1);f.adapter.dispose();
});

test('replacing original target objects with identical serialized targets still invalidates an editing session',async()=>{
    const f=await fixture();const s=f.adapter.capture();const p=await f.adapter.prepare(s,s.source+'\n# stale target identity\n');
    f.runtime.targets=structuredClone(f.runtime.targets);
    await assert.rejects(f.adapter.commit(s,p),failure=>failure.code==='PROJECT_CONFLICT');assert.equal(f.runtime.dirty,0);f.adapter.dispose();
});

test('a Student.say dialogue edit reaches the newly parsed story rather than a stale document',async()=>{
    const f=await fixture();
    const snapshot=f.adapter.capture();
    const before=await loadDsl4RuntimeComponent(JSON.parse(f.vm.toJSON()),frontend,limits);
    assert.equal(before.ok,true);
    const oldText='地震だ！',newText='机の下に入ろう！';
    assert.ok(JSON.stringify(before.storyDocument).includes(JSON.stringify(oldText)));
    assert.ok(snapshot.source.includes(`text: ${oldText}`));
    const oldIntegrity=f.component.source.integrity;
    const assets=JSON.stringify(f.component.assets);
    const prepared=await f.adapter.prepare(snapshot,snapshot.source.replace(`text: ${oldText}`,`text: ${newText}`));
    await f.adapter.commit(snapshot,prepared);
    const after=await loadDsl4RuntimeComponent(JSON.parse(f.vm.toJSON()),frontend,limits);
    assert.equal(after.ok,true);
    const story=JSON.stringify(after.storyDocument);
    assert.ok(story.includes(JSON.stringify(newText)));
    assert.equal(story.includes(JSON.stringify(oldText)),false);
    assert.notEqual(f.component.source.integrity,oldIntegrity);
    assert.equal(f.component.artifact.sourceIntegrity,f.component.source.integrity);
    assert.equal(JSON.stringify(f.component.assets),assets);
    assert.equal(f.runtime.dirty,1);
    f.adapter.dispose();
});
