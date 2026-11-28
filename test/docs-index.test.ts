import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir, stat} from 'node:fs/promises';
import path from 'node:path';

const docs = path.join(import.meta.dirname, '..', 'docs');

/**
 * Collect the relative link targets of a Markdown file, without fragments.
 * @param {string} text The file's contents.
 * @returns {string[]} The targets that point inside the repository.
 */
const relativeLinks = (text: string) => [...text.matchAll(/\]\(([^)\s]+)\)/g)]
    .map(match => match[1].split('#')[0])
    .filter(target => target !== '' && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(target));

/**
 * List every Markdown file under `docs/`, relative to it.
 * @param {string} directory The directory to walk, relative to `docs/`.
 * @returns {Promise<string[]>} The Markdown files found below it.
 */
const markdownFiles = async (directory = '') => {
    const entries = await readdir(path.join(docs, directory), {withFileTypes: true});
    const found = await Promise.all(entries.map(entry => {
        const name = directory === '' ? entry.name : `${directory}/${entry.name}`;
        if (entry.isDirectory()) return markdownFiles(name);
        return Promise.resolve(entry.name.endsWith('.md') ? [name] : []);
    }));
    return found.flat();
};

test('the docs index lists every document directly under docs/', async () => {
    const index = await readFile(path.join(docs, 'README.md'), 'utf8');
    const linked = new Set(relativeLinks(index));
    const files = (await markdownFiles()).filter(file => !file.includes('/') && file !== 'README.md');
    assert.ok(files.length > 0, 'found no documents to index');
    for (const file of files) {
        assert.ok(linked.has(file), `docs/README.md does not list ${file}: add a row for it`);
    }
});

test('every relative link in docs/ resolves to a file that exists', async () => {
    const missing: string[] = [];
    for (const file of await markdownFiles()) {
        const text = await readFile(path.join(docs, file), 'utf8');
        for (const target of relativeLinks(text)) {
            const resolved = path.resolve(path.dirname(path.join(docs, file)), target);
            if (!await stat(resolved).then(() => true, () => false)) missing.push(`${file} -> ${target}`);
        }
    }
    assert.deepEqual(missing, []);
});
