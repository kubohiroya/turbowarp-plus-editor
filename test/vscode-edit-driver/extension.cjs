const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const hash = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const within = (root, filename) => {
    const relative = path.relative(root, filename);
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

async function validate(spec) {
    if (!spec || typeof spec !== 'object' || Array.isArray(spec) ||
        Object.keys(spec).some(key => !['workingFile', 'marker', 'resultPath', 'kamishibaiSchemaChecks', 'settingsJsonSchemaChecks'].includes(key))) {
        throw new Error('The native test spec is invalid.');
    }
    if (typeof spec.marker !== 'string' || !spec.marker.trim() || spec.marker.length > 160 || /[\r\n\0]/.test(spec.marker)) {
        throw new Error('The test marker must be a single comment line.');
    }
    if (!path.isAbsolute(spec.workingFile || '') || !path.isAbsolute(spec.resultPath || '')) {
        throw new Error('The native test paths must be absolute.');
    }
    const workingFile = await fs.realpath(spec.workingFile);
    const sessionDirectory = path.dirname(workingFile);
    const sessionsDirectory = path.dirname(sessionDirectory);
    const storage = path.dirname(sessionsDirectory);
    const entry = await fs.lstat(spec.workingFile);
    if (!entry.isFile() || entry.isSymbolicLink() || workingFile !== path.resolve(spec.workingFile) ||
        !/\.(?:ya?ml|json)$/iu.test(path.basename(workingFile)) || !/^[a-f0-9]{32}$/.test(path.basename(sessionDirectory)) ||
        path.basename(sessionsDirectory) !== 'sessions' || !/^twpe-yaml-[A-Za-z0-9_-]+$/.test(path.basename(storage))) {
        throw new Error('Only the dedicated private YAML session file may be edited.');
    }
    if (process.platform !== 'win32') {
        for (const directory of [storage, sessionsDirectory, sessionDirectory]) {
            if (((await fs.stat(directory)).mode & 0o077) !== 0) throw new Error('The YAML session directory is not private.');
        }
    }
    const resultDirectory = await fs.realpath(path.dirname(spec.resultPath));
    const allowedRoots = [await fs.realpath(os.tmpdir())];
    if (process.platform !== 'win32') allowedRoots.push(await fs.realpath('/tmp'));
    if (!allowedRoots.some(root => within(root, workingFile))) throw new Error('The native test YAML must remain in a temporary session directory.');
    if (!allowedRoots.some(root => within(root, resultDirectory))) throw new Error('Test results must remain in a temporary test directory.');
    const resultPath = path.join(resultDirectory, path.basename(spec.resultPath));
    if (resultPath === workingFile) throw new Error('The result path must not be the YAML document.');
    try { await fs.lstat(resultPath); throw new Error('The test result already exists.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    return {...spec, workingFile, resultPath};
}

async function verifySchema(document, before, format = 'yaml') {
    const extension = vscode.extensions.getExtension(format === 'json' ? 'vscode.json-language-features' : 'redhat.vscode-yaml');
    if (!extension) throw new Error('The official YAML extension is not installed in the private profile.');
    await extension.activate();
    const replace = async text => {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
        if (!await vscode.workspace.applyEdit(edit)) throw new Error('The schema test document could not be updated.');
    };
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    const labels = result => (result?.items || result || []).map(item => typeof item.label === 'string' ? item.label : item.label.label);
    try {
        const completionSource = format === 'json' ? '{"theme": ' : 'kamishibai: ';
        const completionNeedle = format === 'json' ? 'night' : '4.0';
        const diagnosticPattern = format === 'json' ? /night|day|string/iu : /4\.0|not accepted|constant/iu;
        await replace(completionSource);
        let completionLabels = [];
        for (let attempt = 0; attempt < 80; attempt++) {
            const result = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', document.uri, new vscode.Position(0, completionSource.length));
            completionLabels = labels(result);
            if (completionLabels.some(label => label.includes(completionNeedle))) break;
            await pause(250);
        }
        if (!completionLabels.some(label => label.includes(completionNeedle))) throw new Error('Schema-based DSL version completion was not offered.');
        await replace(format === 'json' ? '{"enabled": true, "theme": 42}' : "kamishibai: 'wrong-version'\nscenes: []\n");
        let diagnostics = [];
        for (let attempt = 0; attempt < 80; attempt++) {
            diagnostics = vscode.languages.getDiagnostics(document.uri);
            if (diagnostics.some(item => item.range.start.line === 0 && diagnosticPattern.test(item.message))) break;
            await pause(250);
        }
        if (!diagnostics.some(item => item.range.start.line === 0 && diagnosticPattern.test(item.message))) throw new Error('The invalid DSL version was not diagnosed from the schema.');
        return {extensionId: extension.id, extensionVersion: extension.packageJSON.version,
            completionLabels, diagnostics: diagnostics.map(item => ({message: item.message, source: item.source, line: item.range.start.line})),
            settings: vscode.workspace.getConfiguration(format, document.uri).get('schemas')};
    } finally {
        await replace(before);
    }
}

async function perform(spec) {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(spec.workingFile));
    if (document.uri.scheme !== 'file' || await fs.realpath(document.uri.fsPath) !== spec.workingFile) {
        throw new Error('VSCode opened an unexpected document.');
    }
    await vscode.window.showTextDocument(document, {preview: false, preserveFocus: false});
    const before = document.getText();
    const beforeVersion = document.version;
    const diskBefore = await fs.readFile(spec.workingFile, 'utf8');
    if (before !== diskBefore || document.isDirty) throw new Error('The native test document already has unsaved changes.');
    const schemaChecks = spec.kamishibaiSchemaChecks ? await verifySchema(document, before) : spec.settingsJsonSchemaChecks ? await verifySchema(document, before, 'json') : undefined;
    const comment = spec.marker.trimStart().startsWith('#') ? spec.marker : `# ${spec.marker}`;
    const addition = `${before.endsWith('\n') ? '' : '\n'}${comment}\n`;
    const expectedAfter = spec.settingsJsonSchemaChecks ? before.replace('"theme": "day"', '"theme": "night"') : before + addition;
    if (spec.settingsJsonSchemaChecks && expectedAfter === before) throw new Error('The JSON test settings did not contain the expected original theme.');
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(before.length)), expectedAfter);
    if (!await vscode.workspace.applyEdit(edit)) throw new Error('VSCode rejected the native test edit.');
    const saved = await document.save();
    const after = document.getText();
    const diskAfter = await fs.readFile(spec.workingFile, 'utf8');
    if (!saved || document.isDirty || after !== expectedAfter || diskAfter !== after || document.version <= beforeVersion) {
        throw new Error('The native VSCode edit was not saved as expected.');
    }
    return {
        ok: true, editor: 'VSCode Extension Development Host', vscodeVersion: vscode.version,
        workingFile: spec.workingFile, uri: document.uri.toString(), marker: spec.marker,
        beforeVersion, afterVersion: document.version,
        beforeSHA256: hash(before), afterSHA256: hash(after),
        beforeBytes: Buffer.byteLength(before), afterBytes: Buffer.byteLength(after),
        ...(schemaChecks ? {schemaChecks} : {}),
        saved, dirtyAfterSave: document.isDirty, diskMatchesDocument: diskAfter === after,
        verifiedAt: new Date().toISOString()
    };
}

exports.activate = async () => {
    let spec;
    try {
        spec = await validate(JSON.parse(process.env.TWPE_YAML_TEST_SPEC || 'null'));
        const result = await perform(spec);
        await fs.writeFile(spec.resultPath, JSON.stringify(result, null, 2), {mode: 0o600, flag: 'wx'});
    } catch (error) {
        if (spec) {
            await fs.writeFile(spec.resultPath, JSON.stringify({ok: false, error: error.message, workingFile: spec.workingFile}), {mode: 0o600, flag: 'wx'}).catch(() => {});
        }
        console.error('[TWPE native YAML test]', error.message);
    }
};

exports.deactivate = () => {};
