import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {normalizeSourceDocumentSchema} from '@kubohiroya/turbowarp-document-data/composition';

/** Associate the exact owner schema without inserting a modeline into the source. */
export async function writeSchemaWorkspace(directory, metadata, {format = 'yaml', filename = 'story.k4.yml'} = {}) {
    if (metadata === undefined) return null;
    const normalized = normalizeSourceDocumentSchema(metadata);
    const metadataDirectory = path.join(directory, '.twpe');
    await mkdir(metadataDirectory, {recursive: true, mode: 0o700});
    const schemaFile = path.join(metadataDirectory, 'schema.json');
    const workspaceFile = path.join(metadataDirectory, 'editor.code-workspace');
    await writeFile(schemaFile, JSON.stringify(normalized.schema, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
    const settings = format === 'json' ? {
        'json.schemas': [{fileMatch: [filename], url: pathToFileURL(schemaFile).href}],
        'json.validate.enable': true, 'files.associations': {[filename]: 'json'}
    } : {
        'yaml.schemas': {[pathToFileURL(schemaFile).href]: [filename]},
        'yaml.validate': true, 'yaml.completion': true, 'yaml.hover': true,
        'yaml.schemaStore.enable': false,
        'files.associations': {[filename]: 'yaml'}
    };
    await writeFile(workspaceFile, JSON.stringify({folders: [{path: '..'}], settings}, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
    return {workspaceFile, schemaFile, schemaId: normalized.id};
}
