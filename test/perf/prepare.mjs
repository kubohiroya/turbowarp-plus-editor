import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import JSZip from '@turbowarp/jszip';
import {importSb3} from '@kubohiroya/sb3-toolchain';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const lock = JSON.parse(await readFile(new URL('./kamishibai-input.json', import.meta.url)));
export async function prepare(directory) {
    directory = path.resolve(directory);
    await mkdir(path.join(directory, 'extensions'), {recursive: true});
    const obtain = async (file, url, expected) => {
        let bytes = await readFile(file).catch(error => {
            if (error.code !== 'ENOENT') throw error;
            return null;
        });
        if (!bytes) {
            const response = await fetch(url, {signal: AbortSignal.timeout(30000)});
            assert.ok(response.ok, `${url}: HTTP ${response.status}`);
            bytes = Buffer.from(await response.arrayBuffer());
            assert.equal(sha256(bytes), expected, `Changed input: ${url}`);
            await writeFile(file, bytes);
        }
        assert.equal(sha256(bytes), expected, `Changed cached input: ${file}`);
        return bytes;
    };
    const input = path.join(directory, 'kamishibai-3.2.sb3');
    const bytes = await obtain(input, lock.url, lock.sha256);
    const zip = await JSZip.loadAsync(bytes);
    const project = JSON.parse(await zip.file('project.json').async('string'));
    assert.equal(project.targets.length, lock.targets);
    assert.equal(project.targets.reduce((n, t) => n + Object.keys(t.blocks).length, 0), lock.blocks);
    for (const extension of lock.extensions) {
        if (extension.builtin) continue;
        const file = path.join(directory, 'extensions', `${extension.id}.js`);
        if (extension.url === 'embedded-data') {
            const code = Buffer.from(project.extensionURLs[extension.id].split(',')[1], 'base64');
            assert.equal(sha256(code), extension.sha256);
            await writeFile(file, code);
        } else await obtain(file, extension.url, extension.sha256);
    }
    const marker=path.join(directory,'fixture-identity.json');
    const identity=await readFile(marker,'utf8').then(JSON.parse,()=>null);
    if(identity) assert.equal(identity.inputSha256,lock.sha256);
    const folder = path.join(directory, 'history-project');
    const exists = await readFile(path.join(folder, '.git', 'HEAD')).then(() => true, () => false);
    if (exists) assert.ok(identity, 'Existing history-project without fixture-identity.json; use a fresh --directory');
    if (!exists) {
        await importSb3({inputPath: input, outputDirectory: folder});
        const git = (...args) => execFileSync('git', args, {cwd: folder, stdio: 'pipe',
            env: {...process.env, GIT_AUTHOR_DATE: '2026-11-23T00:00:00Z', GIT_COMMITTER_DATE: '2026-11-23T00:00:00Z'}});
        git('init', '-q', '-b', 'main');
        for (let index = 0; index < 50; index++) {
            await writeFile(path.join(folder, 'history-fixture.txt'), `Synthetic history ${index}\n`);
            git('add', '.');
            git('-c', 'user.name=Performance fixture', '-c', 'user.email=fixture@example.invalid',
                '-c', 'commit.gpgsign=false', 'commit', '-qm', `Performance fixture ${index}`);
        }
        await writeFile(marker,JSON.stringify({inputSha256:lock.sha256,generatedBy:'plus-editor-775'}));
        await writeFile(path.join(directory, 'baseline-source.json'), await readFile(path.join(folder, 'project.source.json')));
    }
    assert.equal(execFileSync('git', ['rev-list', '--count', 'HEAD'], {cwd: folder, encoding: 'utf8'}).trim(), '50');
    await writeFile(path.join(folder,'.git','info','exclude'),'.tw-plus/\n');
    const historyHead=execFileSync('git',['rev-parse','HEAD'],{cwd:folder,encoding:'utf8'}).trim();
    const buildFolder=path.join(directory,'build-project');
    if (!await readFile(path.join(buildFolder,'sb3-source.json')).then(()=>true,()=>false)) await importSb3({inputPath:input,outputDirectory:buildFolder});
    return {directory, input, project, folder, buildFolder, historyHead};
}
