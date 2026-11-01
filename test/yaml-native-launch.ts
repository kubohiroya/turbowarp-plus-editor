import {spawn} from 'node:child_process';
import {lstat, readFile, readdir, realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
import {findVSCodeExecutable, launchVSCode} from '../scripts/yaml-editor/vscode.ts';

const driverPath = fileURLToPath(new URL('./vscode-edit-driver/', import.meta.url));

export function createNativeYamlTestLauncher({marker, resultPath, timeoutMs = 90_000, settingsYamlSchemaChecks = false, settingsJsonSchemaChecks = false}) {
    if (!path.isAbsolute(resultPath || '') || typeof marker !== 'string' || !marker.trim() || /[\r\n\0]/.test(marker)) {
        throw new TypeError('Supply an absolute test resultPath and a one-line marker.');
    }
    return async (workingFile, profile) => {
        const filename = await realpath(workingFile);
        if (filename !== path.resolve(workingFile) || !/\.(?:ya?ml|json)$/iu.test(path.basename(filename)) ||
            !/^[a-f0-9]{32}$/.test(path.basename(path.dirname(filename))) ||
            path.basename(path.dirname(path.dirname(filename))) !== 'sessions') {
            throw new Error('The native test launcher only accepts private YAML session files.');
        }
        const sockets = await readdir(profile.userDataDirectory);
        if (sockets.some(name => name.endsWith('-main.sock'))) throw new Error('Use a fresh private VSCode profile for the native test driver.');
        try { await lstat(resultPath); throw new Error('The native test result already exists.'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        const spec = JSON.stringify({workingFile: filename, marker, resultPath, ...(settingsYamlSchemaChecks ? {settingsYamlSchemaChecks: true} : {}), ...(settingsJsonSchemaChecks ? {settingsJsonSchemaChecks: true} : {})});
        await launchVSCode(filename, profile, {
            findExecutable: findVSCodeExecutable,
            spawnProcess(executable, args, options) {
                const separator = args.indexOf('--');
                if (separator < 0) throw new Error('The production launcher argument separator is missing.');
                const testArgs = [...args.slice(0, separator), '--extensionDevelopmentPath', driverPath, ...args.slice(separator)];
                return spawn(executable, testArgs, {...options, env: {...options.env, TWPE_YAML_TEST_SPEC: spec}});
            }
        });
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            try {
                const result = JSON.parse(await readFile(resultPath, 'utf8'));
                if (result.ok !== true) throw new Error(result.error || 'The VSCode test driver failed.');
                if (result.workingFile !== filename || result.marker !== marker || result.saved !== true) throw new Error('The VSCode test result does not identify this session.');
                return result;
            } catch (error) {
                if (error.code !== 'ENOENT') throw error;
            }
            await pause(100);
        }
        throw new Error('The VSCode development test driver did not save its result in time.');
    };
}
