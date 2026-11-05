import {appendFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

/**
 * Whether a pull request's CI already ran the browser checks on exactly this source tree.
 *
 * A squash merge onto an unchanged base produces the tree the pull request's CI tested, so main
 * can skip running the same browser checks again. Each successful pull request run leaves an
 * artifact named after the tree it tested; this looks for one from this repository's own CI.
 * Anything it cannot confirm — a missing or expired marker, a fork, a run that did not succeed,
 * an API error — answers "not verified", and main runs every check as before.
 */

const sha = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);

export const markerName = tree => {
    if (!sha(tree)) throw new Error('A full tree SHA is required');
    return `ci-verified-tree-${tree}`;
};

export function isVerifiedPullRequestRun(run, repository, id) {
    return run?.id === id && run.event === 'pull_request' && run.status === 'completed' &&
        run.conclusion === 'success' && run.path === '.github/workflows/ci.yml' &&
        run.repository?.full_name === repository && run.head_repository?.full_name === repository;
}

export async function findVerifiedRun({repository, tree, get, name = markerName(tree)}) {
    const listing = await get(`artifacts?name=${encodeURIComponent(name)}&per_page=20`);
    if (!Array.isArray(listing?.artifacts)) return null;
    for (const artifact of listing.artifacts) {
        if (artifact.name !== name || artifact.expired) continue;
        const id = artifact.workflow_run?.id;
        if (!Number.isSafeInteger(id) || id <= 0) continue;
        const run = await get(`runs/${id}`);
        if (isVerifiedPullRequestRun(run, repository, id)) {
            return {runId: id, url: run.html_url};
        }
    }
    return null;
}

export function actionsAPI(repository, token) {
    const api = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
    return async path => {
        const response = await fetch(`${api}/repos/${repository}/actions/${path}`, {
            headers: {Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
                'X-GitHub-Api-Version': '2022-11-28'},
            signal: AbortSignal.timeout(15_000), redirect: 'error'
        });
        if (!response.ok) throw new Error(`GitHub Actions API returned HTTP ${response.status}`);
        return response.json();
    };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const {GITHUB_REPOSITORY: repository, GH_TOKEN: token, TREE: tree, GITHUB_OUTPUT: output} = process.env;
    const get = actionsAPI(repository, token);
    let found = null;
    try {
        found = await findVerifiedRun({repository, tree, get});
    } catch (error) {
        // Failing to confirm is never a reason to skip a check; it only means running it.
        console.log(`Could not confirm an earlier verification (${error.message}); running every check.`);
    }
    if (found) console.log(`Tree ${tree} passed the browser checks in pull request CI run ${found.url}.`);
    else console.log(`No pull request CI run verified tree ${tree}; running every check.`);
    if (output) appendFileSync(output, `verified=${found ? 'true' : 'false'}\n`);
}
