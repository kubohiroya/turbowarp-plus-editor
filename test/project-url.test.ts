import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {runInNewContext} from 'node:vm';
import {brandEditor} from '../scripts/site/brand-editor.ts';

test('the three Web entry points resolve the official rc.79 release before starting the GUI', async t => {
    const release = 'https://github.com/kubohiroya/turbowarp-kamishibai-app/releases/download/v4.0.0-rc.79/kamishibai-4.0.0-rc.79.sb3';
    const mirror = 'https://kubohiroya.github.io/turbowarp-kamishibai-app/downloads/kamishibai-4.0.0-rc.79.sb3';
    const output = await mkdtemp(path.join(tmpdir(), 'twpe-project-url-'));
    t.after(() => rm(output, {recursive: true, force: true}));
    const files = ['editor.html', 'fullscreen.html', 'player.html'];
    await Promise.all(files.map(name => writeFile(path.join(output, name),
        '<html><head><title>TurboWarp</title></head><body><script src="gui.js"></script></body></html>')));
    await brandEditor(output);

    for (const name of files) {
        const html = await readFile(path.join(output, name), 'utf8');
        const script = html.match(/<head>.*?<script>([\s\S]*?)<\/script><\/head>/);
        assert.ok(script, `${name} installs the resolver before the GUI`);
        for (const project of [release, mirror, release.replaceAll('rc.79', 'rc.34'),
            release.replace('github.com/', 'github.com.example/'), 'data:application/octet-stream;base64,AA==', null]) {
            const url = new URL(name, 'https://kubohiroya.github.io/turbowarp-plus-editor/');
            url.searchParams.set('lang', 'ja');
            url.hash = 'example';
            if (project !== null) url.searchParams.set('project_url', project);
            let replacement: URL | undefined;
            const state = {sample: true};
            runInNewContext(script[1], {URL, location: {href: url.href}, history: {
                state,
                replaceState(value: unknown, _unused: string, href: string) {
                    assert.equal(value, state);
                    replacement = new URL(href);
                }
            }});
            if (project === release) {
                url.searchParams.set('project_url', mirror);
                assert.equal(replacement?.href, url.href);
            } else assert.equal(replacement, undefined);
        }
    }
});
