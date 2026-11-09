import assert from 'node:assert/strict';
import {test} from 'node:test';
import {saveProjectAs, type ProjectFileStorage} from '../src/project-file-dialogs.ts';

function storage(log: string[]): ProjectFileStorage {
    return {
        canSave: true,
        filename: 'Project.sb3',
        async download(_name, serialize) {log.push(`write:${serialize(() => 'data')}`);},
        async write() {throw new Error('unused');},
        finish() {log.push('finish');},
        fail(error) {log.push(`fail:${(error as Error).message}`);}
    };
}

test('save as collects edits held by other windows before serializing and can be retried', async () => {
    const log: string[] = [];
    let busy = true;
    const options = {
        current: () => true,
        unchanged: () => true,
        serialize: <T>(_title: string, run: () => T) => run(),
        committed: () => log.push('committed'),
        async collect() {
            log.push('collect');
            if (busy) throw new Error('window busy');
        }
    };
    assert.equal(await saveProjectAs(storage(log), 'Project', options), false);
    assert.deepEqual(log, ['collect', 'fail:window busy']);
    busy = false;
    log.length = 0;
    assert.equal(await saveProjectAs(storage(log), 'Project', options), true);
    assert.deepEqual(log, ['collect', 'write:data', 'committed', 'finish']);
});
