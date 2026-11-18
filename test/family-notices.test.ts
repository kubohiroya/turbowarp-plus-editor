import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {buildFamilyNotices, requiredFamilyPackages} from '../scripts/site/family-notices.ts';
import {root} from '../scripts/site/source.ts';

const vmRevision = 'c'.repeat(40);
const installed = [
    ['@kubohiroya/turbowarp-extension-security-dialog', '0.5.2', 'GPL-3.0-only', ['LICENSE', 'NOTICE']],
    ['@kubohiroya/turbowarp-extension-loader', '0.3.1', 'MPL-2.0', ['LICENSE']],
    ['@kubohiroya/turbowarp-extension-data-editor', '0.7.0', undefined, []],
    ['@kubohiroya/turbowarp-document-editor', '0.1.0-rc.1', 'MPL-2.0', ['LICENSE', 'NOTICE']],
    ['@kubohiroya/turbowarp-document-editor/node_modules/@kubohiroya/turbowarp-extension-data-editor', '0.7.0', undefined, []],
    ['@kubohiroya/turbowarp-document-data', '0.5.0-rc.1', 'MPL-2.0', ['LICENSE', 'THIRD_PARTY_NOTICES.md']],
    ['scratch-vm', '2.1.46', 'MPL-2.0', ['LICENSE'], `git+ssh://git@github.com/kubohiroya/scratch-vm.git#${vmRevision}`],
    ['@kubohiroya/turbowarp-structured-data', '0.11.0-rc.0', 'MPL-2.0', [], undefined, true],
    ['react', '16.14.0', 'MIT', []]
] as const;

async function fixture(directory: string, entries: readonly (readonly unknown[])[] = installed) {
    const packages = {'': {name: 'host'}};
    for (const [location, version, license, files, resolved, dev] of entries as any) {
        const name = location.split('node_modules/').at(-1);
        const packageRoot = path.join(directory, 'node_modules', location);
        await fs.mkdir(packageRoot, {recursive: true});
        await fs.writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({name, version, license,
            repository: {type: 'git', url: `git+https://github.com/kubohiroya/${name.split('/').at(-1)}.git`}}));
        for (const file of files) await fs.writeFile(path.join(packageRoot, file), `${file} of ${name}`);
        packages[`node_modules/${location}`] = {version, resolved: resolved ?? `https://registry.npmjs.org/${name}/-/x.tgz`,
            ...(dev ? {dev: true} : {})};
    }
    await fs.writeFile(path.join(directory, 'package-lock.json'), JSON.stringify({lockfileVersion: 3, packages}));
}

test('the Editor build records the license text and source of every bundled family package', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'twpe-family-notices-'));
    try {
        const gui = path.join(directory, 'gui');
        const output = path.join(directory, 'build');
        await fixture(gui);
        const warnings = [];
        // No `includeDev`: in the GUI's install a devDependency is build tooling that never ships.
        const built = await buildFamilyNotices(output, [{origin: 'scratch-gui', directory: gui}],
            {warn: message => warnings.push(message)});
        const index = JSON.parse(await fs.readFile(path.join(output, built.index), 'utf8'));
        assert.deepEqual(index.packages.map(entry => entry.package).sort(), [...requiredFamilyPackages].sort());
        const find = name => index.packages.find(entry => entry.package === name);
        const security = find('@kubohiroya/turbowarp-extension-security-dialog');
        assert.equal(security.license, 'GPL-3.0-only');
        assert.deepEqual(security.source, {npm: 'https://www.npmjs.com/package/@kubohiroya/turbowarp-extension-security-dialog/v/0.5.2',
            tarball: 'https://registry.npmjs.org/@kubohiroya/turbowarp-extension-security-dialog/-/turbowarp-extension-security-dialog-0.5.2.tgz',
            repository: 'https://github.com/kubohiroya/turbowarp-extension-security-dialog'});
        assert.deepEqual(security.files, ['notices/turbowarp-extension-security-dialog@0.5.2/LICENSE',
            'notices/turbowarp-extension-security-dialog@0.5.2/NOTICE']);
        for (const entry of index.packages) {
            for (const file of entry.files) assert.match(await fs.readFile(path.join(output, file), 'utf8'), new RegExp(entry.package));
        }
        assert.deepEqual(find('scratch-vm').source, {npm: null, repository: 'https://github.com/kubohiroya/scratch-vm', revision: vmRevision});
        // The released data editor declares no license; it is recorded as published, once.
        const dataEditor = find('@kubohiroya/turbowarp-extension-data-editor');
        assert.equal(dataEditor.licenseStatus, 'undeclared');
        assert.equal(dataEditor.license, null);
        assert.equal(dataEditor.installedIn.length, 2);
        assert.deepEqual(built.undeclared, ['@kubohiroya/turbowarp-extension-data-editor@0.7.0']);
        assert.equal(warnings.length, 1);
    } finally { await fs.rm(directory, {recursive: true, force: true}); }
});

test('the Editor build fails when a bundled family package would lack its notice', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'twpe-family-notices-'));
    const quiet = {warn: () => {}};
    try {
        const output = path.join(directory, 'build');
        const without = name => installed.filter(([location]) => location !== name);
        await fixture(path.join(directory, 'missing'), without('@kubohiroya/turbowarp-extension-loader'));
        await assert.rejects(buildFamilyNotices(output, [{origin: 'gui', directory: path.join(directory, 'missing')}], quiet),
            /Bundled family packages without notices: @kubohiroya\/turbowarp-extension-loader/);
        await fixture(path.join(directory, 'unlicensed'), installed.map(entry =>
            entry[0] === '@kubohiroya/turbowarp-extension-loader' ? [entry[0], entry[1], entry[2], []] : entry));
        await assert.rejects(buildFamilyNotices(output, [{origin: 'gui', directory: path.join(directory, 'unlicensed')}], quiet),
            /turbowarp-extension-loader@0\.3\.1 has no license declaration or license file/);
        await fixture(path.join(directory, 'npm-vm'), installed.map(entry =>
            entry[0] === 'scratch-vm' ? [entry[0], entry[1], entry[2], entry[3]] : entry));
        await assert.rejects(buildFamilyNotices(output, [{origin: 'gui', directory: path.join(directory, 'npm-vm')}], quiet),
            /scratch-vm must be installed from its fork/);
    } finally { await fs.rm(directory, {recursive: true, force: true}); }
});

test('this repository records every family package it supplies, dev entries included', async () => {
    const output = await fs.mkdtemp(path.join(os.tmpdir(), 'twpe-family-notices-'));
    try {
        const built = await buildFamilyNotices(output,
            [{origin: 'turbowarp-plus-editor', directory: root, includeDev: true}], {
                required: ['@kubohiroya/turbowarp-document-editor', '@kubohiroya/turbowarp-document-data',
                    '@kubohiroya/turbowarp-extension-loader', '@kubohiroya/turbowarp-extension-security-dialog'],
                warn: () => {}});
        const index = JSON.parse(await fs.readFile(path.join(output, built.index), 'utf8'));
        const lock = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8'));
        for (const entry of index.packages) {
            const installed = lock.packages[`node_modules/${entry.package}`];
            assert.ok(!installed?.resolved?.startsWith('file:'), `Installed from a local archive: ${entry.package}`);
            assert.ok((entry.source.npm || entry.source.revision) && entry.source.repository, `Missing source: ${entry.package}`);
            if (!entry.licenseStatus) assert.ok(entry.files.some(file => /\/LICENSE$/u.test(file)), `Missing license: ${entry.package}`);
        }
        const layout = '@kubohiroya/turbowarp-plus-editor-workbench';
        const layoutVersion = lock.packages[`node_modules/${layout}`].version;
        assert.ok(built.packages.includes(`${layout}@${layoutVersion}`));
        // The Loader and the review dialog are devDependencies here and are bundled by webpack all
        // the same, so their licenses must be recorded; the `required` list above is what checks it.
        // Recording a package that is only used at build time is the accepted cost of that.
        assert.ok(built.packages.some(name => name.startsWith('@kubohiroya/turbowarp-structured-data@')),
            'this install records its dev entries too');
    } finally { await fs.rm(output, {recursive: true, force: true}); }
});
