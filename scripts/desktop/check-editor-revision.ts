import {open} from 'node:fs/promises';
import path from 'node:path';
import {verifyEditorRevision} from '../site/editor-revision.ts';

type AsarEntry = {
    files?: Record<string, AsarEntry>;
    offset?: string;
    size?: number;
    unpacked?: boolean;
};

async function readMetadata(archive: string, entry: string) {
    const file = await open(archive, 'r');
    try {
        const read = async (size: number, position: number) => {
            const bytes = Buffer.alloc(size);
            const {bytesRead} = await file.read(bytes, 0, size, position);
            if (bytesRead !== size) throw new Error('Truncated ASAR');
            return bytes;
        };
        // Electron ASAR stores the JSON tree in a Chromium pickle before the packed files.
        const prefix = await read(16, 0);
        const headerSize = prefix.readUInt32LE(4);
        const jsonSize = prefix.readUInt32LE(12);
        const {size: archiveSize} = await file.stat();
        if (prefix.readUInt32LE(0) !== 4 || headerSize < 8 || headerSize + 8 > archiveSize ||
            jsonSize > headerSize - 8 || jsonSize > 32 * 1024 * 1024) {
            throw new Error('Invalid ASAR header');
        }
        let node: AsarEntry | undefined = JSON.parse((await read(jsonSize, 16)).toString('utf8'));
        for (const name of entry.split('/')) node = node?.files?.[name];
        if (!node || node.unpacked || !/^\d+$/.test(node.offset ?? '') ||
            !Number.isSafeInteger(node.size) || node.size < 1 || node.size > 1024 * 1024) {
            throw new Error('Missing packed renderer metadata');
        }
        const start = 8 + headerSize + Number(node.offset);
        if (start + node.size > archiveSize) throw new Error('Invalid renderer metadata offset');
        return (await read(node.size, start)).toString('utf8');
    } finally {
        await file.close();
    }
}

export async function verifyDesktopEditor(app: string, renderer: 'gui' | 'plus-gui') {
    const archive = path.resolve(app, 'Contents/Resources/app.asar');
    const entry = `dist-renderer-webpack/editor/${renderer}/build-info.json`;
    await verifyEditorRevision(`${archive}/${entry}`, 'editorRevision', () => readMetadata(archive, entry));
}

if (import.meta.main) {
    const [app, renderer = 'plus-gui'] = process.argv.slice(2);
    if (!app || (renderer !== 'gui' && renderer !== 'plus-gui')) {
        throw new Error('Usage: node scripts/desktop/check-editor-revision.ts <app> [gui|plus-gui]');
    }
    verifyDesktopEditor(app, renderer).catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
