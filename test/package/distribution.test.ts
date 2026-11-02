import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const mplHeader = /^(?:\/\/|\/\*) SPDX-License-Identifier: MPL-2\.0\b/u;
// The edit-button snippet that other sites may load under MPL-2.0 alone (license rule 6).
const snippetFiles = {source: ['src/index.ts', 'assets/edit-button.css'], published: ['dist/src/index.js', 'assets/edit-button.css']};

test('the MPL-2.0 snippet carries its identifier and imports nothing from the GPL files', async () => {
    const seen = new Set<string>();
    async function visit(relative: string) {
        if (seen.has(relative)) return;
        seen.add(relative);
        const text = await fs.readFile(path.join(root, relative), 'utf8');
        assert.match(text, mplHeader, `${relative} is imported by the snippet but is not MPL-2.0`);
        const specifiers = [...text.matchAll(/(?:\bimport\b[^'"]*?\bfrom\s*|\bexport\b[^'"]*?\bfrom\s*|\bimport\s*\(?\s*|@import\s+(?:url\()?)['"]([^'"]+)['"]/gu)]
            .map(match => match[1]);
        for (const specifier of specifiers) {
            // A bare specifier would pull in another package, whose license this package cannot change.
            assert.match(specifier, /^\.{1,2}\//u, `${relative} imports ${specifier} outside the snippet`);
            await visit(path.relative(root, path.resolve(path.dirname(path.join(root, relative)), specifier)));
        }
    }
    for (const name of snippetFiles.source) await visit(name);
});

test('the npm archive supports JS consumers, TypeScript declarations and the compiled CLI', {timeout: 30_000}, async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'twpe-package-'));
    t.after(() => fs.rm(directory, {recursive: true, force: true}));
    const packed = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json',
        '--cache', path.join(directory, 'cache'), '--pack-destination', directory], {cwd: root, encoding: 'utf8'}))[0];
    const entries = new Set<string>(packed.files.map((file: {path: string}) => file.path));
    for (const name of ['README.md', 'README.ja.md', 'dist/src/index.js', 'dist/src/index.d.ts',
        'dist/src/extension-loader.js', 'dist/src/extension-loader.d.ts', 'dist/config/feature-flags.js',
        'dist/scripts/yaml-editor/cli.js']) assert(entries.has(name), `Missing published file: ${name}`);
    assert(!entries.has('src/index.ts'));
    const packageRoot = path.join(directory, 'node_modules/@kubohiroya/turbowarp-plus-editor');
    await fs.mkdir(packageRoot, {recursive: true});
    execFileSync('tar', ['-xzf', path.join(directory, packed.filename), '-C', packageRoot, '--strip-components=1']);
    // The snippet is MPL-2.0 inside a GPL-3.0-or-later package, and both license texts ship with it.
    assert.equal(JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8')).license,
        '(GPL-3.0-or-later AND MPL-2.0)');
    assert.match(await fs.readFile(path.join(packageRoot, 'LICENSE'), 'utf8'), /GNU GENERAL PUBLIC LICENSE\s+Version 3/u);
    assert.match(await fs.readFile(path.join(packageRoot, 'LICENSE.MPL-2.0'), 'utf8'), /^Mozilla Public License Version 2\.0/u);
    for (const name of snippetFiles.published) {
        assert.match(await fs.readFile(path.join(packageRoot, name), 'utf8'), mplHeader, `${name} lacks the MPL-2.0 identifier`);
    }
    for (const name of ['dist/src/extension-loader.js', 'dist/scripts/yaml-editor/cli.js']) {
        assert.doesNotMatch(await fs.readFile(path.join(packageRoot, name), 'utf8'), /SPDX-License-Identifier: MPL-2\.0/u);
    }
    // Supply the package's declared runtime dependencies from the pinned installation.
    const manifest = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'));
    for (const name of Object.keys(manifest.dependencies || {})) {
        const destination = path.join(directory, 'node_modules', name);
        await fs.mkdir(path.dirname(destination), {recursive: true});
        await fs.symlink(await fs.realpath(path.join(root, 'node_modules', name)), destination, 'dir');
    }
    const packageName = '@kubohiroya/turbowarp-plus-editor';
    await fs.writeFile(path.join(directory, 'consumer.mjs'), `
        import assert from 'node:assert/strict';
        import {createEditorURL, renderEditButton} from '${packageName}';
        import {bootstrapExtensionLoader} from '${packageName}/extension-loader';
        assert.equal(new URL(createEditorURL({language: 'en'})).searchParams.get('lang'), 'en');
        assert.match(renderEditButton({language: 'en'}), /Edit in TurboWarp-Plus-Editor/);
        await assert.rejects(bootstrapExtensionLoader(), TypeError);
        const loader = await bootstrapExtensionLoader({startupSearch: '?twPlusExtensionLoader=0'});
        assert.equal(loader.enabled, false);
        await loader.dispose();
    `);
    execFileSync(process.execPath, ['--no-experimental-strip-types', 'consumer.mjs'], {cwd: directory});
    execFileSync(process.execPath, ['--no-experimental-strip-types', '-e',
        `require('node:assert/strict').equal(typeof require('${packageName}').createEditorURL, 'function')`], {cwd: directory});
    await fs.writeFile(path.join(directory, 'consumer.mts'), `
        import {createEditorURL, renderEditButton, type EditButtonOptions} from '${packageName}';
        import {bootstrapExtensionLoader, type ExtensionLoaderHandle} from '${packageName}/extension-loader';
        const options: EditButtonOptions = {language: 'en', projectURL: new URL('https://example.com/project.sb3')};
        const url: string = createEditorURL(options);
        const html: string = renderEditButton(options);
        const loader: ExtensionLoaderHandle = await bootstrapExtensionLoader({startupSearch: '?twPlusExtensionLoader=0'});
        await loader.dispose();
    `);
    execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--strict',
        '--noEmit', '--module', 'NodeNext', '--target', 'ES2023', '--typeRoots', path.join(root, 'node_modules/@types'),
        path.join(directory, 'consumer.mts')], {cwd: directory, stdio: 'pipe'});
    const site = path.join(directory, 'site');
    await fs.mkdir(site);
    await fs.writeFile(path.join(site, 'editor.html'), '<!doctype html><title>Package fixture</title>');
    const child = spawn(process.execPath, ['--no-experimental-strip-types',
        path.join(packageRoot, 'dist/scripts/yaml-editor/cli.js'), '--site-dir', site, '--data-dir', path.join(directory, 'work')],
    {stdio: ['ignore', 'pipe', 'pipe']});
    t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
    const exited = once(child, 'exit');
    let output = '';
    const address = await new Promise<string>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', code => reject(new Error(`CLI exited before startup (${code}): ${output}`)));
        child.stderr.on('data', bytes => { output += bytes.toString(); });
        child.stdout.on('data', bytes => {
            output += bytes.toString();
            const match = output.match(/TurboWarp-Plus-Editor: (http:\/\/[^\s]+)/u);
            if (match) resolve(match[1]);
        });
    });
    const hostInfo = JSON.parse(await fs.readFile(path.join(directory, 'work', (await fs.readdir(path.join(directory, 'work')))[0], 'host.json'), 'utf8'));
    if (hostInfo.vscodeProfile.separated) t.after(() => fs.rm(hostInfo.vscodeProfile.directory, {recursive: true, force: true}));
    assert.equal((await fetch(address)).status, 200);
    child.kill('SIGTERM');
    const [code] = await exited;
    assert.equal(code, 0);
});
