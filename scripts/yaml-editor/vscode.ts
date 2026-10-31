import type {SpawnOptions} from 'node:child_process';

type SpawnProcess = (executable: string, args: string[], options: SpawnOptions) => {once(event: string, listener: (...args: any[]) => void): unknown; unref(): void; kill(): unknown};

export interface VSCodeLaunchProfile {
    userDataDirectory: string;
    extensionsDirectory: string;
    workspaceFile?: string;
    format?: string;
}

import {access, mkdir, mkdtemp, readdir, realpath, readFile, writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createConnection} from 'node:net';
import {setTimeout as pause} from 'node:timers/promises';

function shortSocketPath(directory) {
    return Buffer.byteLength(path.join(directory, '1.00-main.sock')) <= 100;
}

export async function createVSCodeProfile(storage) {
    let directory = storage;
    if (process.platform !== 'win32' && !shortSocketPath(path.join(directory, 'u'))) {
        const temporaryRoot = await realpath(process.platform === 'darwin' ? '/private/tmp' : '/tmp');
        directory = await mkdtemp(path.join(temporaryRoot, 'twpe-code-'));
    }
    const userDataDirectory = path.join(directory, 'u');
    const extensionsDirectory = path.join(directory, 'e');
    await Promise.all([userDataDirectory, extensionsDirectory].map(item => mkdir(item, {mode: 0o700})));
    const resolvedUserData = await realpath(userDataDirectory);
    if (process.platform !== 'win32' && !shortSocketPath(resolvedUserData)) {
        throw new Error('The private VSCode IPC path is too long.');
    }
    const settingsDirectory = path.join(resolvedUserData, 'User');
    await mkdir(settingsDirectory, {mode: 0o700});
    // Application-scoped settings belong to this private profile, never the workspace.
    await writeFile(path.join(settingsDirectory, 'settings.json'), JSON.stringify({
        'extensions.autoUpdate': 'off', 'telemetry.telemetryLevel': 'off',
        'redhat.telemetry.enabled': false
    }, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
    return {directory, userDataDirectory: resolvedUserData, extensionsDirectory: await realpath(extensionsDirectory), separated: directory !== storage};
}

async function socketAcceptsConnections(filename) {
    return new Promise(resolve => {
        const socket = createConnection({path: filename});
        let settled = false;
        const finish = accepted => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(accepted);
        };
        socket.setTimeout(250, () => finish(false));
        socket.once('error', () => finish(false));
        socket.once('connect', () => finish(true));
    });
}

export async function waitForVSCodeReady(userDataDirectory, {platform = process.platform, timeoutMs = 10_000} = {}) {
    if (platform === 'win32') return;
    const deadline = Date.now() + timeoutMs;
    do {
        const entries = await readdir(userDataDirectory).catch(() => []);
        for (const filename of entries.filter(name => name.endsWith('-main.sock'))) {
            if (await socketAcceptsConnections(path.join(userDataDirectory, filename))) return;
        }
        await pause(Math.min(100, Math.max(0, deadline - Date.now())));
    } while (Date.now() < deadline);
    const error: NodeJS.ErrnoException = new Error('VSCode did not open its private instance after the launch request.');
    error.code = 'VSCODE_INSTANCE_UNAVAILABLE';
    throw error;
}

export async function findVSCodeExecutable() {
    const candidates = process.platform === 'darwin' ? [
        '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
        path.join(homedir(), 'Applications/Visual Studio Code.app/Contents/Resources/app/bin/code')
    ] : process.platform === 'win32' ? [
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs/Microsoft VS Code/Code.exe'),
        process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Microsoft VS Code/Code.exe')
    ] : ['/usr/bin/code', '/usr/local/bin/code', '/snap/bin/code'];
    if (process.platform !== 'win32') {
        for (const directory of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
            candidates.push(path.resolve(directory, 'code'));
        }
    }
    for (const candidate of [...new Set(candidates.filter(Boolean))]) {
        try {
            await access(candidate, constants.X_OK);
            return candidate;
        } catch {}
    }
    const error: NodeJS.ErrnoException = new Error('VSCode is unavailable. Install Visual Studio Code before opening a YAML session.');
    error.code = 'VSCODE_UNAVAILABLE';
    throw error;
}

export const yamlExtensionId = 'redhat.vscode-yaml';
export const yamlExtensionVersion = '2.0.0';

function isolatedEnvironment() {
    const env = {...process.env};
    for (const key of Object.keys(env)) if (key.startsWith('VSCODE_')) delete env[key];
    delete env.ELECTRON_RUN_AS_NODE;
    return env;
}

/** Install only the pinned official YAML extension into the private profile. */
export async function ensureYamlSupport(profile, {findExecutable = findVSCodeExecutable, spawnProcess = spawn as SpawnProcess, timeoutMs = 120_000} = {}) {
    const installed = async () => {
        for (const name of await readdir(profile.extensionsDirectory)) {
            if (!name.startsWith(`${yamlExtensionId}-${yamlExtensionVersion}`)) continue;
            try {
                const manifest = JSON.parse(await readFile(path.join(profile.extensionsDirectory, name, 'package.json'), 'utf8'));
                if (manifest.publisher.toLowerCase() === 'redhat' && manifest.name === 'vscode-yaml' && manifest.version === yamlExtensionVersion) return true;
            } catch {}
        }
        return false;
    };
    if (await installed()) return;
    const executable = await findExecutable();
    await new Promise<void>((resolve, reject) => {
        const child = spawnProcess(executable, ['--user-data-dir', profile.userDataDirectory,
            '--extensions-dir', profile.extensionsDirectory, '--install-extension', `${yamlExtensionId}@${yamlExtensionVersion}`],
        {shell: false, stdio: 'ignore', env: isolatedEnvironment()});
        const timer = setTimeout(() => { child.kill(); reject(new Error('The private YAML extension installation timed out.')); }, timeoutMs);
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('The official YAML extension could not be installed.')); });
    });
    if (!await installed()) throw new Error('The pinned official YAML extension is unavailable in this private profile.');
}

export async function launchVSCode(filePath, {userDataDirectory, extensionsDirectory, workspaceFile, format = 'yaml'}: VSCodeLaunchProfile, {
    findExecutable = findVSCodeExecutable,
    spawnProcess = spawn as SpawnProcess,
    platform = process.platform,
    timeoutMs = 15_000,
    startupGraceMs = 500,
    checkReady = waitForVSCodeReady,
    ensureSupport = ensureYamlSupport
} = {}) {
    const executable = await findExecutable();
    await mkdir(userDataDirectory, {recursive: true, mode: 0o700});
    await mkdir(extensionsDirectory, {recursive: true, mode: 0o700});
    const env = isolatedEnvironment();
    if (workspaceFile && format === 'yaml') await ensureSupport({userDataDirectory, extensionsDirectory});
    const args = [
        '--new-window', ...(workspaceFile ? [] : ['--disable-extensions']), '--disable-workspace-trust',
        '--skip-welcome', '--skip-release-notes',
        '--user-data-dir', userDataDirectory, '--extensions-dir', extensionsDirectory,
        '--', ...(workspaceFile ? [workspaceFile] : []), filePath
    ];
    await new Promise<void>((resolve, reject) => {
        const child = spawnProcess(executable, args, {shell: false, detached: true, stdio: 'ignore', env});
        let settled = false;
        let timer;
        const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (error) reject(error);
            else resolve();
        };
        child.once('error', finish);
        child.once('exit', (code, signal) => finish(code === 0 ? undefined : new Error(`VSCode startup failed (${signal || `exit ${code}`}).`)));
        child.once('spawn', () => {
            child.unref();
            if (platform === 'win32') {
                // The Windows GUI process can outlive the request; catch immediate startup errors.
                timer = setTimeout(() => finish(), startupGraceMs);
            } else {
                // The non-waiting macOS/Linux CLI must acknowledge the launch with exit zero.
                timer = setTimeout(() => {
                    child.kill();
                    finish(new Error('VSCode startup acknowledgement timed out.'));
                }, timeoutMs);
            }
        });
    });
    await checkReady(userDataDirectory, {platform});
}
