#!/usr/bin/env node
import {realpathSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startYamlEditorHost} from './host.mjs';

export function parseArguments(args) {
    const options = {};
    const fields = new Map([['--site-dir', 'siteDirectory'], ['--data-dir', 'dataDirectory'], ['--port', 'port']]);
    for (let i = 0; i < args.length; i++) {
        const field = fields.get(args[i]);
        if (!field || options[field] !== undefined || !args[i + 1] || args[i + 1].startsWith('--')) {
            throw new TypeError('Use --site-dir DIR [--data-dir DIR] [--port PORT].');
        }
        const value = args[++i];
        if (field === 'port') {
            if (!/^\d+$/.test(value) || Number(value) > 65535) throw new TypeError('Invalid port.');
            options.port = Number(value);
        } else options[field] = path.resolve(value);
    }
    if (!options.siteDirectory) throw new TypeError('--site-dir is required.');
    return options;
}

export async function main(args = process.argv.slice(2)) {
    const host = await startYamlEditorHost(parseArguments(args));
    console.log(`TurboWarp-Plus-Editor: ${host.url}`);
    console.log(`YAML working files are retained in: ${host.dataDirectory}`);
    console.log(`Private VSCode profile: ${host.profileDirectory}`);
    let stopping = false;
    const stop = async () => {
        if (stopping) return;
        stopping = true;
        await host.close();
        process.removeListener('SIGINT', stop);
        process.removeListener('SIGTERM', stop);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    return host;
}

function isMainModule() {
    try {
        return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
    } catch {
        return false;
    }
}

if (isMainModule()) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
