import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyEditorRevision(artifact: string, key: 'siteRevision' | 'editorRevision', read: () => Promise<string>) {
    const expected = process.env.E2E_EXPECT_SITE_REVISION;
    if (!/^[a-f0-9]{40}$/.test(expected ?? '')) {
        throw new Error(`Set E2E_EXPECT_SITE_REVISION to a full Editor SHA before using ${artifact}`);
    }
    let actual: unknown;
    try {
        actual = JSON.parse(await read())?.[key];
    } catch (error) {
        throw new Error(`Cannot verify Editor revision at ${artifact}: expected ${expected}, actual unavailable`, {cause: error});
    }
    const evidence = `Editor revision at ${artifact}: expected ${expected}, actual ${JSON.stringify(actual) ?? 'missing'}`;
    if (actual !== expected) throw new Error(evidence);
    console.log(evidence);
}

export async function verifyWebEditor(directory: string) {
    const filename = path.resolve(directory, 'build-info.json');
    await verifyEditorRevision(filename, 'siteRevision', () => fs.readFile(filename, 'utf8'));
}
