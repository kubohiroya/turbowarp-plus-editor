import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isPreviewSampleLaunch, initializePreviewSampleFocus} from '../site/samples/block-preview/focus.ts';

const site = 'https://example.com/turbowarp-plus-editor/';
const moduleURL = new URL('samples/block-preview/focus.js', site).href;
const sample = new URL('samples/block-preview/block-preview-rc77.sb3', site).href;
const launch = project => {
    const page = new URL('editor.html?lang=ja&twPlusBlockPreview=1&twPlusYamlEditor=1', site);
    page.searchParams.set('project_url', project);
    return page.href;
};

test('the sample initial view recognizes existing public links and local preview origins', () => {
    assert(isPreviewSampleLaunch(launch(sample), moduleURL));
    assert(isPreviewSampleLaunch(launch(`${sample}?revision=77`), moduleURL));
    assert(isPreviewSampleLaunch(launch('samples/block-preview/block-preview-rc77.sb3'), moduleURL));
    const local = 'http://127.0.0.1:8732/turbowarp-plus-editor/';
    assert(isPreviewSampleLaunch(launch(sample).replaceAll('https%3A%2F%2Fexample.com', 'http%3A%2F%2F127.0.0.1%3A8732')
        .replace(site, local), moduleURL.replace(site, local)));
});

test('ordinary projects, different origins and lookalike sample paths keep their initial view', () => {
    const projects = ['https://other.example/turbowarp-plus-editor/samples/block-preview/block-preview-rc77.sb3',
        'http://example.com/turbowarp-plus-editor/samples/block-preview/block-preview-rc77.sb3',
        'https://example.com/other/samples/block-preview/block-preview-rc77.sb3',
        sample.replace('rc77', 'rc79'), `${sample}.backup`, 'javascript:alert(1)', 'data:application/zip;base64,UEs='];
    for (const location of [new URL('editor.html', site).href, ...projects.map(launch),
        launch(sample).replace('editor.html', 'player.html'), sample, 'not a URL']) {
        assert.equal(isPreviewSampleLaunch(location, moduleURL), false, location);
        assert.doesNotThrow(() => initializePreviewSampleFocus({moduleURL, window: {
            location: {href: location},
            get vm() { throw new Error('Ordinary projects must not access Editor state'); },
            setTimeout() { throw new Error('Ordinary projects must not start polling'); },
            addEventListener() { throw new Error('Ordinary projects must not attach listeners'); }
        }})());
    }
});
