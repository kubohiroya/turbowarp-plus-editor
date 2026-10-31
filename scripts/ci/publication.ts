import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {configuration, requireSuccessfulCI} from './require-successful-ci.ts';
import {sha} from '../site/source.ts';

const env = process.env;
assert.equal(env.GITHUB_REPOSITORY, 'kubohiroya/turbowarp-plus-editor');
assert.ok(sha(env.EXPECTED_REVISION));
const source = await requireSuccessfulCI(configuration({...env, CI_WORKFLOW_FILE: 'ci.yml', CI_BRANCH: 'main', CI_EVENT: 'push'}));
if (process.argv[2] !== '--release') {
    const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/branches/main`, {
        headers: {Accept: 'application/vnd.github+json', Authorization: `Bearer ${env.GH_TOKEN}`},
        signal: AbortSignal.timeout(15000)
    });
    assert.ok(response.ok, 'Cannot verify the current main revision');
    assert.equal((await response.json()).commit.sha, env.EXPECTED_REVISION, 'A newer main revision supersedes this deployment');
}
if (env.GITHUB_OUTPUT) await fs.appendFile(env.GITHUB_OUTPUT, `runId=${source.runId}\nattempt=${source.attempt}\n`);
console.log(`Verified normal CI run ${source.runId}, attempt ${source.attempt}, source ${env.EXPECTED_REVISION}`);
