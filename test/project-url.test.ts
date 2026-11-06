import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fetchProjectUrl} from '../site/project-url.ts';

const releases = 'https://github.com/kubohiroya/turbowarp-kamishibai-app/releases/download';
const downloads = 'https://kubohiroya.github.io/turbowarp-kamishibai-app/downloads';

test('official Kamishibai release links use the available Pages file for the same version', async () => {
    for (const version of ['4.0.0-rc.79', '4.0.0-rc.78', '5.1.2', '5.1.2-beta.1%2Bbuild.2']) {
        const project = `${releases}/v${version}/kamishibai-${version}.sb3`;
        const response = new Response('SB3', {headers: {'content-type': 'application/octet-stream'}});
        const requests: [string, RequestInit | undefined][] = [];
        assert.equal(await fetchProjectUrl(project, async (url, init) => {
            requests.push([String(url), init]);
            return response;
        }), response);
        assert.deepEqual(requests, [[`${downloads}/kamishibai-${version}.sb3`, {redirect: 'error'}]]);
    }
});

test('a missing or unavailable Pages file falls back to the exact original URL', async () => {
    const project = `${releases}/v4.0.0-rc.34/kamishibai-4.0.0-rc.34.sb3`;
    const mirror = `${downloads}/kamishibai-4.0.0-rc.34.sb3`;
    for (const result of [new Response(null, {status: 404}), new Response('<html>', {
        headers: {'content-type': 'text/html; charset=utf-8'}
    }), new TypeError('Failed to fetch')]) {
        const requests: string[] = [];
        const original = new Response('original');
        assert.equal(await fetchProjectUrl(project, async url => {
            requests.push(String(url));
            if (url === project) return original;
            if (result instanceof Error) throw result;
            return result;
        }), original);
        assert.deepEqual(requests, [mirror, project]);
    }
});

test('other project URLs use their original fetch path without probing Pages', async () => {
    for (const project of [
        `${downloads}/kamishibai-4.0.0-rc.79.sb3`,
        `${releases}/v4.0.0-rc.78/kamishibai-4.0.0-rc.79.sb3`,
        `${releases}/v3.2.3/kamishibai-3.2.sb3`,
        `${releases}/v4.0.0%2Frc.79/kamishibai-4.0.0%2Frc.79.sb3`,
        `${releases}/v%FF/kamishibai-%FF.sb3`,
        `${releases.replace('github.com/', 'github.com.example/')}/v4.0.0/kamishibai-4.0.0.sb3`,
        'data:application/octet-stream;base64,AA=='
    ]) {
        const requests: string[] = [];
        await fetchProjectUrl(project, async url => {
            requests.push(String(url));
            return new Response();
        });
        assert.deepEqual(requests, [project]);
    }
});
