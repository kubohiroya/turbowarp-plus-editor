import fs from 'node:fs/promises';
import path from 'node:path';

/** Emit browser-native JS while retaining the public module URLs and lazy imports. */
export async function emitBrowserModule(source: string, destination: string, imports: Record<string, string> = {}) {
    const {transform} = await import('esbuild');
    let text = await fs.readFile(source, 'utf8');
    for (const [from, to] of Object.entries(imports)) text = text.replaceAll(from, to);
    text = text.replace(/(['"])(\.{1,2}\/[^'"\n]+)\.ts\1/g, '$1$2.js$1');
    const result = await transform(text, {loader: 'ts', format: 'esm', target: 'es2022', sourcefile: source, legalComments: 'eof'});
    await fs.mkdir(path.dirname(destination), {recursive: true});
    await fs.writeFile(destination, result.code);
}
