const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = function loadPreviewReloadCss(input) {
    const done = this.async();
    const readStyles = async () => {
        const {previewReloadStyles: {revision, sha256}} = JSON.parse(input);
        assert.match(revision, /^[a-f0-9]{40}$/);
        assert.match(sha256, /^[a-f0-9]{64}$/);
        const local = process.env.TW_PLUS_PREVIEW_RELOAD_STYLES;
        const url = 'https://raw.githubusercontent.com/kubohiroya/turbowarp-kamishibai-app/' +
            revision + '/src/builder/dsl4-preview-reload.css';
        const fetchStyles = async () => {
            const response = await fetch(url, {signal: AbortSignal.timeout(30_000)});
            if (!response.ok) throw new Error(`Could not fetch Kamishibai preview styles: HTTP ${response.status}`);
            return Buffer.from(await response.arrayBuffer());
        };
        if (local) {
            assert.ok(path.isAbsolute(local), 'TW_PLUS_PREVIEW_RELOAD_STYLES must be an absolute path');
            this.addDependency(local);
        }
        const bytes = local ? await fs.readFile(local) : await fetchStyles();
        assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256, 'Kamishibai preview CSS pin mismatch');
        return bytes.toString('utf8');
    };
    readStyles().then(css => done(null, css), done);
};
