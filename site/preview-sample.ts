export function createPreviewSampleURL(siteURL, language = 'ja') {
    if (!['ja', 'en'].includes(language)) throw new TypeError('Unsupported sample language');
    const base = new URL(siteURL);
    const target = new URL('editor.html', base);
    target.searchParams.set('lang', language);
    target.searchParams.set('twPlusBlockPreview', '1');
    target.searchParams.set('twPlusYamlEditor', '1');
    target.searchParams.set('project_url', new URL('samples/block-preview/block-preview-rc77.sb3', base).href);
    return target.href;
}

export function updatePreviewSampleLinks(document, siteURL, language) {
    for (const link of document.querySelectorAll('[data-preview-sample]')) {
        link.href = createPreviewSampleURL(siteURL, language);
    }
    for (const link of document.querySelectorAll('[data-preview-guide]')) {
        const target = new URL('samples/block-preview/index.html', siteURL);
        target.searchParams.set('lang', language);
        link.href = target.href;
    }
}
