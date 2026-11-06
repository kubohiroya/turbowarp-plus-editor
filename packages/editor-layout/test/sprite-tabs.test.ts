import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import test from 'node:test';
import {JSDOM} from 'jsdom';
import {mountSpriteTabs} from '../src/sprite-tabs.ts';

test('sprite tabs reuse the native editor, preserve its selected section, and follow the project', t => {
    const dom = new JSDOM('<main></main>', {pretendToBeVisual: true});
    const globals = {
        window: dom.window,
        document: dom.window.document,
        Node: dom.window.Node,
        ResizeObserver: class {
            observe() {}
            unobserve() {}
            disconnect() {}
        }
    };
    Object.assign(globalThis, globals);
    t.after(() => {
        dom.window.close();
        for (const key of Object.keys(globals)) Reflect.deleteProperty(globalThis, key);
    });
    const sprite = (id: string, name: string) => ({
        id, name, isOriginal: true, isStage: false, getName() { return this.name; }
    });
    const first = sprite('first', 'First');
    const second = sprite('second', 'Second');
    const vm = Object.assign(new EventEmitter(), {
        runtime: {targets: [first, second]},
        editingTarget: first,
        setEditingTarget(id: string) {
            this.editingTarget = this.runtime.targets.find(target => target.id === id);
            this.emit('targetsUpdate');
        }
    });
    const root = dom.window.document.querySelector('main');
    const content = dom.window.document.createElement('div');
    let section = 0;
    let selected = '';
    const controller = mountSpriteTabs(root, content, {vm, getSection: () => section,
        activateSection: next => { section = next; }, selectTarget: id => { selected = id; }, resize() {},
        reopenLabel: 'Reopen selected sprite'});
    try {
        const tab = (title: string) => [...root.querySelectorAll<HTMLElement>('.dv-tab')]
            .find(node => node.textContent.includes(title));
        assert.ok(tab('First'));
        assert.ok(tab('Second'));
        const firstSlot = content.parentElement;
        section = 1;
        controller.select(second.id);
        assert.equal(vm.editingTarget, second);
        assert.equal(selected, second.id);
        assert.notEqual(content.parentElement, firstSlot);
        section = 2;
        vm.setEditingTarget(first.id);
        assert.equal(content.parentElement, firstSlot);
        assert.equal(section, 1);

        second.name = 'Renamed';
        vm.emit('targetsUpdate');
        assert.ok(tab('Renamed'));
        controller.select(second.id);
        assert.equal(section, 2);
        tab('Renamed').querySelector<HTMLElement>('.dv-default-tab-action').click();
        assert.equal(vm.editingTarget, first);
        assert.equal(tab('Renamed'), undefined);
        controller.select(second.id);
        assert.ok(tab('Renamed'));
        assert.equal(section, 2);

        const replacement = sprite(first.id, 'New project sprite');
        vm.runtime.targets = [replacement];
        vm.setEditingTarget(replacement.id);
        assert.equal(selected, replacement.id);
        assert.ok(tab('New project sprite'));
        assert.equal(root.querySelectorAll('.dv-tab').length, 1);

        tab('New project sprite').querySelector<HTMLElement>('.dv-default-tab-action').click();
        assert.equal(selected, '');
        vm.emit('targetsUpdate');
        assert.equal(root.querySelectorAll('.dv-tab').length, 0);
        controller.select(replacement.id);
        assert.ok(root.contains(content));
    } finally {
        controller.dispose();
    }
    assert.equal(vm.listenerCount('targetsUpdate'), 0);
});
