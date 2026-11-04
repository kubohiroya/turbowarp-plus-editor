import assert from 'node:assert/strict';
import {test} from 'node:test';
import {findVerifiedRun, markerName} from '../scripts/ci/reuse-pr-verification.ts';

const repository = 'owner/editor';
const tree = 'b'.repeat(40);
const run = (patch = {}) => ({id: 7, event: 'pull_request', status: 'completed', conclusion: 'success',
    path: '.github/workflows/ci.yml', repository: {full_name: repository}, head_repository: {full_name: repository},
    html_url: 'https://github.com/owner/editor/actions/runs/7', ...patch});
const api = (runs, artifacts = [{name: markerName(tree), expired: false, workflow_run: {id: 7}}]) => async path => {
    if (path.startsWith('artifacts?')) {
        assert.equal(path, `artifacts?name=${markerName(tree)}&per_page=20`);
        return {artifacts};
    }
    const id = Number(path.split('/')[1]);
    return runs.find(item => item.id === id);
};

test('a successful pull request run of this repository verifies its tree', async () => {
    assert.deepEqual(await findVerifiedRun({repository, tree, get: api([run()])}),
        {runId: 7, url: 'https://github.com/owner/editor/actions/runs/7'});
});

test('anything short of a successful pull request run here leaves every check to run', async () => {
    for (const patch of [{conclusion: 'failure'}, {status: 'in_progress', conclusion: null}, {event: 'push'},
        {path: '.github/workflows/other.yml'}, {head_repository: {full_name: 'fork/editor'}}]) {
        assert.equal(await findVerifiedRun({repository, tree, get: api([run(patch)])}), null, JSON.stringify(patch));
    }
    assert.equal(await findVerifiedRun({repository, tree, get: api([run()], [])}), null);
    assert.equal(await findVerifiedRun({repository, tree,
        get: api([run()], [{name: markerName(tree), expired: true, workflow_run: {id: 7}}])}), null);
    assert.equal(await findVerifiedRun({repository, tree,
        get: api([run()], [{name: markerName('c'.repeat(40)), expired: false, workflow_run: {id: 7}}])}), null);
});

test('a marker names one full tree', () => {
    assert.equal(markerName(tree), `ci-verified-tree-${tree}`);
    assert.throws(() => markerName('main'), /full tree SHA/);
});
