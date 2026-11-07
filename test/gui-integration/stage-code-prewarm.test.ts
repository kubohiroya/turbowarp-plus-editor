import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import test from 'node:test';
import {JSDOM} from 'jsdom';
import {attachStageCodePrewarm} from '../../packages/editor-views/stage-code-prewarm.ts';

function setup(drawDuration = 6) {
    const {window} = new JSDOM('<input>', {pretendToBeVisual: true});
    const {document} = window;
    const input = document.querySelector('input');
    input.focus();
    let time = 0;
    let sequence = 0;
    let drawn = 0;
    let disposed = 0;
    const timers = new Map<number, {at: number; callback: () => void}>();
    const idle = new Map<number, IdleRequestCallback>();
    Object.defineProperty(window.performance, 'now', {value: () => time});
    window.setTimeout = (callback: () => void, delay: number) => {
        timers.set(++sequence, {at: time + delay, callback});
        return sequence;
    };
    window.clearTimeout = id => { timers.delete(id); };
    window.requestIdleCallback = callback => {
        idle.set(++sequence, callback);
        return sequence;
    };
    window.cancelIdleCallback = id => { idle.delete(id); };
    const advance = (amount: number) => {
        time += amount;
        for (const [id, timer] of timers) {
            if (timer.at > time) continue;
            timers.delete(id);
            timer.callback();
        }
    };
    const slice = () => {
        const [id, callback] = idle.entries().next().value;
        idle.delete(id);
        callback({didTimeout: false, timeRemaining: () => 10});
    };
    const makeStage = () => ({
        isStage: true, comments: {}, variables: {},
        blocks: {toXML: () => '<block type="document"><field name="DOCUMENT">reference</field></block>' +
            Array.from({length: 100}, (_, index) =>
            `<block type="test"><field name="label">value${index}</field></block>`).join('')}
    });
    let stage = makeStage();
    const runtime = Object.assign(new EventEmitter(), {getTargetForStage: () => stage});
    const vm = Object.assign(new EventEmitter(), {runtime, editingTarget: {isStage: false}});
    const workspace = {options: {RTL: false, colours: {}, pathToMedia: ''}, scale: 1, isDragging: () => false};
    let eventsDisabled = 0;
    const preview = {setResizesEnabled() {}, dispose() { assert.equal(eventsDisabled, 1); disposed++; }};
    const blocks = {
        mainWorkspace: workspace,
        getMainWorkspace: () => blocks.mainWorkspace,
        inject() { blocks.mainWorkspace = preview as unknown as typeof workspace; return preview; },
        Events: {disable() { eventsDisabled++; }, enable() { eventsDisabled--; }},
        Field: {stopCache() {}},
        Xml: {
            textToDom: (xml: string) => new window.DOMParser().parseFromString(xml, 'text/xml').documentElement,
            domToWorkspace() {},
            domToBlock(block: Element) {
                assert.equal(block.getAttribute('id'), null);
                assert.equal(block.getAttribute('type'), 'test');
                assert.equal(eventsDisabled, 1);
                assert.equal(blocks.getMainWorkspace(), workspace);
                drawn++;
                time += drawDuration;
                return {dispose() {}};
            }
        }
    };
    const host = attachStageCodePrewarm({vm, ScratchBlocks: blocks, workspace, document,
        canUse: () => true, onError: (error: unknown) => { throw error; }
    } as unknown as Parameters<typeof attachStageCodePrewarm>[0]);
    return {host, window, document, input, vm, workspace, blocks, runtime, advance, slice, idle,
        replaceStage() { stage = makeStage(); },
        get stage() { return stage; },
        get drawn() { return drawn; },
        get disposed() { return disposed; }
    };
}

test('prewarming yields between blocks and gives pending keyboard input priority without stealing focus', () => {
    const f = setup();
    f.advance(250);
    f.slice();
    assert.equal(f.drawn, 1);
    assert.equal(f.idle.size, 1);
    f.input.dispatchEvent(new f.window.KeyboardEvent('keydown', {bubbles: true}));
    f.slice();
    assert.equal(f.drawn, 1);
    f.advance(249);
    assert.equal(f.idle.size, 0);
    f.advance(1);
    f.slice();
    assert.equal(f.drawn, 2);
    assert.equal(f.document.activeElement, f.input);
    assert.equal(f.blocks.getMainWorkspace(), f.workspace);
    f.host.dispose();
    assert.equal(f.disposed, 1);
    assert.equal(f.idle.size, 0);
    f.window.close();
});

test('an edit, a project replacement and a foreground background selection each cancel pending drawing', () => {
    const f = setup();
    f.advance(250);
    f.slice();
    f.vm.emit('PROJECT_CHANGED');
    assert.equal(f.disposed, 1);
    assert.equal(f.idle.size, 0);

    f.runtime.emit('PROJECT_LOADED');
    f.advance(250);
    f.slice();
    f.runtime.emit('RUNTIME_DISPOSED');
    assert.equal(f.disposed, 2);
    assert.equal(f.idle.size, 0);

    f.replaceStage();
    f.runtime.emit('PROJECT_LOADED');
    f.advance(250);
    f.slice();
    f.vm.editingTarget = f.stage;
    f.vm.emit('targetsUpdate');
    assert.equal(f.drawn, 3);
    assert.equal(f.disposed, 3);
    assert.equal(f.idle.size, 0);
    assert.equal(f.document.querySelector('[data-tw-plus-stage-code-prewarm]'), null);
    f.host.dispose();
    f.window.close();
});

test('prewarming abandons the remaining work after a synchronous block overruns the budget', () => {
    const f = setup(55);
    f.advance(250);
    f.slice();
    assert.equal(f.drawn, 1);
    assert.equal(f.disposed, 1);
    assert.equal(f.idle.size, 0);
    f.host.dispose();
    f.window.close();
});
