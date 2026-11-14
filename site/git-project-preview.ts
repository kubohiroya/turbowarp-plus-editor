import {dialogAction, dialogActions} from '@kubohiroya/turbowarp-plus-editor-ui/dialog-actions';
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

export function openProjectVersionPreview(document: Document, oid: string, archive: ArrayBuffer, locale: string) {
    const preview = document.createElement('dialog');
    const heading = document.createElement('h2');
    const japanese = locale.startsWith('ja');
    heading.textContent = `${japanese ? '作品の過去版' : 'Project version'} · ${oid.slice(0, 12)}`;
    preview.setAttribute('aria-label', heading.textContent);
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = japanese ? '閉じる' : 'Close';
    close.onclick = () => preview.close();
    const frame = document.createElement('iframe');
    const view = document.defaultView!;
    const url = new URL('git-project-preview.html', view.location.href);
    url.searchParams.set('lang', locale);
    url.searchParams.set('twPlusLocalGit', '0');
    url.searchParams.set('twPlusStandardLayout', '0');
    frame.src = url.href;
    frame.title = heading.textContent;
    frame.allow = 'autoplay; fullscreen';
    frame.style.cssText = 'width: min(850px, 85vw); height: min(630px, 75vh); border: 0; display: block';
    preview.append(heading, frame, dialogActions(document, dialogAction(close, 'close')));
    const dispose = () => {
        view.removeEventListener('message', send);
        preview.remove();
    };
    const send = (event: MessageEvent) => {
        if (event.source !== frame.contentWindow || event.origin !== url.origin ||
            event.data !== 'tw-plus/git-preview-ready') return;
        view.removeEventListener('message', send);
        frame.contentWindow!.postMessage({kind: 'tw-plus/git-preview-project', archive}, url.origin, [archive]);
    };
    preview.addEventListener('close', dispose, {once: true});
    view.addEventListener('message', send);
    document.body.append(preview);
    preview.showModal();
}
