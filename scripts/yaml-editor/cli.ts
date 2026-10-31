#!/usr/bin/env node
import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {main as startSharedEditor} from '@kubohiroya/turbowarp-document-editor/cli';
export {parseArguments} from '@kubohiroya/turbowarp-document-editor/cli';
export const main = (args = process.argv.slice(2)) => startSharedEditor(args, {publicPath: '/turbowarp-plus-editor/', editorPath: '/turbowarp-plus-editor/editor.html', label: 'TurboWarp-Plus-Editor'});
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => {console.error(error.message); process.exitCode = 1;});
}
