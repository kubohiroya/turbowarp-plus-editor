const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

// The test-only `twpeyamlsettings` owner, built by the same scripts the YAML browser regressions
// and CI use, so no binary fixture is checked in. `edit` may change project.json before the SB3 is
// packed again, to add documents or hats a single spec needs.
const root = path.resolve(__dirname, '../../..');
const run = (script, ...args) => {
    const result = spawnSync(process.execPath, [path.join(root, script), ...args], {cwd: root, encoding: 'utf8'});
    if (result.status !== 0) throw new Error(`${script} failed: ${result.stderr}`);
};
const settingsProject = async (edit = null) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'twpe-settings-project-'));
    try {
        const base = path.join(directory, 'base.sb3'), settings = path.join(directory, 'settings.sb3');
        run('test/fixtures/yaml-editor/base-project.ts', base);
        run('scripts/yaml-editor/build-settings-fixture.ts', base, settings);
        const bytes = fs.readFileSync(settings);
        if (!edit) return bytes;
        const JSZip = require('@turbowarp/jszip');
        const archive = await JSZip.loadAsync(bytes);
        const project = JSON.parse(await archive.file('project.json').async('string'));
        await edit(project);
        archive.file('project.json', JSON.stringify(project));
        return archive.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'});
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
};
// The same small SB3 without any extension: nothing in it is owned by a provider.
const plainProject = () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'twpe-plain-project-'));
    try {
        const base = path.join(directory, 'base.sb3');
        run('test/fixtures/yaml-editor/base-project.ts', base);
        return fs.readFileSync(base);
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
};
// What the security review shows and the loaded project must report back.
const extensionSource = async bytes => {
    const JSZip = require('@turbowarp/jszip');
    const project = JSON.parse(await (await JSZip.loadAsync(bytes)).file('project.json').async('string'));
    const url = project.extensionURLs.twpeyamlsettings;
    return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64').toString('utf8');
};
const settingsHat = 'twpeyamlsettings_embeddedYaml';

module.exports = {settingsProject, plainProject, extensionSource, settingsHat};
