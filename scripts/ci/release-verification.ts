import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export function requireReleaseVerification({tag, version, revision, result}: {
    tag: string; version: string; revision: string; result: string;
}) {
    if (tag !== `v${version}` || !/^[0-9a-f]{40}$/.test(revision)) {
        throw new Error('Release tag, package version or source revision does not match');
    }
    const prerelease = tag.includes('-') && !tag.includes('+');
    if (result !== 'success' && !(prerelease && result === 'skipped')) {
        throw new Error('Publication requires successful full verification of the tagged revision');
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const {GITHUB_REF_NAME: tag, GITHUB_SHA: revision, FULL_VERIFICATION_RESULT: result} = process.env;
    const {version} = (await import('../../package.json', {with: {type: 'json'}})).default;
    requireReleaseVerification({tag, version, revision, result});
    const head = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
    if (head !== revision) throw new Error('Release checkout does not match the tagged revision');
}
