import test from 'node:test';
import assert from 'node:assert/strict';
import { focusDocumentReference } from '../site/yaml-editor/focus-document.js';
const reference = { providerId: 'owner', documentId: 'document' };
const target = (id, scripts) => ({
    id,
    isOriginal: true,
    blocks: { getScripts: () => Object.keys(scripts), getBlock: (key) => scripts[key] }
});
const run = (vm) =>
    focusDocumentReference({
        vm,
        reference,
        registry: { getHatOpcodes: () => ['known_hat'] },
        readReference: (block) => {
            if (block.error) throw Error('bad ref');
            return block.reference;
        }
    });
test('a committed view selects its owning target through public VM APIs and live document refs', () => {
    const stage = target('stage', { 'renamed-short-id': { opcode: 'known_hat', reference } }),
        sprite = target('sprite', {}),
        calls = [];
    const vm = {
        runtime: { targets: [stage, sprite] },
        editingTarget: sprite,
        setEditingTarget(id) {
            calls.push(id);
            this.editingTarget = stage;
        }
    };
    assert.deepEqual(run(vm), { targetId: 'stage', rootId: 'renamed-short-id' });
    assert.deepEqual(calls, ['stage']);
});
test('unknown opcodes, other documents, malformed refs and clones do not redirect the editor', () => {
    const unknown = target('unknown', { root: { opcode: 'suffix_embeddedYaml', reference } }),
        other = target('other', {
            root: { opcode: 'known_hat', reference: { ...reference, documentId: 'other' } }
        }),
        malformed = target('bad', { root: { opcode: 'known_hat', error: true } }),
        clone = {
            ...target('clone', { root: { opcode: 'known_hat', reference } }),
            isOriginal: false
        };
    let calls = 0;
    assert.equal(
        run({
            runtime: { targets: [unknown, other, malformed, clone] },
            setEditingTarget() {
                calls++;
            }
        }),
        null
    );
    assert.equal(calls, 0);
});
test('the current matching target is retained when multiple valid references exist', () => {
    const stage = target('stage', { root: { opcode: 'known_hat', reference } }),
        sprite = target('sprite', { root: { opcode: 'known_hat', reference } }),
        calls = [];
    assert.equal(
        run({
            runtime: { targets: [stage, sprite] },
            editingTarget: sprite,
            setEditingTarget: (id) => calls.push(id)
        }).targetId,
        'sprite'
    );
    assert.deepEqual(calls, ['sprite']);
});
