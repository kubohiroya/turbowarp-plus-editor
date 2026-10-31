import assert from 'node:assert/strict';
import test from 'node:test';
import {projectPatchWorkspaceAdapterSymbol} from '@kubohiroya/turbowarp-embedded-yaml/project-views';
import {attachDocumentWorkspacePatch} from '../site/yaml-editor/workspace-patch.ts';

test('the workspace capability recognizes only current own native block registrations', () => {
    const vm = {}, Blocks = Object.create({inherited: {init() {}}});
    const B = {Blocks, Xml: {domToWorkspace() {}, textToDom() {}}};
    const detach = attachDocumentWorkspacePatch(vm, B);
    const port = vm[projectPatchWorkspaceAdapterSymbol];
    const menu = 'fixture_menu_registered';
    assert.equal(port.hasBlockDefinition(menu), false);
    Blocks[menu] = {init() {}};
    assert.equal(port.hasBlockDefinition(menu), true);
    assert.equal(port.hasBlockDefinition('fixture_menu_unknown'), false);
    assert.equal(port.hasBlockDefinition('inherited'), false);
    assert.equal(port.hasBlockDefinition('__proto__'), false);
    assert.equal(port.hasBlockDefinition(null), false);
    Blocks.malformed = {init: 'not callable'};
    assert.equal(port.hasBlockDefinition('malformed'), false);
    Object.defineProperty(Blocks, 'getter', {get() { throw Error('not a native registration'); }});
    assert.equal(port.hasBlockDefinition('getter'), false);
    delete Blocks[menu];
    assert.equal(port.hasBlockDefinition(menu), false);
    detach();
    assert.equal(vm[projectPatchWorkspaceAdapterSymbol], undefined);
});
