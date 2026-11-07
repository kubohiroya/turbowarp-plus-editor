const {verifyEditorRevision} = require('../../../scripts/site/editor-revision.ts');

module.exports = async () => {
    const url = new URL('build-info.json', process.env.E2E_BASE_URL);
    url.searchParams.set('e2e_time', String(Date.now()));
    await verifyEditorRevision(url.href, 'siteRevision', async () => {
        const response = await fetch(url, {cache: 'no-store', signal: AbortSignal.timeout(10_000)});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
    });
};
