import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProjectDiagnostics, diagnosticText} from '../../site/project-tools/diagnostics.ts';

test('diagnostics retain failed attempts separately, bound events and preserve exact source and mode', () => {
    const store = createProjectDiagnostics();
    assert.deepEqual(store.snapshot(), []);
    store.begin('Failed project');
    store.describe({extensions: [{id: 'test', source: {url: 'https://example.test/x.js'}, execution: 'sandboxed', sha256: 'a'.repeat(64)}]});
    for (let i = 0; i < 60; i++) store.record({type: 'verified', id: String(i)});
    store.finish({phase: 'failed', code: 'DIGEST_MISMATCH', message: '<script>literal</script>'}, 'Failed project');
    store.begin('Current project'); store.finish({phase: 'loaded'}, 'Current project');
    const sessions = store.snapshot();
    assert.equal(sessions.length, 2);
    assert.equal(sessions[1].events.length, 50);
    assert.equal(sessions[1].events.at(-1).code, 'DIGEST_MISMATCH');
    assert.equal(sessions[1].extensions[0].execution, 'sandboxed');
    assert.equal(sessions[1].extensions[0].source, 'https://example.test/x.js');
    assert.equal(JSON.parse(diagnosticText(sessions[1])).title, 'Failed project');
    for (let i = 0; i < 8; i++) store.begin(String(i));
    assert.equal(store.snapshot().length, 5);
    store.dispose(); assert.deepEqual(store.snapshot(), []);
});
test('diagnostics snapshots are detached and subscriber failures cannot change a loading result', () => {
    const store = createProjectDiagnostics(); let calls = 0;
    store.subscribe(() => { throw new Error('view failure'); });
    const stop = store.subscribe(() => calls++);
    store.begin(); store.record({type: 'review', source: {path: 'extensions/a.js'}, execution: 'unsandboxed'});
    const snapshot = store.snapshot(); snapshot[0].events.length = 0;
    assert.equal(store.snapshot()[0].events.length, 1);
    assert.equal(calls, 2); stop(); store.record({type: 'authorized'}); assert.equal(calls, 2);
});
