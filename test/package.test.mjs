import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createEditorURL,renderEditButton} from '../src/index.js';
import {generatePages} from '../scripts/site/generate-pages.mjs';

test('edit URL preserves a signed nested project URL and editor parameters',()=>{
    const projectURL='https://example.com/作品.sb3?signature=a+b&value=1#part';
    const url=new URL(createEditorURL({projectURL,language:'en',parameters:{fps:60,lang:'wrong',project_url:'wrong'}}));
    assert.equal(url.origin+url.pathname,'https://kubohiroya.github.io/turbowarp-plus-editor/editor.html');
    assert.equal(url.searchParams.get('project_url'),new URL(projectURL).href);
    assert.equal(url.searchParams.get('lang'),'en');
    assert.equal(url.searchParams.get('fps'),'60');
});
test('embed HTML escapes URL values and uses a visible named edit action',()=>{
    const html=renderEditButton({parameters:{title:'"><script>"'},language:'ja'});
    assert.ok(html.includes('TurboWarp-Plus-Editorで編集'));
    assert.ok(html.includes('aria-hidden="true"'));
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&amp;'));
    assert.throws(()=>createEditorURL({projectURL:'javascript:alert(1)'}),/HTTP/);
    assert.throws(()=>createEditorURL({language:'xx'}),/language/);
});
test('distribution identifies the new site owner and all pinned integrated components',async()=>{
    const dir=await mkdtemp(path.join(os.tmpdir(),'twpe-generate-'));
    try{
        await generatePages(dir,'a'.repeat(40),'b'.repeat(40),{siteRevision:'c'.repeat(40),coreVersion:'0.6.0',securityVersion:'0.3.3'});
        const info=JSON.parse(await readFile(path.join(dir,'build-info.json'),'utf8'));
        assert.equal(info.siteRepository,'https://github.com/kubohiroya/turbowarp-plus-editor');
        assert.equal(info.securityVersion,'0.3.3');
        assert.equal(info.securityRevision,undefined);
        await generatePages(dir,'a'.repeat(40),'b'.repeat(40),{siteRevision:'c'.repeat(40),coreVersion:'0.6.0',
            securityVersion:'0.4.0',securityRevision:'d'.repeat(40)});
        assert.equal(JSON.parse(await readFile(path.join(dir,'build-info.json'),'utf8')).securityRevision,'d'.repeat(40));
        assert.equal(info.coreVersion,'0.6.0');
        const html=await readFile(path.join(dir,'index.html'),'utf8');
        assert.ok(html.includes('class="twpe-edit-button"'));
        assert.ok(!html.includes('turbowarp-extension-data-editor/editor.html'));
        assert.ok((await readFile(path.join(dir,'assets/icon.svg'),'utf8')).includes('<title>TurboWarp-Plus-Editor</title>'));
    }finally{await rm(dir,{recursive:true,force:true});}
});

test('small edit buttons keep the full action as a tooltip and accessible name',()=>{
    for (const [language,text,label] of [
        ['ja','編集','TurboWarp-Plus-Editorで編集'],
        ['en','Edit','Edit in TurboWarp-Plus-Editor']
    ]) {
        const html=renderEditButton({size:'small',language,projectURL:'https://example.com/demo.sb3'});
        assert.ok(html.includes('class="twpe-edit-button twpe-edit-button--small"'));
        assert.ok(html.includes(`title="${label}" aria-label="${label}"`));
        assert.ok(html.includes(`<span>${text}</span>`));
        assert.ok(html.includes('width="24" height="24"'));
        assert.ok(html.includes('project_url=https%3A%2F%2Fexample.com%2Fdemo.sb3'));
    }
    assert.equal(renderEditButton({size:'normal'}),renderEditButton());
    assert.throws(()=>renderEditButton({size:'tiny'}),/size/);
});
