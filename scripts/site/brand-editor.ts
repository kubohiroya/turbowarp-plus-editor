import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export async function brandEditor(output, prefix = '/turbowarp-plus-editor/') {
    const editor = path.join(output, 'editor.html');
    let html = await fs.readFile(editor, 'utf8');
    html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>TurboWarp-Plus-Editor</title>');
    html = html.replace(/<link\b[^>]*\brel=["'](?:shortcut\s+)?icon["'][^>]*>/gi, '');
    html = html.replace('</head>', `<link rel="icon" href="${prefix}assets/icon.svg" type="image/svg+xml"></head>`);
    await fs.writeFile(editor, html);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await brandEditor(process.argv[2]);
