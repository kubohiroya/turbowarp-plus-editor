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

test('Scratch project page URLs load project data through the Scratch project API', async () => {
    for (const project of [
        'https://scratch.mit.edu/projects/1390470145/',
        'https://scratch.mit.edu/projects/1390470145',
        'http://www.scratch.mit.edu/projects/1390470145/editor/',
        'https://scratch.mit.edu/projects/1390470145/fullscreen',
        'https://scratch.mit.edu/projects/1390470145/?foo=1#comments'
    ]) {
        const requests: string[] = [];
        const projectData = new Response('{"targets":[]}');
        assert.equal(await fetchProjectUrl(project, async url => {
            requests.push(String(url));
            if (String(url).startsWith('https://trampoline.turbowarp.org/')) {
                return Response.json({id: 1390470145, project_token: 'a b'});
            }
            return projectData;
        }), projectData);
        assert.deepEqual(requests, [
            'https://trampoline.turbowarp.org/api/projects/1390470145',
            'https://projects.scratch.mit.edu/1390470145?token=a%20b'
        ]);
    }
});

test('an unavailable Scratch project reports an error instead of fetching the HTML page', async () => {
    const requests: string[] = [];
    await assert.rejects(fetchProjectUrl('https://scratch.mit.edu/projects/1/', async url => {
        requests.push(String(url));
        return new Response(null, {status: 404});
    }), /Could not access Scratch project 1: status 404/);
    assert.deepEqual(requests, ['https://trampoline.turbowarp.org/api/projects/1']);
});

test('other project URLs use their original fetch path without probing Pages', async () => {
    for (const project of [
        `${downloads}/kamishibai-4.0.0-rc.79.sb3`,
        `${releases}/v4.0.0-rc.78/kamishibai-4.0.0-rc.79.sb3`,
        `${releases}/v3.2.3/kamishibai-3.2.sb3`,
        `${releases}/v4.0.0%2Frc.79/kamishibai-4.0.0%2Frc.79.sb3`,
        `${releases}/v%FF/kamishibai-%FF.sb3`,
        `${releases.replace('github.com/', 'github.com.example/')}/v4.0.0/kamishibai-4.0.0.sb3`,
        'data:application/octet-stream;base64,AA==',
        'https://scratch.mit.edu/projects/1390470145/remixes/',
        'https://scratch.mit.edu/projects/abc/',
        'https://scratch.mit.edu.example/projects/1390470145/'
    ]) {
        const requests: string[] = [];
        await fetchProjectUrl(project, async url => {
            requests.push(String(url));
            return new Response();
        });
        assert.deepEqual(requests, [project]);
    }
});
