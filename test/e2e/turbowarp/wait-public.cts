const fs = require('node:fs');
const {setTimeout: pause} = require('node:timers/promises');

const main = async () => {
    const deadline = Date.now() + 90_000;
    const attempts = [];
    try {
        while (Date.now() < deadline) {
            const url = new URL('build-info.json', process.env.E2E_BASE_URL);
            url.searchParams.set('e2e_revision', process.env.E2E_EXPECT_GUI_REVISION);
            url.searchParams.set('e2e_time', String(Date.now()));
            try {
                const response = await fetch(url, {cache: 'no-store', signal: AbortSignal.timeout(10_000)});
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const info = await response.json();
                attempts.push({time: new Date().toISOString(),
                    revision: info.revision,
                    coreRevision: info.coreRevision, siteRevision: info.siteRevision, securityVersion: info.securityVersion});
                if (info.revision === process.env.E2E_EXPECT_GUI_REVISION &&
                    info.coreRevision === process.env.E2E_EXPECT_CORE_REVISION &&
                    info.securityVersion === process.env.E2E_EXPECT_SECURITY_VERSION &&
                    info.siteRepository === 'https://github.com/kubohiroya/turbowarp-plus-editor' &&
                    (!process.env.E2E_EXPECT_SITE_REVISION || info.siteRevision === process.env.E2E_EXPECT_SITE_REVISION)) return;
            } catch (error) {
                attempts.push({time: new Date().toISOString(), error: error.message});
            }
            // Poll deployment state; test assertions themselves are never retried.
            await pause(Math.min(3000, Math.max(0, deadline - Date.now())));
        }
        throw new Error('The expected Pages GUI/core revisions did not become available within 90 seconds.');
    } finally {
        fs.mkdirSync('test-results/block-editor-deployment', {recursive: true});
        const output = 'test-results/block-editor-deployment/deployment-wait.json';
        fs.writeFileSync(output, JSON.stringify(attempts, null, 2));
    }
};
main().catch((error: Error & {code?: string; status?: number; errors?: Error[]}) => {
    if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
            '\nBlock editor E2E: deployment readiness failed; browser/UI and native OS picker not run.\n');
    }
    console.error(error); process.exitCode = 1;
});
