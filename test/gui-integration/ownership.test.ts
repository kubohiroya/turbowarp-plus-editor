import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {guiRoot} from '../extension-host/pinned-host.ts';

const inventory = JSON.parse(fs.readFileSync(new URL('../../docs/gui-integration/relocation.json', import.meta.url), 'utf8'));
const host = path.resolve(import.meta.dirname, '../..');
const git = (...args) => execFileSync('git', args, {cwd: guiRoot, encoding: 'utf8'});
const hostContractTests = ['test/sprite-properties-host.test.mjs'];

test('the GUI additions are exactly the allowed host contract tests', () => {
    const upstream = new Set(git('ls-tree', '-r', '--name-only', inventory.upstream).trim().split('\n'));
    const actual = git('ls-files', '--cached', '--others', '--exclude-standard').trim().split('\n')
        .filter(file => file && fs.existsSync(path.join(guiRoot, file)));
    assert.deepEqual(actual.filter(file => !upstream.has(file)).sort(), hostContractTests);
    for (const row of inventory.files) {
        assert.equal(fs.existsSync(path.join(guiRoot, row.from)), false, row.from);
        if (row.disposition === 'moved') assert.ok(fs.existsSync(path.join(host, row.to)), row.to);
    }
});

test('the GUI has no references to removed source modules or migrated test runners', () => {
    const sourceFiles = git('ls-files', 'src', '.github', 'package.json', 'README.md').trim().split('\n');
    const removed = inventory.files.filter(row => row.from.startsWith('src/'))
        .map(row => path.basename(row.from).replace(/\.(?:js|jsx)$/, ''));
    for (const file of sourceFiles) {
        const full = path.join(guiRoot, file);
        if (!fs.existsSync(full) || !/\.(?:js|jsx|json|yml|md)$/.test(full)) continue;
        const text = fs.readFileSync(full, 'utf8');
        for (const name of removed) {
            assert.ok(!new RegExp(`(?:from|require\\()\\s*['"][^'"]*${name}(?:\\.(?:js|jsx))?['"]`).test(text), `${file}: ${name}`);
        }
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(guiRoot, 'package.json'), 'utf8'));
    assert.equal(pkg.devDependencies.jsdom, undefined);
    assert.ok(!Object.keys(pkg.scripts).some(name => /plus|block-editor|document-editor|extension-security|preview:security/.test(name)));
});
