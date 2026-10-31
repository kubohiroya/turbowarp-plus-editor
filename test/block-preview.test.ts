import {test} from 'node:test';import assert from 'node:assert/strict';
import {compilePreviewDefinition} from '../site/yaml-editor/block-preview.ts';
test('declarative authoring blocks retain icons, named inputs, branches and native statement shapes',()=>{
 const result=compilePreviewDefinition({opcode:'owner_scene',blockType:'command',text:'scene [NAME] JSON [VALUE]',branchCount:1,blockIconURI:'data:image/svg+xml,test',arguments:{NAME:{type:'string'},VALUE:{type:'string'}}},'preview_scene');
 assert.equal(result.message0,'%1 scene %2 JSON %3');assert.deepEqual(result.args0.map(x=>x.type),['field_image','input_value','input_value']);assert.equal(result.args1[0].name,'SUBSTACK');assert(result.extensions.includes('shape_statement'));assert.equal(result.type,'preview_scene');
});
test('static dropdowns keep their exact declared options without executing owner code',()=>{
 const definition={blockType:'command',text:'YAML [TYPE] [VALUE]',arguments:{TYPE:{type:'string',menu:'types'},VALUE:{type:'string'}}};const result=compilePreviewDefinition(definition,'preview_scalar',{types:{acceptReporters:false,items:[{text:'string',value:'string'},'number']}});
 assert.deepEqual(result.args0[0].options,[['string','string'],['number','number']]);assert.throws(()=>compilePreviewDefinition(definition,'bad',{types:{items:()=>['string']}}),/static items/);
});
test('hats and reporter previews use the corresponding native shapes',()=>{
 assert(compilePreviewDefinition({text:'document',blockType:'hat'},'hat').extensions.includes('shape_hat'));
 assert(compilePreviewDefinition({text:'value',blockType:'reporter'},'value').extensions.includes('output_string'));
 assert.throws(()=>compilePreviewDefinition({text:'missing [VALUE]',arguments:{}},'missing'),/missing argument/);
});
