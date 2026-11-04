import {build} from 'esbuild';
import {copyFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';

const output = resolve(process.argv[2] || '/private/tmp/tw151-stage2/build');
const fixture = import.meta.dirname;
await mkdir(output, {recursive: true});
await build({
    entryPoints: [resolve(fixture, 'editor.ts'), resolve(fixture, 'child.ts')],
    outdir: output,
    bundle: true,
    platform: 'browser'
});
await Promise.all([
    copyFile(resolve(fixture, 'editor.html'), resolve(output, 'editor.html')),
    copyFile(resolve(fixture, 'editor.html'), resolve(output, 'gui.html')),
    copyFile(resolve(fixture, 'code-popout.html'), resolve(output, 'code-popout.html')),
    // Required by the #155 disposable Desktop bundle builder; stage 2 never opens it.
    copyFile(resolve(fixture, 'code-popout.html'), resolve(output, 'backpack-popout.html'))
]);
