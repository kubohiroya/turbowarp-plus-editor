import {openProjectVersionPreview as openVersionPreview} from '@kubohiroya/turbowarp-plus-editor-git/project-version-preview';
import JSZip from '@turbowarp/jszip';
import type {EmbeddedExtensionManifest, ProjectJson, Sb3SourceManifest} from '@kubohiroya/sb3-toolchain';

declare const __TW_PLUS_VALIDATE_PROJECT_FOLDER__: ((files: ReadonlyMap<string, Uint8Array>) => void) | undefined;

export function hasProjectVersionValidator() {
    return typeof __TW_PLUS_VALIDATE_PROJECT_FOLDER__ === 'function';
}

export function validateProjectVersion(files: ReadonlyMap<string, Uint8Array>) {
    if (typeof __TW_PLUS_VALIDATE_PROJECT_FOLDER__ !== 'function') {
        throw new Error('Project source validation is unavailable');
    }
    __TW_PLUS_VALIDATE_PROJECT_FOLDER__(files);
}

const decoder = new TextDecoder('utf-8', {fatal: true});

export async function packProjectVersion(files: ReadonlyMap<string, Uint8Array<ArrayBuffer>>,
    validate = validateProjectVersion) {
    validate(files);
    const manifest: Sb3SourceManifest = JSON.parse(decoder.decode(files.get('sb3-source.json')));
    const project: ProjectJson = JSON.parse(decoder.decode(files.get(manifest.project)));
    const extensions: EmbeddedExtensionManifest = JSON.parse(decoder.decode(files.get(manifest.embeddedExtensions)));
    for (const {id, path, mediaType, parameters, encoding} of extensions.extensions) {
        const contents = files.get(path)!;
        let payload: string;
        if (encoding === 'base64') {
            const parts: string[] = [];
            for (let offset = 0; offset < contents.length; offset += 0x8000) {
                parts.push(String.fromCharCode(...contents.subarray(offset, offset + 0x8000)));
            }
            payload = btoa(parts.join(''));
        } else {
            payload = Array.from(contents, byte => '%' + byte.toString(16).padStart(2, '0')).join('');
        }
        (project.extensionURLs ??= {})[id] =
            `data:${[mediaType, ...parameters].join(';')}${encoding === 'base64' ? ';base64' : ''},${payload}`;
    }
    const zip = new JSZip();
    for (const name of manifest.archiveEntries) {
        if (name === 'project.json') zip.file(name, JSON.stringify(project));
        else zip.file(name, files.get(`${manifest.assetsDirectory}/${name}`)!);
    }
    return zip.generateAsync({type: 'arraybuffer'});
}

/** Opens the player page this distribution builds, without the Editor features a past version must not use. */
export const openProjectVersionPreview = (document: Document, oid: string, archive: ArrayBuffer, locale: string) =>
    openVersionPreview(document, oid, archive, locale, {
        page: 'git-project-preview.html', params: {twPlusLocalGit: '0', twPlusStandardLayout: '0'}
    });
