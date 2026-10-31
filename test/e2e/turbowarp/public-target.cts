const fs = require('node:fs');
const path = require('node:path');
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const main = () => {
    if (process.env.GITHUB_REPOSITORY !== 'kubohiroya/turbowarp-plus-editor' || !sha(process.env.EXPECTED_REVISION)) {
        throw new Error('Use the TurboWarp-Plus-Editor repository and an explicit full site revision.');
    }
    const pins = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../site/source.json'), 'utf8'));
    if (pins.guiRepository !== 'kubohiroya/scratch-gui' || !sha(pins.guiRevision) || !sha(pins.coreRevision) ||
        pins.securityPackage !== '@kubohiroya/turbowarp-extension-security-dialog' || !pins.securityVersion) {
        throw new Error('Invalid source pins in the selected site commit.');
    }
    const output = {base_url: 'https://kubohiroya.github.io/turbowarp-plus-editor/',
        gui_revision: pins.guiRevision, core_revision: pins.coreRevision,
        site_revision: process.env.EXPECTED_REVISION, security_version: pins.securityVersion};
    for (const [key, value] of Object.entries<any>(output)) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
    fs.mkdirSync('test-results/block-editor-deployment', {recursive: true});
    fs.writeFileSync('test-results/block-editor-deployment/deployment-target.json', JSON.stringify(output, null, 2));
};
if (require.main === module) {
    try { main(); }
    catch (error) {
        fs.mkdirSync('test-results/block-editor-deployment', {recursive: true});
        fs.writeFileSync('test-results/block-editor-deployment/selection-error.json', JSON.stringify({
            stage: 'deployment-selection', error: error.message, browser: 'not-run', nativeOSPicker: 'not-run'
        }, null, 2));
        console.error(error.message); process.exitCode = 1;
    }
}
module.exports = {sha};
